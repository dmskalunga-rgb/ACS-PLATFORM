import { createHash } from 'node:crypto';
import type { AuthorizationPort } from '@acs/foundation';
import type {
  Partner,
  PartnerCreate,
  PartnerEnvelope,
  PartnerListEnvelope,
  PartnerUpdate,
} from '@acs/contracts';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const PARTNER_READ = 'commercial.partner.read';
export const PARTNER_CREATE = 'commercial.partner.create';
export const PARTNER_UPDATE = 'commercial.partner.update';
export const PARTNER_ADMIN = 'commercial.partner.admin';
export interface PartnerMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}
export interface PartnerMutation {
  readonly actorUserId: string;
  readonly contextToken: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly tenantId: string;
}
export interface PartnerRepository {
  create(input: PartnerMutation & PartnerCreate): Promise<{ partner: Partner; replay: boolean }>;
  get(token: string, tenantId: string, partnerId: string): Promise<Partner | null>;
  list(
    token: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ partners: Partner[]; nextCursor: string | null }>;
  update(
    input: PartnerMutation & PartnerUpdate & { partnerId: string; action: string },
  ): Promise<{ partner: Partner; replay: boolean }>;
}
export type PartnerFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DUPLICATE_PARTNER_CODE'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT';
export class PartnerRegistryFailure extends Error {
  constructor(
    readonly code: PartnerFailureCode,
    message: string,
  ) {
    super(message);
  }
}
export class PartnerRegistryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly partners: PartnerRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async authorize(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: PartnerMetadata,
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
      throw new PartnerRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!identity)
      throw new PartnerRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (!membership)
      return this.deny(identity.subject, tenantId, action, meta, 'MEMBERSHIP_DENIED');
    const decision = await this.authorization.authorize({
      action,
      resource: 'commercial:partner-registry',
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
    meta: PartnerMetadata,
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
    throw new PartnerRegistryFailure(
      'FORBIDDEN',
      'The requested partner operation is unavailable.',
    );
  }
  async create(
    header: string | undefined,
    tenantId: string,
    key: string,
    value: PartnerCreate,
    meta: PartnerMetadata,
  ): Promise<PartnerEnvelope> {
    const c = await this.authorize(header, tenantId, PARTNER_CREATE, meta);
    const r = await this.partners.create({
      ...value,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      requestHash: hash(value),
      requestId: meta.requestId,
      tenantId,
    });
    return envelope(r.partner, meta, r.replay);
  }
  async get(
    header: string | undefined,
    tenantId: string,
    partnerId: string,
    meta: PartnerMetadata,
  ): Promise<PartnerEnvelope> {
    const c = await this.authorize(header, tenantId, PARTNER_READ, meta);
    const v = await this.partners.get(c.contextToken, tenantId, partnerId);
    if (!v) throw new PartnerRegistryFailure('NOT_FOUND', 'Partner was not found.');
    return envelope(v, meta);
  }
  async list(
    header: string | undefined,
    tenantId: string,
    limit: number,
    cursor: string | undefined,
    meta: PartnerMetadata,
  ): Promise<PartnerListEnvelope> {
    const c = await this.authorize(header, tenantId, PARTNER_READ, meta);
    const v = await this.partners.list(c.contextToken, tenantId, limit, cursor);
    return {
      data: v.partners,
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
    partnerId: string,
    key: string,
    value: PartnerUpdate,
    meta: PartnerMetadata,
  ): Promise<PartnerEnvelope> {
    const action = value.status === undefined ? PARTNER_UPDATE : PARTNER_ADMIN;
    const c = await this.authorize(header, tenantId, action, meta);
    const r = await this.partners.update({
      ...value,
      action,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      partnerId,
      requestHash: hash({ partnerId, ...value }),
      requestId: meta.requestId,
      tenantId,
    });
    return envelope(r.partner, meta, r.replay);
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const envelope = (data: Partner, meta: PartnerMetadata, replay?: boolean): PartnerEnvelope => ({
  data,
  meta: {
    request_id: meta.requestId,
    correlation_id: meta.correlationId,
    ...(replay === undefined ? {} : { idempotent_replay: replay }),
  },
});
