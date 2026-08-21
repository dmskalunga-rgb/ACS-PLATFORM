import { createHash } from 'node:crypto';
import type { AuthorizationPort } from '@acs/foundation';
import type {
  Opportunity,
  OpportunityCreate,
  OpportunityEnvelope,
  OpportunityListEnvelope,
  OpportunityUpdate,
} from '@acs/contracts';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const OPPORTUNITY_READ = 'commercial.opportunity.read';
export const OPPORTUNITY_CREATE = 'commercial.opportunity.create';
export const OPPORTUNITY_UPDATE = 'commercial.opportunity.update';
export const OPPORTUNITY_ADMIN = 'commercial.opportunity.admin';
export interface OpportunityMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}
export interface OpportunityMutation {
  readonly actorUserId: string;
  readonly contextToken: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly tenantId: string;
}
export interface OpportunityRepository {
  create(
    input: OpportunityMutation & OpportunityCreate,
  ): Promise<{ opportunity: Opportunity; replay: boolean }>;
  get(token: string, tenantId: string, opportunityId: string): Promise<Opportunity | null>;
  list(
    token: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ opportunities: Opportunity[]; nextCursor: string | null }>;
  update(
    input: OpportunityMutation & OpportunityUpdate & { opportunityId: string; action: string },
  ): Promise<{ opportunity: Opportunity; replay: boolean }>;
}
export type OpportunityFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DUPLICATE_OPPORTUNITY_CODE'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_REFERENCE'
  | 'INVALID_TRANSITION'
  | 'TERMINAL_OPPORTUNITY';
export class OpportunityRegistryFailure extends Error {
  constructor(
    readonly code: OpportunityFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export class OpportunityRegistryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly opportunities: OpportunityRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async authorize(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: OpportunityMetadata,
  ) {
    let identity;
    try {
      identity = await this.identity.authenticate(header);
    } catch (error) {
      await this.securityAudit.recordDenied({
        action,
        correlationId: meta.correlationId,
        reasonCode:
          error instanceof IdentityAuthenticationError
            ? error.reasonCode
            : 'IDENTITY_PROVIDER_ERROR',
        requestId: meta.requestId,
        requestedTenantId: tenantId,
      });
      throw new OpportunityRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!identity)
      throw new OpportunityRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (!membership)
      return this.deny(identity.subject, tenantId, action, meta, 'MEMBERSHIP_DENIED');
    const decision = await this.authorization.authorize({
      action,
      resource: 'commercial:opportunity-registry',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed)
      return this.deny(identity.subject, tenantId, action, meta, 'PERMISSION_DENIED');
    const issued = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (!issued)
      return this.deny(identity.subject, tenantId, action, meta, 'CONTEXT_ISSUANCE_DENIED');
    return issued;
  }
  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    meta: OpportunityMetadata,
    reasonCode: string,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: meta.correlationId,
      reasonCode,
      requestId: meta.requestId,
      requestedTenantId: tenantId,
    });
    throw new OpportunityRegistryFailure(
      'FORBIDDEN',
      'The requested opportunity operation is unavailable.',
    );
  }
  async create(
    header: string | undefined,
    tenantId: string,
    key: string,
    value: OpportunityCreate,
    meta: OpportunityMetadata,
  ): Promise<OpportunityEnvelope> {
    const c = await this.authorize(header, tenantId, OPPORTUNITY_CREATE, meta);
    const r = await this.opportunities.create({
      ...value,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      requestHash: hash(value),
      requestId: meta.requestId,
      tenantId,
    });
    return envelope(r.opportunity, meta, r.replay);
  }
  async get(
    header: string | undefined,
    tenantId: string,
    opportunityId: string,
    meta: OpportunityMetadata,
  ): Promise<OpportunityEnvelope> {
    const c = await this.authorize(header, tenantId, OPPORTUNITY_READ, meta);
    const v = await this.opportunities.get(c.contextToken, tenantId, opportunityId);
    if (!v) throw new OpportunityRegistryFailure('NOT_FOUND', 'Opportunity was not found.');
    return envelope(v, meta);
  }
  async list(
    header: string | undefined,
    tenantId: string,
    limit: number,
    cursor: string | undefined,
    meta: OpportunityMetadata,
  ): Promise<OpportunityListEnvelope> {
    const c = await this.authorize(header, tenantId, OPPORTUNITY_READ, meta);
    const v = await this.opportunities.list(c.contextToken, tenantId, limit, cursor);
    return {
      data: v.opportunities,
      meta: {
        request_id: meta.requestId,
        correlation_id: meta.correlationId,
        next_cursor: v.nextCursor,
      },
    };
  }
  async update(
    header: string | undefined,
    tenantId: string,
    opportunityId: string,
    key: string,
    value: OpportunityUpdate,
    meta: OpportunityMetadata,
  ): Promise<OpportunityEnvelope> {
    const action = value.stage === undefined ? OPPORTUNITY_UPDATE : OPPORTUNITY_ADMIN;
    const c = await this.authorize(header, tenantId, action, meta);
    const r = await this.opportunities.update({
      ...value,
      action,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      opportunityId,
      requestHash: hash({ opportunityId, ...value }),
      requestId: meta.requestId,
      tenantId,
    });
    return envelope(r.opportunity, meta, r.replay);
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const envelope = (
  data: Opportunity,
  meta: OpportunityMetadata,
  replay?: boolean,
): OpportunityEnvelope => ({
  data,
  meta: {
    request_id: meta.requestId,
    correlation_id: meta.correlationId,
    ...(replay === undefined ? {} : { idempotent_replay: replay }),
  },
});
