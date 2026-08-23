import { createHash } from 'node:crypto';
import type {
  Entitlement,
  EntitlementAssign,
  EntitlementCreate,
  EntitlementTransition,
  EntitlementUpdate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const ENTITLEMENT_READ = 'commercial.entitlement.read';
export const ENTITLEMENT_CREATE = 'commercial.entitlement.create';
export const ENTITLEMENT_UPDATE = 'commercial.entitlement.update';
export const ENTITLEMENT_ASSIGN = 'commercial.entitlement.assign';
export const ENTITLEMENT_REQUEST_ACTIVATION = 'commercial.entitlement.request_activation';
export const ENTITLEMENT_ACTIVATE = 'commercial.entitlement.activate';
export const ENTITLEMENT_SUSPEND = 'commercial.entitlement.suspend';
export const ENTITLEMENT_RESUME = 'commercial.entitlement.resume';
export const ENTITLEMENT_CANCEL = 'commercial.entitlement.cancel';
export const ENTITLEMENT_TERMINATE = 'commercial.entitlement.terminate';

export interface EntitlementMutation {
  actorUserId: string;
  contextToken: string;
  correlationId: string;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  tenantId: string;
  action: string;
}
export interface EntitlementRepository {
  create(
    input: EntitlementMutation & EntitlementCreate,
  ): Promise<{ entitlement: Entitlement; replay: boolean }>;
  get(token: string, tenantId: string, id: string): Promise<Entitlement | null>;
  list(
    token: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ entitlements: Entitlement[]; nextCursor: string | null }>;
  update(
    input: EntitlementMutation & EntitlementUpdate & { entitlementId: string },
  ): Promise<{ entitlement: Entitlement; replay: boolean }>;
  assign(
    input: EntitlementMutation & EntitlementAssign & { entitlementId: string },
  ): Promise<{ entitlement: Entitlement; replay: boolean }>;
  transition(
    input: EntitlementMutation &
      EntitlementTransition & { entitlementId: string; transition: string },
  ): Promise<{ entitlement: Entitlement; replay: boolean }>;
}
export type EntitlementFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DUPLICATE_ENTITLEMENT'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_REFERENCE'
  | 'INVALID_TRANSITION'
  | 'TERMINAL_ENTITLEMENT'
  | 'INVALID_VALUE'
  | 'SOD_DENIED';
export class EntitlementRegistryFailure extends Error {
  constructor(
    readonly code: EntitlementFailureCode,
    message: string,
  ) {
    super(message);
  }
}
type Metadata = { correlationId: string; requestId: string };

export class EntitlementRegistryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly entitlements: EntitlementRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async context(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: Metadata,
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
      throw new EntitlementRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!identity)
      throw new EntitlementRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (!membership)
      throw new EntitlementRegistryFailure(
        'FORBIDDEN',
        'The requested entitlement operation is unavailable.',
      );
    const allowed = await this.authorization.authorize({
      action,
      resource: 'commercial:entitlement-registry',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!allowed.allowed)
      throw new EntitlementRegistryFailure(
        'FORBIDDEN',
        'The requested entitlement operation is unavailable.',
      );
    const context = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (!context)
      throw new EntitlementRegistryFailure(
        'FORBIDDEN',
        'The requested entitlement operation is unavailable.',
      );
    return context;
  }
  private envelope(data: Entitlement, meta: Metadata, replay?: boolean) {
    return {
      data,
      meta: {
        request_id: meta.requestId,
        correlation_id: meta.correlationId,
        ...(replay === undefined ? {} : { idempotent_replay: replay }),
      },
    };
  }
  async create(
    h: string | undefined,
    t: string,
    key: string,
    value: EntitlementCreate,
    meta: Metadata,
  ) {
    const c = await this.context(h, t, ENTITLEMENT_CREATE, meta);
    const r = await this.entitlements.create({
      ...value,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      requestHash: hash(value),
      requestId: meta.requestId,
      tenantId: t,
      action: ENTITLEMENT_CREATE,
    });
    return this.envelope(r.entitlement, meta, r.replay);
  }
  async get(h: string | undefined, t: string, id: string, meta: Metadata) {
    const c = await this.context(h, t, ENTITLEMENT_READ, meta);
    const r = await this.entitlements.get(c.contextToken, t, id);
    if (!r) throw new EntitlementRegistryFailure('NOT_FOUND', 'Entitlement was not found.');
    return this.envelope(r, meta);
  }
  async list(
    h: string | undefined,
    t: string,
    limit: number,
    cursor: string | undefined,
    meta: Metadata,
  ) {
    const c = await this.context(h, t, ENTITLEMENT_READ, meta);
    const r = await this.entitlements.list(c.contextToken, t, limit, cursor);
    return {
      data: r.entitlements,
      meta: {
        request_id: meta.requestId,
        correlation_id: meta.correlationId,
        next_cursor: r.nextCursor,
      },
    };
  }
  async update(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    value: EntitlementUpdate,
    meta: Metadata,
  ) {
    return this.mutate(h, t, id, key, ENTITLEMENT_UPDATE, value, meta, (v) =>
      this.entitlements.update(v),
    );
  }
  async assign(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    value: EntitlementAssign,
    meta: Metadata,
  ) {
    return this.mutate(h, t, id, key, ENTITLEMENT_ASSIGN, value, meta, (v) =>
      this.entitlements.assign(v),
    );
  }
  async transition(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    transition: string,
    action: string,
    value: EntitlementTransition,
    meta: Metadata,
  ) {
    return this.mutate(h, t, id, key, action, { ...value, transition }, meta, (v) =>
      this.entitlements.transition(v),
    );
  }
  async mutate<T extends object>(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    action: string,
    value: T,
    meta: Metadata,
    fn: (
      v: EntitlementMutation & T & { entitlementId: string },
    ) => Promise<{ entitlement: Entitlement; replay: boolean }>,
  ) {
    const c = await this.context(h, t, action, meta);
    const r = await fn({
      ...value,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      requestHash: hash({ id, ...value }),
      requestId: meta.requestId,
      tenantId: t,
      entitlementId: id,
      action,
    });
    return this.envelope(r.entitlement, meta, r.replay);
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
