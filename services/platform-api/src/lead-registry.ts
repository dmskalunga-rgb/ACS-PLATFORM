import { createHash } from 'node:crypto';
import type { Lead, LeadCreate, LeadEnvelope, LeadListEnvelope, LeadUpdate } from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const LEAD_READ = 'commercial.lead.read';
export const LEAD_CREATE = 'commercial.lead.create';
export const LEAD_UPDATE = 'commercial.lead.update';
export const LEAD_ADMIN = 'commercial.lead.admin';
export interface LeadMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}
export interface LeadMutationInput {
  readonly actorUserId: string;
  readonly contextToken: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly tenantId: string;
}
export interface LeadRepository {
  create(input: LeadMutationInput & LeadCreate): Promise<{ lead: Lead; replay: boolean }>;
  get(contextToken: string, tenantId: string, leadId: string): Promise<Lead | null>;
  list(
    contextToken: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ leads: Lead[]; nextCursor: string | null }>;
  update(
    input: LeadMutationInput & LeadUpdate & { leadId: string; action: string },
  ): Promise<{ lead: Lead; replay: boolean }>;
}
export type LeadFailureCode =
  'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'STALE_VERSION' | 'IDEMPOTENCY_CONFLICT';
export class LeadRegistryFailure extends Error {
  constructor(
    readonly code: LeadFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export class LeadRegistryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly leads: LeadRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async authorize(
    header: string | undefined,
    tenantId: string,
    action: string,
    metadata: LeadMetadata,
  ) {
    let identity;
    try {
      identity = await this.identity.authenticate(header);
    } catch (error) {
      await this.securityAudit.recordDenied({
        action,
        correlationId: metadata.correlationId,
        reasonCode:
          error instanceof IdentityAuthenticationError
            ? error.reasonCode
            : 'IDENTITY_PROVIDER_ERROR',
        requestId: metadata.requestId,
        requestedTenantId: tenantId,
      });
      throw new LeadRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (identity === null)
      throw new LeadRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (membership === null)
      return this.deny(identity.subject, tenantId, action, metadata, 'MEMBERSHIP_DENIED');
    const decision = await this.authorization.authorize({
      action,
      resource: 'commercial:lead-registry',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed)
      return this.deny(identity.subject, tenantId, action, metadata, 'PERMISSION_DENIED');
    const issued = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (issued === null)
      return this.deny(identity.subject, tenantId, action, metadata, 'CONTEXT_ISSUANCE_DENIED');
    return { ...issued, subject: identity.subject };
  }
  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    metadata: LeadMetadata,
    reasonCode: string,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode,
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
    throw new LeadRegistryFailure('FORBIDDEN', 'The requested lead operation is unavailable.');
  }
  async create(
    header: string | undefined,
    tenantId: string,
    key: string,
    value: LeadCreate,
    metadata: LeadMetadata,
  ): Promise<LeadEnvelope> {
    const context = await this.authorize(header, tenantId, LEAD_CREATE, metadata);
    try {
      const result = await this.leads.create({
        ...value,
        actorUserId: context.userId,
        contextToken: context.contextToken,
        correlationId: metadata.correlationId,
        idempotencyKey: key,
        requestHash: hash(value),
        requestId: metadata.requestId,
        tenantId,
      });
      return envelope(result.lead, metadata, result.replay);
    } catch (error) {
      await this.record(error, context.subject, tenantId, LEAD_CREATE, metadata);
      throw error;
    }
  }
  async get(
    header: string | undefined,
    tenantId: string,
    leadId: string,
    metadata: LeadMetadata,
  ): Promise<LeadEnvelope> {
    const context = await this.authorize(header, tenantId, LEAD_READ, metadata);
    const lead = await this.leads.get(context.contextToken, tenantId, leadId);
    if (!lead) throw new LeadRegistryFailure('NOT_FOUND', 'Lead was not found.');
    return envelope(lead, metadata);
  }
  async list(
    header: string | undefined,
    tenantId: string,
    limit: number,
    cursor: string | undefined,
    metadata: LeadMetadata,
  ): Promise<LeadListEnvelope> {
    const context = await this.authorize(header, tenantId, LEAD_READ, metadata);
    const result = await this.leads.list(context.contextToken, tenantId, limit, cursor);
    return {
      data: result.leads,
      meta: {
        request_id: metadata.requestId,
        correlation_id: metadata.correlationId,
        next_cursor: result.nextCursor,
      },
    };
  }
  async update(
    header: string | undefined,
    tenantId: string,
    leadId: string,
    key: string,
    value: LeadUpdate,
    metadata: LeadMetadata,
  ): Promise<LeadEnvelope> {
    const action = value.status === undefined ? LEAD_UPDATE : LEAD_ADMIN;
    const context = await this.authorize(header, tenantId, action, metadata);
    try {
      const result = await this.leads.update({
        ...value,
        action,
        actorUserId: context.userId,
        contextToken: context.contextToken,
        correlationId: metadata.correlationId,
        idempotencyKey: key,
        leadId,
        requestHash: hash({ leadId, ...value }),
        requestId: metadata.requestId,
        tenantId,
      });
      return envelope(result.lead, metadata, result.replay);
    } catch (error) {
      await this.record(error, context.subject, tenantId, action, metadata);
      throw error;
    }
  }
  private async record(
    error: unknown,
    subject: string,
    tenantId: string,
    action: string,
    metadata: LeadMetadata,
  ) {
    if (error instanceof LeadRegistryFailure)
      await this.securityAudit.recordDenied({
        action,
        actorSubject: subject,
        correlationId: metadata.correlationId,
        reasonCode: error.code,
        requestId: metadata.requestId,
        requestedTenantId: tenantId,
      });
  }
}
function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function envelope(lead: Lead, metadata: LeadMetadata, replay?: boolean): LeadEnvelope {
  return {
    data: lead,
    meta: {
      request_id: metadata.requestId,
      correlation_id: metadata.correlationId,
      ...(replay === undefined ? {} : { idempotent_replay: replay }),
    },
  };
}
