import { createHash, randomUUID } from 'node:crypto';
import type {
  AiRiskAssessment,
  AiRiskCreate,
  AiRiskMonitoring,
  AiRiskRecord,
  AiRiskResidualReview,
  AiRiskTreatment,
  AiRiskUpdate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type ActiveMembershipRepository,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const AI_RISK_PERMISSIONS = {
  read: 'aigov.risk.read',
  create: 'aigov.risk.create',
  update: 'aigov.risk.update',
  assess: 'aigov.risk.assess',
  treat: 'aigov.risk.treat',
  review: 'aigov.risk.review',
  monitor: 'aigov.risk.monitor',
} as const;

export type AiRiskFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STALE_VERSION'
  | 'ALREADY_EXISTS'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_REFERENCE'
  | 'INVALID_RISK_STATE'
  | 'NOT_AUTHORIZED_PENDING_POLICY';

export class AiRiskFailure extends Error {
  constructor(readonly code: AiRiskFailureCode) {
    super(
      code === 'NOT_AUTHORIZED_PENDING_POLICY'
        ? 'Protected risk decisions require a separately approved policy.'
        : 'AI risk governance operation is unavailable.',
    );
  }
}

export interface AiRiskMetadata {
  readonly requestId: string;
  readonly correlationId: string;
}

export interface AiRiskActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly contextToken: string;
}

export interface AiRiskCommandContext extends AiRiskActor, AiRiskMetadata {
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export interface AiRiskReceipt<T> {
  readonly data: T;
  readonly replay: boolean;
}

export interface AiRiskEvent {
  readonly event_id: string;
  readonly risk_id: string;
  readonly risk_version: number;
  readonly kind: 'ASSESSMENT' | 'TREATMENT' | 'RESIDUAL_REVIEW' | 'MONITORING';
  readonly created_at: string;
  readonly inherent_score?: number;
  readonly residual_score?: number;
  readonly scoring_formula_reference?: string;
}

export interface AiRiskRepository {
  create(
    input: AiRiskCommandContext & { readonly riskId: string; readonly command: AiRiskCreate },
  ): Promise<AiRiskReceipt<AiRiskRecord>>;
  update(
    input: AiRiskCommandContext & { readonly riskId: string; readonly command: AiRiskUpdate },
  ): Promise<AiRiskReceipt<AiRiskRecord>>;
  assess(
    input: AiRiskCommandContext & {
      readonly riskId: string;
      readonly eventId: string;
      readonly command: AiRiskAssessment;
    },
  ): Promise<AiRiskReceipt<AiRiskEvent>>;
  treat(
    input: AiRiskCommandContext & {
      readonly riskId: string;
      readonly eventId: string;
      readonly command: AiRiskTreatment;
    },
  ): Promise<AiRiskReceipt<AiRiskEvent>>;
  review(
    input: AiRiskCommandContext & {
      readonly riskId: string;
      readonly eventId: string;
      readonly command: AiRiskResidualReview;
    },
  ): Promise<AiRiskReceipt<AiRiskEvent>>;
  monitor(
    input: AiRiskCommandContext & {
      readonly riskId: string;
      readonly eventId: string;
      readonly command: AiRiskMonitoring;
    },
  ): Promise<AiRiskReceipt<AiRiskEvent>>;
  read(
    input: AiRiskActor & AiRiskMetadata & { readonly riskId: string },
  ): Promise<AiRiskRecord | null>;
}

export class AiRiskService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly memberships: ActiveMembershipRepository,
    private readonly repository: AiRiskRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}

  async create(
    header: string | undefined,
    tenantId: string,
    command: AiRiskCreate,
    idempotencyKey: string,
    metadata: AiRiskMetadata,
  ) {
    const actor = await this.actor(header, tenantId, AI_RISK_PERMISSIONS.create, metadata);
    return this.repository.create({
      ...actor,
      ...metadata,
      command,
      riskId: randomUUID(),
      idempotencyKey,
      requestHash: commandHash('create', undefined, command),
    });
  }

  async update(
    header: string | undefined,
    tenantId: string,
    riskId: string,
    command: AiRiskUpdate,
    idempotencyKey: string,
    metadata: AiRiskMetadata,
  ) {
    const actor = await this.actor(header, tenantId, AI_RISK_PERMISSIONS.update, metadata);
    return this.repository.update({
      ...actor,
      ...metadata,
      command,
      riskId,
      idempotencyKey,
      requestHash: commandHash('update', riskId, command),
    });
  }

  async assess(
    header: string | undefined,
    tenantId: string,
    riskId: string,
    command: AiRiskAssessment,
    idempotencyKey: string,
    metadata: AiRiskMetadata,
  ) {
    const actor = await this.actor(header, tenantId, AI_RISK_PERMISSIONS.assess, metadata);
    return this.repository.assess({
      ...actor,
      ...metadata,
      command,
      riskId,
      eventId: randomUUID(),
      idempotencyKey,
      requestHash: commandHash('assess', riskId, command),
    });
  }

  async treat(
    header: string | undefined,
    tenantId: string,
    riskId: string,
    command: AiRiskTreatment,
    idempotencyKey: string,
    metadata: AiRiskMetadata,
  ) {
    const actor = await this.actor(header, tenantId, AI_RISK_PERMISSIONS.treat, metadata);
    return this.repository.treat({
      ...actor,
      ...metadata,
      command,
      riskId,
      eventId: randomUUID(),
      idempotencyKey,
      requestHash: commandHash('treat', riskId, command),
    });
  }

  async review(
    header: string | undefined,
    tenantId: string,
    riskId: string,
    command: AiRiskResidualReview,
    idempotencyKey: string,
    metadata: AiRiskMetadata,
  ) {
    const actor = await this.actor(header, tenantId, AI_RISK_PERMISSIONS.review, metadata);
    return this.repository.review({
      ...actor,
      ...metadata,
      command,
      riskId,
      eventId: randomUUID(),
      idempotencyKey,
      requestHash: commandHash('review', riskId, command),
    });
  }

  async monitor(
    header: string | undefined,
    tenantId: string,
    riskId: string,
    command: AiRiskMonitoring,
    idempotencyKey: string,
    metadata: AiRiskMetadata,
  ) {
    const actor = await this.actor(header, tenantId, AI_RISK_PERMISSIONS.monitor, metadata);
    return this.repository.monitor({
      ...actor,
      ...metadata,
      command,
      riskId,
      eventId: randomUUID(),
      idempotencyKey,
      requestHash: commandHash('monitor', riskId, command),
    });
  }

  async read(
    header: string | undefined,
    tenantId: string,
    riskId: string,
    metadata: AiRiskMetadata,
  ) {
    const actor = await this.actor(header, tenantId, AI_RISK_PERMISSIONS.read, metadata);
    const risk = await this.repository.read({ ...actor, ...metadata, riskId });
    if (risk === null) throw new AiRiskFailure('NOT_FOUND');
    return risk;
  }

  async decideProtected(
    header: string | undefined,
    tenantId: string,
    metadata: AiRiskMetadata,
  ): Promise<never> {
    const actor = await this.actor(header, tenantId, AI_RISK_PERMISSIONS.review, metadata);
    // G0 does not yet define the operational MPA permission, quorum or attestation.
    // No state, audit-as-approval or outbox transition may occur pending policy.
    await this.securityAudit.recordDenied({
      action: 'aigov.risk.protected_decision',
      actorSubject: actor.userId,
      correlationId: metadata.correlationId,
      reasonCode: 'AIGOV_M0B_POLICY_NOT_AUTHORIZED',
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
    throw new AiRiskFailure('NOT_AUTHORIZED_PENDING_POLICY');
  }

  private async actor(
    header: string | undefined,
    tenantId: string,
    action: string,
    metadata: AiRiskMetadata,
  ): Promise<AiRiskActor> {
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
      throw new AiRiskFailure('UNAUTHENTICATED');
    }
    if (identity === null) throw new AiRiskFailure('UNAUTHENTICATED');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    const active = (await this.memberships.listActiveMembershipsBySubject(identity.subject)).find(
      (candidate) => candidate.tenantId === tenantId && candidate.userId === membership?.userId,
    );
    if (membership === null || active === undefined)
      return this.deny(identity.subject, tenantId, action, metadata);
    const decision = await this.authorization.authorize({
      action,
      resource: 'aigov:ai-risk',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed) return this.deny(identity.subject, tenantId, action, metadata);
    const context = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (context === null) return this.deny(identity.subject, tenantId, action, metadata);
    return {
      tenantId,
      userId: context.userId,
      membershipId: active.membershipId,
      contextToken: context.contextToken,
    };
  }

  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    metadata: AiRiskMetadata,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode: 'AIGOV_M0B_AUTHORITY_DENIED',
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
    throw new AiRiskFailure('FORBIDDEN');
  }
}

function commandHash(command: string, riskId: string | undefined, payload: unknown): string {
  return createHash('sha256').update(JSON.stringify({ command, riskId, payload })).digest('hex');
}
