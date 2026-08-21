import { createHash } from 'node:crypto';
import type { AuthorizationPort } from '@acs/foundation';
import type {
  Plan,
  PlanCreate,
  PlanEnvelope,
  PlanFeature,
  PlanFeatureCreate,
  PlanFeatureEnvelope,
  PlanFeatureListEnvelope,
  PlanFeatureUpdate,
  PlanListEnvelope,
  PlanUpdate,
} from '@acs/contracts';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const PLAN_READ = 'commercial.plan.read';
export const PLAN_CREATE = 'commercial.plan.create';
export const PLAN_UPDATE = 'commercial.plan.update';
export const PLAN_ADMIN = 'commercial.plan.admin';
export interface PlanMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}
export interface PlanMutation {
  readonly actorUserId: string;
  readonly contextToken: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly tenantId: string;
}
export interface PlanRepository {
  create(input: PlanMutation & PlanCreate): Promise<{ plan: Plan; replay: boolean }>;
  get(token: string, tenantId: string, planId: string): Promise<Plan | null>;
  list(
    token: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ plans: Plan[]; nextCursor: string | null }>;
  update(
    input: PlanMutation & PlanUpdate & { planId: string; action: string },
  ): Promise<{ plan: Plan; replay: boolean }>;
  createFeature(
    input: PlanMutation & PlanFeatureCreate & { planId: string },
  ): Promise<{ feature: PlanFeature; replay: boolean }>;
  getFeature(
    token: string,
    tenantId: string,
    planId: string,
    featureId: string,
  ): Promise<PlanFeature | null>;
  listFeatures(
    token: string,
    tenantId: string,
    planId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ features: PlanFeature[]; nextCursor: string | null }>;
  updateFeature(
    input: PlanMutation & PlanFeatureUpdate & { planId: string; featureId: string },
  ): Promise<{ feature: PlanFeature; replay: boolean }>;
}
export type PlanFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PLAN_INACTIVE';
export class PlanCatalogFailure extends Error {
  constructor(
    readonly code: PlanFailureCode,
    message: string,
  ) {
    super(message);
  }
}
export class PlanCatalogService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly plans: PlanRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async authorize(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: PlanMetadata,
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
      throw new PlanCatalogFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!identity) throw new PlanCatalogFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (!membership)
      return this.deny(identity.subject, tenantId, action, meta, 'MEMBERSHIP_DENIED');
    const decision = await this.authorization.authorize({
      action,
      resource: 'commercial:plan-catalog',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed)
      return this.deny(identity.subject, tenantId, action, meta, 'PERMISSION_DENIED');
    const issued = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (!issued)
      return this.deny(identity.subject, tenantId, action, meta, 'CONTEXT_ISSUANCE_DENIED');
    return { ...issued, subject: identity.subject };
  }
  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    meta: PlanMetadata,
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
    throw new PlanCatalogFailure('FORBIDDEN', 'The requested plan operation is unavailable.');
  }
  async create(
    header: string | undefined,
    tenantId: string,
    key: string,
    value: PlanCreate,
    meta: PlanMetadata,
  ): Promise<PlanEnvelope> {
    const c = await this.authorize(header, tenantId, PLAN_CREATE, meta);
    const r = await this.plans.create({
      ...value,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      requestHash: hash(value),
      requestId: meta.requestId,
      tenantId,
    });
    return planEnvelope(r.plan, meta, r.replay);
  }
  async get(
    header: string | undefined,
    tenantId: string,
    planId: string,
    meta: PlanMetadata,
  ): Promise<PlanEnvelope> {
    const c = await this.authorize(header, tenantId, PLAN_READ, meta);
    const v = await this.plans.get(c.contextToken, tenantId, planId);
    if (!v) throw new PlanCatalogFailure('NOT_FOUND', 'Plan was not found.');
    return planEnvelope(v, meta);
  }
  async list(
    header: string | undefined,
    tenantId: string,
    limit: number,
    cursor: string | undefined,
    meta: PlanMetadata,
  ): Promise<PlanListEnvelope> {
    const c = await this.authorize(header, tenantId, PLAN_READ, meta);
    const v = await this.plans.list(c.contextToken, tenantId, limit, cursor);
    return {
      data: v.plans,
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
    planId: string,
    key: string,
    value: PlanUpdate,
    meta: PlanMetadata,
  ): Promise<PlanEnvelope> {
    const action = value.status === undefined ? PLAN_UPDATE : PLAN_ADMIN;
    const c = await this.authorize(header, tenantId, action, meta);
    const r = await this.plans.update({
      ...value,
      action,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      planId,
      requestHash: hash({ planId, ...value }),
      requestId: meta.requestId,
      tenantId,
    });
    return planEnvelope(r.plan, meta, r.replay);
  }
  async createFeature(
    header: string | undefined,
    tenantId: string,
    planId: string,
    key: string,
    value: PlanFeatureCreate,
    meta: PlanMetadata,
  ): Promise<PlanFeatureEnvelope> {
    const c = await this.authorize(header, tenantId, PLAN_CREATE, meta);
    const r = await this.plans.createFeature({
      ...value,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      planId,
      requestHash: hash({ planId, ...value }),
      requestId: meta.requestId,
      tenantId,
    });
    return featureEnvelope(r.feature, meta, r.replay);
  }
  async getFeature(
    header: string | undefined,
    tenantId: string,
    planId: string,
    featureId: string,
    meta: PlanMetadata,
  ): Promise<PlanFeatureEnvelope> {
    const c = await this.authorize(header, tenantId, PLAN_READ, meta);
    const v = await this.plans.getFeature(c.contextToken, tenantId, planId, featureId);
    if (!v) throw new PlanCatalogFailure('NOT_FOUND', 'Plan feature was not found.');
    return featureEnvelope(v, meta);
  }
  async listFeatures(
    header: string | undefined,
    tenantId: string,
    planId: string,
    limit: number,
    cursor: string | undefined,
    meta: PlanMetadata,
  ): Promise<PlanFeatureListEnvelope> {
    const c = await this.authorize(header, tenantId, PLAN_READ, meta);
    const v = await this.plans.listFeatures(c.contextToken, tenantId, planId, limit, cursor);
    return {
      data: v.features,
      meta: {
        request_id: meta.requestId,
        correlation_id: meta.correlationId,
        next_cursor: v.nextCursor,
      },
    };
  }
  async updateFeature(
    header: string | undefined,
    tenantId: string,
    planId: string,
    featureId: string,
    key: string,
    value: PlanFeatureUpdate,
    meta: PlanMetadata,
  ): Promise<PlanFeatureEnvelope> {
    const c = await this.authorize(header, tenantId, PLAN_UPDATE, meta);
    const r = await this.plans.updateFeature({
      ...value,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      featureId,
      planId,
      requestHash: hash({ planId, featureId, ...value }),
      requestId: meta.requestId,
      tenantId,
    });
    return featureEnvelope(r.feature, meta, r.replay);
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const planEnvelope = (data: Plan, meta: PlanMetadata, replay?: boolean): PlanEnvelope => ({
  data,
  meta: {
    request_id: meta.requestId,
    correlation_id: meta.correlationId,
    ...(replay === undefined ? {} : { idempotent_replay: replay }),
  },
});
const featureEnvelope = (
  data: PlanFeature,
  meta: PlanMetadata,
  replay?: boolean,
): PlanFeatureEnvelope => ({
  data,
  meta: {
    request_id: meta.requestId,
    correlation_id: meta.correlationId,
    ...(replay === undefined ? {} : { idempotent_replay: replay }),
  },
});
