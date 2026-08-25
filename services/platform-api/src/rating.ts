import { createHash } from 'node:crypto';
import type {
  RatePlanCreate,
  RatePlanDraftUpdate,
  RatingApplicabilityCreate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const RATING_READ = 'commercial.rating.read';
export const RATE_PLAN_CREATE = 'commercial.rating.rate-plan.create';
export const RATE_PLAN_UPDATE = 'commercial.rating.rate-plan.update';
export const RATE_PLAN_APPROVE = 'commercial.rating.rate-plan.approve';
export const RATE_PLAN_ACTIVATE = 'commercial.rating.rate-plan.activate';
export const RATING_EXECUTE = 'commercial.rating.execute';
export const RATING_RERATE = 'commercial.rating.rerate';

export type RatingFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'INVALID_REFERENCE'
  | 'SOD_DENIED';
export class RatingFailure extends Error {
  constructor(
    readonly code: RatingFailureCode,
    message: string,
  ) {
    super(message);
  }
}
export type RatingMetadata = { correlationId: string; requestId: string };
export type RatingMutation = RatingMetadata & {
  action: string;
  actorUserId: string;
  contextToken: string;
  idempotencyKey: string;
  requestHash: string;
  tenantId: string;
};
export type RatingExecution = RatingMutation & {
  usageAggregateId: string;
  idempotencyKey: string;
  requestHash: string;
};
export interface RatingRepository {
  create(input: RatingMutation & RatePlanCreate): Promise<unknown>;
  list(token: string, tenantId: string): Promise<unknown[]>;
  get(token: string, tenantId: string, id: string): Promise<unknown>;
  update(input: RatingMutation & RatePlanDraftUpdate & { ratePlanId: string }): Promise<unknown>;
  transition(
    input: RatingMutation & {
      ratePlanId: string;
      expectedVersion: number;
      transition: 'submit' | 'approve' | 'activate' | 'supersede' | 'retire';
    },
  ): Promise<unknown>;
  createApplicability(input: RatingMutation & RatingApplicabilityCreate): Promise<unknown>;
  listFacts(token: string, tenantId: string): Promise<unknown[]>;
  execute(input: RatingExecution): Promise<{ fact: unknown; replay: boolean }>;
  rerate(
    input: RatingExecution & { ratedFactId: string; reason: string },
  ): Promise<{ fact: unknown; replay: boolean }>;
}
export class RatingService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly repository: RatingRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async context(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: RatingMetadata,
  ) {
    let principal;
    try {
      principal = await this.identity.authenticate(header);
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
      throw new RatingFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!principal) throw new RatingFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(principal.subject, tenantId);
    if (!membership) throw new RatingFailure('FORBIDDEN', 'Rating operation is unavailable.');
    const allowed = await this.authorization.authorize({
      action,
      resource: 'commercial:rating',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!allowed.allowed) throw new RatingFailure('FORBIDDEN', 'Rating operation is unavailable.');
    const context = await this.contexts.issueContext(principal.subject, tenantId, action);
    if (!context) throw new RatingFailure('FORBIDDEN', 'Rating operation is unavailable.');
    return context;
  }
  private async mutation(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: RatingMetadata,
  ): Promise<Omit<RatingMutation, 'idempotencyKey' | 'requestHash'>> {
    const context = await this.context(header, tenantId, action, meta);
    return {
      ...meta,
      action,
      actorUserId: context.userId,
      contextToken: context.contextToken,
      tenantId,
    };
  }
  async create(
    header: string | undefined,
    tenantId: string,
    idempotencyKey: string,
    value: RatePlanCreate,
    meta: RatingMetadata,
  ) {
    const requestHash = stableRatingHash({ action: RATE_PLAN_CREATE, value });
    return this.repository.create({
      ...(await this.mutation(header, tenantId, RATE_PLAN_CREATE, meta)),
      ...value,
      idempotencyKey,
      requestHash,
    });
  }
  async list(header: string | undefined, tenantId: string, meta: RatingMetadata) {
    const c = await this.context(header, tenantId, RATING_READ, meta);
    return this.repository.list(c.contextToken, tenantId);
  }
  async get(header: string | undefined, tenantId: string, id: string, meta: RatingMetadata) {
    const c = await this.context(header, tenantId, RATING_READ, meta);
    const value = await this.repository.get(c.contextToken, tenantId, id);
    if (!value) throw new RatingFailure('NOT_FOUND', 'Rate Plan was not found.');
    return value;
  }
  async update(
    header: string | undefined,
    tenantId: string,
    id: string,
    idempotencyKey: string,
    value: RatePlanDraftUpdate,
    meta: RatingMetadata,
  ) {
    const requestHash = stableRatingHash({ action: RATE_PLAN_UPDATE, id, value });
    return this.repository.update({
      ...(await this.mutation(header, tenantId, RATE_PLAN_UPDATE, meta)),
      ...value,
      idempotencyKey,
      ratePlanId: id,
      requestHash,
    });
  }
  async transition(
    header: string | undefined,
    tenantId: string,
    id: string,
    transition: 'submit' | 'approve' | 'activate' | 'supersede' | 'retire',
    expectedVersion: number,
    idempotencyKey: string,
    meta: RatingMetadata,
  ) {
    const action =
      transition === 'approve'
        ? RATE_PLAN_APPROVE
        : transition === 'activate'
          ? RATE_PLAN_ACTIVATE
          : RATE_PLAN_UPDATE;
    return this.repository.transition({
      ...(await this.mutation(header, tenantId, action, meta)),
      idempotencyKey,
      ratePlanId: id,
      requestHash: stableRatingHash({ action, expectedVersion, id, transition }),
      transition,
      expectedVersion,
    });
  }
  async applicability(
    header: string | undefined,
    tenantId: string,
    idempotencyKey: string,
    value: RatingApplicabilityCreate,
    meta: RatingMetadata,
  ) {
    return this.repository.createApplicability({
      ...(await this.mutation(header, tenantId, RATE_PLAN_UPDATE, meta)),
      ...value,
      idempotencyKey,
      requestHash: stableRatingHash({ action: RATE_PLAN_UPDATE, value }),
    });
  }
  async facts(header: string | undefined, tenantId: string, meta: RatingMetadata) {
    const c = await this.context(header, tenantId, RATING_READ, meta);
    return this.repository.listFacts(c.contextToken, tenantId);
  }
  async execute(
    header: string | undefined,
    tenantId: string,
    usageAggregateId: string,
    idempotencyKey: string,
    meta: RatingMetadata,
  ) {
    const value = { usageAggregateId };
    return this.repository.execute({
      ...(await this.mutation(header, tenantId, RATING_EXECUTE, meta)),
      ...value,
      idempotencyKey,
      requestHash: stableRatingHash(value),
    });
  }
  async rerate(
    header: string | undefined,
    tenantId: string,
    ratedFactId: string,
    usageAggregateId: string,
    reason: string,
    idempotencyKey: string,
    meta: RatingMetadata,
  ) {
    const value = { ratedFactId, usageAggregateId, reason };
    return this.repository.rerate({
      ...(await this.mutation(header, tenantId, RATING_RERATE, meta)),
      ...value,
      idempotencyKey,
      requestHash: stableRatingHash(value),
    });
  }
}
export const stableRatingHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
