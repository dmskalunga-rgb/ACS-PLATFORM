import { createHash } from 'node:crypto';
import type {
  Subscription,
  SubscriptionAssign,
  SubscriptionCreate,
  SubscriptionRenew,
  SubscriptionTransition,
  SubscriptionUpdate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const SUBSCRIPTION_READ = 'commercial.subscription.read';
export const SUBSCRIPTION_CREATE = 'commercial.subscription.create';
export const SUBSCRIPTION_UPDATE = 'commercial.subscription.update';
export const SUBSCRIPTION_ASSIGN = 'commercial.subscription.assign';
export const SUBSCRIPTION_REQUEST_ACTIVATION = 'commercial.subscription.request_activation';
export const SUBSCRIPTION_ACTIVATE = 'commercial.subscription.activate';
export const SUBSCRIPTION_SUSPEND = 'commercial.subscription.suspend';
export const SUBSCRIPTION_RESUME = 'commercial.subscription.resume';
export const SUBSCRIPTION_CANCEL = 'commercial.subscription.cancel';
export const SUBSCRIPTION_TERMINATE = 'commercial.subscription.terminate';
export const SUBSCRIPTION_RENEW = 'commercial.subscription.renew';

export interface SubscriptionMetadata {
  correlationId: string;
  requestId: string;
}
export interface SubscriptionMutation {
  actorUserId: string;
  contextToken: string;
  correlationId: string;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  tenantId: string;
  action: string;
}
export interface SubscriptionRepository {
  create(
    input: SubscriptionMutation & SubscriptionCreate,
  ): Promise<{ subscription: Subscription; replay: boolean }>;
  get(token: string, tenantId: string, id: string): Promise<Subscription | null>;
  list(
    token: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ subscriptions: Subscription[]; nextCursor: string | null }>;
  update(
    input: SubscriptionMutation & SubscriptionUpdate & { subscriptionId: string },
  ): Promise<{ subscription: Subscription; replay: boolean }>;
  assign(
    input: SubscriptionMutation & SubscriptionAssign & { subscriptionId: string },
  ): Promise<{ subscription: Subscription; replay: boolean }>;
  transition(
    input: SubscriptionMutation &
      SubscriptionTransition & { subscriptionId: string; transition: string },
  ): Promise<{ subscription: Subscription; replay: boolean }>;
  renew(
    input: SubscriptionMutation & SubscriptionRenew & { subscriptionId: string },
  ): Promise<{ subscription: Subscription; replay: boolean }>;
}
export type SubscriptionFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DUPLICATE_SUBSCRIPTION'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_REFERENCE'
  | 'INVALID_TRANSITION'
  | 'TERMINAL_SUBSCRIPTION'
  | 'INVALID_VALUE'
  | 'SOD_DENIED';
export class SubscriptionRegistryFailure extends Error {
  constructor(
    readonly code: SubscriptionFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export class SubscriptionRegistryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async context(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: SubscriptionMetadata,
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
      throw new SubscriptionRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!identity)
      throw new SubscriptionRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (!membership)
      return this.deny(identity.subject, tenantId, action, meta, 'MEMBERSHIP_DENIED');
    const decision = await this.authorization.authorize({
      action,
      resource: 'commercial:subscription-registry',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed)
      return this.deny(identity.subject, tenantId, action, meta, 'PERMISSION_DENIED');
    const context = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (!context)
      return this.deny(identity.subject, tenantId, action, meta, 'CONTEXT_ISSUANCE_DENIED');
    return context;
  }
  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    meta: SubscriptionMetadata,
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
    throw new SubscriptionRegistryFailure(
      'FORBIDDEN',
      'The requested subscription operation is unavailable.',
    );
  }
  private envelope(data: Subscription, meta: SubscriptionMetadata, replay?: boolean) {
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
    value: SubscriptionCreate,
    meta: SubscriptionMetadata,
  ) {
    const c = await this.context(h, t, SUBSCRIPTION_CREATE, meta);
    const r = await this.subscriptions.create({
      ...value,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      requestHash: hash(value),
      requestId: meta.requestId,
      tenantId: t,
      action: SUBSCRIPTION_CREATE,
    });
    return this.envelope(r.subscription, meta, r.replay);
  }
  async get(h: string | undefined, t: string, id: string, meta: SubscriptionMetadata) {
    const c = await this.context(h, t, SUBSCRIPTION_READ, meta);
    const v = await this.subscriptions.get(c.contextToken, t, id);
    if (!v) throw new SubscriptionRegistryFailure('NOT_FOUND', 'Subscription was not found.');
    return this.envelope(v, meta);
  }
  async list(
    h: string | undefined,
    t: string,
    limit: number,
    cursor: string | undefined,
    meta: SubscriptionMetadata,
  ) {
    const c = await this.context(h, t, SUBSCRIPTION_READ, meta);
    const r = await this.subscriptions.list(c.contextToken, t, limit, cursor);
    return {
      data: r.subscriptions,
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
    value: SubscriptionUpdate,
    meta: SubscriptionMetadata,
  ) {
    return this.mutate(h, t, id, key, SUBSCRIPTION_UPDATE, value, meta, (input) =>
      this.subscriptions.update(input),
    );
  }
  async assign(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    value: SubscriptionAssign,
    meta: SubscriptionMetadata,
  ) {
    return this.mutate(h, t, id, key, SUBSCRIPTION_ASSIGN, value, meta, (input) =>
      this.subscriptions.assign(input),
    );
  }
  async transition(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    transition: string,
    action: string,
    value: SubscriptionTransition,
    meta: SubscriptionMetadata,
  ) {
    return this.mutate(h, t, id, key, action, { ...value, transition }, meta, (input) =>
      this.subscriptions.transition(input),
    );
  }
  async renew(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    value: SubscriptionRenew,
    meta: SubscriptionMetadata,
  ) {
    return this.mutate(h, t, id, key, SUBSCRIPTION_RENEW, value, meta, (input) =>
      this.subscriptions.renew(input),
    );
  }
  async mutate<T extends object>(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    action: string,
    value: T,
    meta: SubscriptionMetadata,
    fn: (
      v: SubscriptionMutation & T & { subscriptionId: string },
    ) => Promise<{ subscription: Subscription; replay: boolean }>,
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
      subscriptionId: id,
      action,
    });
    return this.envelope(r.subscription, meta, r.replay);
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
