import { createHash } from 'node:crypto';
import type {
  MachineMeasurementIngest,
  MeasurementCorrectionCreate,
  MeasurementSourceCreate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const USAGE_READ = 'commercial.usage.read';
export const USAGE_CORRECT = 'commercial.usage.correct';
export const USAGE_SOURCE_READ = 'commercial.usage.source.read';
export const USAGE_SOURCE_MANAGE = 'commercial.usage.source.manage';
export const USAGE_INGEST = 'commercial.usage.ingest';

export type UsageFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_SOURCE'
  | 'INVALID_REFERENCE'
  | 'INVALID_TIMESTAMP'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SOURCE_EVENT_CONFLICT'
  | 'TERMINAL_SOURCE';
export class UsageMeteringFailure extends Error {
  constructor(
    readonly code: UsageFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export type UsageMetadata = { correlationId: string; requestId: string };
export type HumanUsageMutation = UsageMetadata & {
  action: string;
  actorUserId: string;
  contextToken: string;
  tenantId: string;
};
export type MachineSourceIdentity = {
  credentialId: string;
  sourceId: string;
  tenantId: string;
  machinePrincipalId: string;
  contextToken: string;
};

export interface UsageMeteringRepository {
  registerSource(input: HumanUsageMutation & MeasurementSourceCreate): Promise<unknown>;
  listSources(token: string, tenantId: string): Promise<unknown[]>;
  getSource(token: string, tenantId: string, sourceId: string): Promise<unknown>;
  transitionSource(
    input: HumanUsageMutation & { sourceId: string; status: 'ACTIVE' | 'DISABLED' | 'REVOKED' },
  ): Promise<unknown>;
  rotateCredential(input: HumanUsageMutation & { sourceId: string }): Promise<unknown>;
  authenticateSource(credentialId: string, secret: string): Promise<MachineSourceIdentity>;
  ingest(
    identity: MachineSourceIdentity,
    value: MachineMeasurementIngest,
    meta: UsageMetadata,
  ): Promise<{ measurement: unknown; replay: boolean }>;
  listMeasurements(token: string, tenantId: string): Promise<unknown[]>;
  getMeasurement(token: string, tenantId: string, id: string): Promise<unknown>;
  listAggregates(token: string, tenantId: string): Promise<unknown[]>;
  correct(
    input: HumanUsageMutation &
      MeasurementCorrectionCreate & { idempotencyKey: string; requestHash: string },
  ): Promise<{ correction: unknown; replay: boolean }>;
}

export class UsageMeteringService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly repository: UsageMeteringRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async context(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: UsageMetadata,
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
      throw new UsageMeteringFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!principal)
      throw new UsageMeteringFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(principal.subject, tenantId);
    if (!membership) throw new UsageMeteringFailure('FORBIDDEN', 'Usage operation is unavailable.');
    const allowed = await this.authorization.authorize({
      action,
      resource: 'commercial:usage-metering',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!allowed.allowed)
      throw new UsageMeteringFailure('FORBIDDEN', 'Usage operation is unavailable.');
    const context = await this.contexts.issueContext(principal.subject, tenantId, action);
    if (!context) throw new UsageMeteringFailure('FORBIDDEN', 'Usage operation is unavailable.');
    return context;
  }
  private async mutation(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: UsageMetadata,
  ): Promise<HumanUsageMutation> {
    const context = await this.context(header, tenantId, action, meta);
    return {
      ...meta,
      action,
      actorUserId: context.userId,
      contextToken: context.contextToken,
      tenantId,
    };
  }
  async registerSource(
    header: string | undefined,
    tenantId: string,
    value: MeasurementSourceCreate,
    meta: UsageMetadata,
  ) {
    return this.repository.registerSource({
      ...(await this.mutation(header, tenantId, USAGE_SOURCE_MANAGE, meta)),
      ...value,
    });
  }
  async listSources(header: string | undefined, tenantId: string, meta: UsageMetadata) {
    const context = await this.context(header, tenantId, USAGE_SOURCE_READ, meta);
    return this.repository.listSources(context.contextToken, tenantId);
  }
  async getSource(
    header: string | undefined,
    tenantId: string,
    sourceId: string,
    meta: UsageMetadata,
  ) {
    const context = await this.context(header, tenantId, USAGE_SOURCE_READ, meta);
    const value = await this.repository.getSource(context.contextToken, tenantId, sourceId);
    if (!value) throw new UsageMeteringFailure('NOT_FOUND', 'Measurement Source was not found.');
    return value;
  }
  async transitionSource(
    header: string | undefined,
    tenantId: string,
    sourceId: string,
    status: 'ACTIVE' | 'DISABLED' | 'REVOKED',
    meta: UsageMetadata,
  ) {
    return this.repository.transitionSource({
      ...(await this.mutation(header, tenantId, USAGE_SOURCE_MANAGE, meta)),
      sourceId,
      status,
    });
  }
  async rotateCredential(
    header: string | undefined,
    tenantId: string,
    sourceId: string,
    meta: UsageMetadata,
  ) {
    return this.repository.rotateCredential({
      ...(await this.mutation(header, tenantId, USAGE_SOURCE_MANAGE, meta)),
      sourceId,
    });
  }
  async listMeasurements(header: string | undefined, tenantId: string, meta: UsageMetadata) {
    const c = await this.context(header, tenantId, USAGE_READ, meta);
    return this.repository.listMeasurements(c.contextToken, tenantId);
  }
  async getMeasurement(
    header: string | undefined,
    tenantId: string,
    id: string,
    meta: UsageMetadata,
  ) {
    const c = await this.context(header, tenantId, USAGE_READ, meta);
    const value = await this.repository.getMeasurement(c.contextToken, tenantId, id);
    if (!value) throw new UsageMeteringFailure('NOT_FOUND', 'Measurement was not found.');
    return value;
  }
  async listAggregates(header: string | undefined, tenantId: string, meta: UsageMetadata) {
    const c = await this.context(header, tenantId, USAGE_READ, meta);
    return this.repository.listAggregates(c.contextToken, tenantId);
  }
  async correct(
    header: string | undefined,
    tenantId: string,
    key: string,
    value: MeasurementCorrectionCreate,
    meta: UsageMetadata,
  ) {
    return this.repository.correct({
      ...(await this.mutation(header, tenantId, USAGE_CORRECT, meta)),
      ...value,
      idempotencyKey: key,
      requestHash: stableHash(value),
    });
  }
}

export class MachineUsageIngestionService {
  constructor(private readonly repository: UsageMeteringRepository) {}
  async ingest(
    credentialId: string,
    secret: string,
    value: MachineMeasurementIngest,
    meta: UsageMetadata,
  ) {
    const identity = await this.repository.authenticateSource(credentialId, secret);
    return this.repository.ingest(identity, value, meta);
  }
}
export const stableHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
