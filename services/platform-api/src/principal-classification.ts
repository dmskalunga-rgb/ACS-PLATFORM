import pg from 'pg';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

const { Pool } = pg;
export const PRINCIPAL_CLASSIFY = 'platform.principals.classify';
export type PrincipalType = 'HUMAN' | 'SERVICE' | 'MACHINE' | 'AUTOMATION' | 'AI_AGENT' | 'UNKNOWN';
export type PrincipalClassificationStatus = 'VERIFIED' | 'SUSPENDED' | 'REVOKED';

export interface ClassificationCommand {
  readonly targetUserId: string;
  readonly principalType: PrincipalType;
  readonly status: PrincipalClassificationStatus;
  readonly policyVersion: string;
  readonly evidenceId: string;
  readonly expectedVersion: number;
}

export interface HumanLifecycleCommand {
  readonly targetUserId: string;
  readonly transition: 'SUSPEND' | 'REACTIVATE' | 'REVOKE';
  readonly reasonCode: string;
  readonly evidenceId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface ClassificationRepository {
  set(
    input: ClassificationCommand & {
      readonly tenantId: string;
      readonly actorUserId: string;
      readonly contextToken: string;
      readonly requestId: string;
      readonly correlationId: string;
    },
  ): Promise<number | null>;
  requestHuman(input: {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly evidenceId: string;
    readonly policyVersion: string;
    readonly expectedVersion: number;
    readonly contextToken: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<string | null>;
  pendingHumanEvidence(input: {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly classificationRequestId: string;
    readonly contextToken: string;
  }): Promise<string | null>;
  verifyHuman(input: {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly classificationRequestId: string;
    readonly contextToken: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<string | null>;
  transitionHuman(
    input: HumanLifecycleCommand & {
      readonly tenantId: string;
      readonly actorUserId: string;
      readonly contextToken: string;
      readonly requestId: string;
      readonly correlationId: string;
    },
  ): Promise<number | null>;
}

/** The Human domain receives only the bounded XCAP-005 VALID/INVALID result. */
export interface ClassificationEvidencePort {
  validate(input: {
    readonly tenantId: string;
    readonly evidenceReference: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<'VALID' | 'INVALID'>;
}

export class PrincipalClassificationFailure extends Error {
  constructor(readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_TARGET_OR_VERSION') {
    super('Principal classification is not available.');
  }
}

export class PrincipalClassificationService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly repository: ClassificationRepository,
    private readonly evidence: ClassificationEvidencePort,
    private readonly securityAudit: SecurityAuditPort,
  ) {}

  async set(
    header: string | undefined,
    tenantId: string,
    command: ClassificationCommand,
    metadata: { readonly requestId: string; readonly correlationId: string },
  ) {
    const context = await this.authorizedContext(header, tenantId, command.targetUserId, metadata);
    await this.requireValidEvidence(tenantId, command.evidenceId, metadata);
    const version = await this.repository.set({
      ...command,
      actorUserId: context.userId,
      contextToken: context.contextToken,
      tenantId,
      requestId: metadata.requestId,
      correlationId: metadata.correlationId,
    });
    if (version === null) throw new PrincipalClassificationFailure('INVALID_TARGET_OR_VERSION');
    return {
      user_id: command.targetUserId,
      principal_type: command.principalType,
      status: command.status,
      version,
      meta: { request_id: metadata.requestId, correlation_id: metadata.correlationId },
    };
  }

  async requestHuman(
    header: string | undefined,
    tenantId: string,
    command: {
      readonly targetUserId: string;
      readonly evidenceId: string;
      readonly policyVersion: string;
      readonly expectedVersion: number;
    },
    metadata: { readonly requestId: string; readonly correlationId: string },
  ) {
    const context = await this.authorizedContext(header, tenantId, command.targetUserId, metadata);
    await this.requireValidEvidence(tenantId, command.evidenceId, metadata);
    const classificationRequestId = await this.repository.requestHuman({
      ...command,
      tenantId,
      actorUserId: context.userId,
      contextToken: context.contextToken,
      ...metadata,
    });
    if (classificationRequestId === null)
      throw new PrincipalClassificationFailure('INVALID_TARGET_OR_VERSION');
    return {
      classification_request_id: classificationRequestId,
      status: 'PENDING',
      meta: { request_id: metadata.requestId, correlation_id: metadata.correlationId },
    };
  }

  async verifyHuman(
    header: string | undefined,
    tenantId: string,
    classificationRequestId: string,
    metadata: { readonly requestId: string; readonly correlationId: string },
  ) {
    const context = await this.authorizedContext(header, tenantId, undefined, metadata);
    const evidenceReference = await this.repository.pendingHumanEvidence({
      tenantId,
      actorUserId: context.userId,
      classificationRequestId,
      contextToken: context.contextToken,
    });
    if (evidenceReference === null)
      throw new PrincipalClassificationFailure('INVALID_TARGET_OR_VERSION');
    await this.requireValidEvidence(tenantId, evidenceReference, metadata);
    const verificationContext = await this.authorizedContext(header, tenantId, undefined, metadata);
    if (
      context.tenantId !== tenantId ||
      verificationContext.tenantId !== tenantId ||
      verificationContext.userId !== context.userId
    )
      throw new PrincipalClassificationFailure('FORBIDDEN');
    const personId = await this.repository.verifyHuman({
      tenantId,
      actorUserId: context.userId,
      classificationRequestId,
      contextToken: verificationContext.contextToken,
      ...metadata,
    });
    if (personId === null) throw new PrincipalClassificationFailure('INVALID_TARGET_OR_VERSION');
    return {
      classification_request_id: classificationRequestId,
      person_id: personId,
      status: 'VERIFIED',
      meta: { request_id: metadata.requestId, correlation_id: metadata.correlationId },
    };
  }

  async transitionHuman(
    header: string | undefined,
    tenantId: string,
    command: HumanLifecycleCommand,
    metadata: { readonly requestId: string; readonly correlationId: string },
  ) {
    const context = await this.authorizedContext(header, tenantId, command.targetUserId, metadata);
    await this.requireValidEvidence(tenantId, command.evidenceId, metadata);
    const version = await this.repository.transitionHuman({
      ...command,
      tenantId,
      actorUserId: context.userId,
      contextToken: context.contextToken,
      ...metadata,
    });
    if (version === null) throw new PrincipalClassificationFailure('INVALID_TARGET_OR_VERSION');
    return {
      user_id: command.targetUserId,
      status:
        command.transition === 'SUSPEND'
          ? 'SUSPENDED'
          : command.transition === 'REACTIVATE'
            ? 'VERIFIED'
            : 'REVOKED',
      version,
      meta: { request_id: metadata.requestId, correlation_id: metadata.correlationId },
    };
  }

  private async requireValidEvidence(
    tenantId: string,
    evidenceReference: string,
    metadata: { readonly requestId: string; readonly correlationId: string },
  ): Promise<void> {
    let result: 'VALID' | 'INVALID';
    try {
      result = await this.evidence.validate({ tenantId, evidenceReference, ...metadata });
    } catch {
      throw new PrincipalClassificationFailure('INVALID_TARGET_OR_VERSION');
    }
    if (result !== 'VALID') throw new PrincipalClassificationFailure('INVALID_TARGET_OR_VERSION');
  }

  private async authorizedContext(
    header: string | undefined,
    tenantId: string,
    targetUserId: string | undefined,
    metadata: { readonly requestId: string; readonly correlationId: string },
  ) {
    let identity;
    try {
      identity = await this.identity.authenticate(header);
    } catch (error) {
      await this.securityAudit.recordDenied({
        action: PRINCIPAL_CLASSIFY,
        correlationId: metadata.correlationId,
        reasonCode:
          error instanceof IdentityAuthenticationError
            ? error.reasonCode
            : 'IDENTITY_PROVIDER_ERROR',
        requestId: metadata.requestId,
        requestedTenantId: tenantId,
      });
      throw new PrincipalClassificationFailure('UNAUTHENTICATED');
    }
    if (identity === null) throw new PrincipalClassificationFailure('UNAUTHENTICATED');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (membership === null || membership.userId === targetUserId)
      return this.deny(identity.subject, tenantId, metadata);
    const decision = await this.authorization.authorize({
      action: PRINCIPAL_CLASSIFY,
      resource: 'platform:principal-classification',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed) return this.deny(identity.subject, tenantId, metadata);
    const context = await this.contexts.issueContext(
      identity.subject,
      tenantId,
      PRINCIPAL_CLASSIFY,
    );
    if (context === null) return this.deny(identity.subject, tenantId, metadata);
    return context;
  }

  private async deny(
    subject: string,
    tenantId: string,
    metadata: { readonly requestId: string; readonly correlationId: string },
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action: PRINCIPAL_CLASSIFY,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode: 'PRINCIPAL_CLASSIFICATION_DENIED',
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
    throw new PrincipalClassificationFailure('FORBIDDEN');
  }
}

export class PostgresPrincipalClassificationRepository implements ClassificationRepository {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  async close() {
    await this.pool.end();
  }

  async set(input: Parameters<ClassificationRepository['set']>[0]): Promise<number | null> {
    const result = await this.execute(
      input.contextToken,
      input.actorUserId,
      `SELECT platform.set_principal_classification(
        $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::uuid,$8::bigint,$9::uuid,$10::uuid
      ) AS result`,
      [
        input.tenantId,
        input.actorUserId,
        input.targetUserId,
        input.principalType,
        input.status,
        input.policyVersion,
        input.evidenceId,
        input.expectedVersion,
        input.requestId,
        input.correlationId,
      ],
    );
    return result === null ? null : Number(result);
  }

  requestHuman(input: Parameters<ClassificationRepository['requestHuman']>[0]) {
    return this.execute(
      input.contextToken,
      input.actorUserId,
      `SELECT platform.request_human_classification(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::bigint,$7::uuid,$8::uuid
      ) AS result`,
      [
        input.tenantId,
        input.actorUserId,
        input.targetUserId,
        input.evidenceId,
        input.policyVersion,
        input.expectedVersion,
        input.requestId,
        input.correlationId,
      ],
    );
  }

  pendingHumanEvidence(input: Parameters<ClassificationRepository['pendingHumanEvidence']>[0]) {
    return this.execute(
      input.contextToken,
      input.actorUserId,
      `SELECT platform.pending_human_classification_evidence(
        $1::uuid,$2::uuid,$3::uuid
      ) AS result`,
      [input.tenantId, input.actorUserId, input.classificationRequestId],
    );
  }

  verifyHuman(input: Parameters<ClassificationRepository['verifyHuman']>[0]) {
    return this.execute(
      input.contextToken,
      input.actorUserId,
      `SELECT platform.verify_human_classification(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid
      ) AS result`,
      [
        input.tenantId,
        input.actorUserId,
        input.classificationRequestId,
        input.requestId,
        input.correlationId,
      ],
    );
  }

  async transitionHuman(input: Parameters<ClassificationRepository['transitionHuman']>[0]) {
    const result = await this.execute(
      input.contextToken,
      input.actorUserId,
      `SELECT platform.transition_human_classification(
        $1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7::bigint,$8::uuid,$9::uuid,$10::uuid
      ) AS result`,
      [
        input.tenantId,
        input.actorUserId,
        input.targetUserId,
        input.transition,
        input.reasonCode,
        input.evidenceId,
        input.expectedVersion,
        input.idempotencyKey,
        input.requestId,
        input.correlationId,
      ],
    );
    return result === null ? null : Number(result);
  }

  private async execute(
    contextToken: string,
    actorUserId: string,
    sql: string,
    params: readonly unknown[],
  ): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const activated = await client.query<{ user_id: string }>(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [contextToken, PRINCIPAL_CLASSIFY],
      );
      if (activated.rowCount !== 1 || activated.rows[0]?.user_id !== actorUserId) {
        await client.query('ROLLBACK');
        return null;
      }
      const result = await client.query<{ result: string | null }>(sql, [...params]);
      const value = result.rows[0]?.result;
      if (value === null || value === undefined) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
