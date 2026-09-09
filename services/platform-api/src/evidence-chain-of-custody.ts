import { createHash, randomUUID } from 'node:crypto';
import type {
  EvidenceClassification,
  EvidenceCollect,
  EvidenceDerive,
  EvidenceMpaOperation,
  EvidenceRecord,
  EvidenceSource,
  EvidenceSourceCreate,
  EvidenceSourceTransition,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import type {
  ActiveMembershipRepository,
  IdentityAdapter,
  SecurityAuditPort,
  TenantContextRepository,
} from './platform-context.js';
import { IdentityAuthenticationError } from './platform-context.js';

export const EVIDENCE_PERMISSIONS = {
  read: 'cyberdefense.evidence.read',
  collect: 'cyberdefense.evidence.collect',
  verify: 'cyberdefense.evidence.verify',
  derive: 'cyberdefense.evidence.derive',
  export: 'cyberdefense.evidence.export',
  retain: 'cyberdefense.evidence.retain',
  retentionOverride: 'cyberdefense.evidence.retention_override',
  destroy: 'cyberdefense.evidence.destroy',
} as const;

export const EVIDENCE_CONTRACT_VERSION = '1.0.0' as const;
export const EVIDENCE_CANONICALIZATION_VERSION = 'xcap005-evidence-metadata-v1' as const;

export type EvidenceFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_CONTENT'
  | 'CONTENT_TOO_LARGE'
  | 'HASH_MISMATCH'
  | 'SOURCE_UNAVAILABLE'
  | 'INTEGRITY_FAILED'
  | 'LEGAL_HOLD_ACTIVE'
  | 'RETENTION_NOT_ELIGIBLE'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'MPA_DENIED';

export class EvidenceChainOfCustodyFailure extends Error {
  constructor(
    readonly code: EvidenceFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export interface EvidenceRequestMetadata {
  readonly requestId: string;
  readonly correlationId: string;
}

export interface EvidenceActor {
  readonly subject: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly tenantId: string;
  readonly contextToken: string;
}

export interface EvidenceConsumptionAttestationPort {
  verify(input: {
    readonly reference: string;
    readonly tenantId: string;
    readonly policyId: string;
    readonly authorizationId: string;
    readonly consumerUserId: string;
  }): Promise<{ readonly verified: boolean }>;
}

export interface EvidenceMutationReceipt<T> {
  readonly data: T;
  readonly replay: boolean;
}

export interface EvidenceRepository {
  registerSource(
    input: EvidenceActor &
      EvidenceRequestMetadata & {
        readonly sourceId: string;
        readonly command: EvidenceSourceCreate;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<EvidenceMutationReceipt<EvidenceSource>>;
  transitionSource(
    input: EvidenceActor &
      EvidenceRequestMetadata & {
        readonly sourceId: string;
        readonly command: EvidenceSourceTransition;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<EvidenceMutationReceipt<EvidenceSource>>;
  collect(
    input: EvidenceActor &
      EvidenceRequestMetadata &
      PreparedEvidence & {
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<EvidenceMutationReceipt<EvidenceRecord>>;
  read(
    input: EvidenceActor &
      EvidenceRequestMetadata & { readonly evidenceId: string; readonly permission?: string },
  ): Promise<EvidenceRecord | null>;
  readContent(
    input: EvidenceActor & EvidenceRequestMetadata & { readonly evidenceId: string },
  ): Promise<Buffer | null>;
  verify(
    input: EvidenceActor &
      EvidenceRequestMetadata & {
        readonly evidenceId: string;
        readonly expectedVersion: number;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<EvidenceMutationReceipt<EvidenceRecord>>;
  derive(
    input: EvidenceActor &
      EvidenceRequestMetadata &
      PreparedEvidence & {
        readonly parentEvidenceId: string;
        readonly transformationId: string;
        readonly transformationVersion: string;
        readonly expectedVersion: number;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<EvidenceMutationReceipt<EvidenceRecord>>;
  appendGovernanceFact(
    input: EvidenceActor &
      EvidenceRequestMetadata & {
        readonly evidenceId: string;
        readonly action: 'CLASSIFY' | 'RETENTION_APPLIED' | 'LEGAL_HOLD_APPLIED';
        readonly expectedVersion: number;
        readonly classification?: EvidenceClassification;
        readonly retentionPolicyId?: string;
        readonly reasonReference: string;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<EvidenceMutationReceipt<EvidenceRecord>>;
  consumeProtectedOperation(
    input: EvidenceActor &
      EvidenceRequestMetadata & {
        readonly evidenceId: string;
        readonly action: 'EXPORT' | 'RETENTION_OVERRIDE' | 'LEGAL_HOLD_RELEASE' | 'DESTROY';
        readonly command: EvidenceMpaOperation & { readonly hold_reference?: string };
        readonly policyId:
          | 'cyberdefense.evidence.export.standard'
          | 'cyberdefense.evidence.export.restricted_security'
          | 'cyberdefense.evidence.retention_override'
          | 'cyberdefense.evidence.destroy';
        readonly operation:
          | 'cyberdefense.evidence.export'
          | 'cyberdefense.evidence.retention_override'
          | 'cyberdefense.evidence.destroy';
        readonly targetReferenceHash: string;
        readonly idempotencyKey: string;
        readonly requestHash: string;
        readonly verifyAttestation: () => Promise<boolean>;
      },
  ): Promise<EvidenceMutationReceipt<EvidenceRecord>>;
}

interface PreparedEvidence {
  readonly evidenceId: string;
  readonly blobReferenceId: string;
  readonly command: EvidenceCollect;
  readonly rawBytes: Buffer;
  readonly contentHash: string;
  readonly metadataHash: string;
}

export class EvidenceChainOfCustodyService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly memberships: ActiveMembershipRepository,
    private readonly repository: EvidenceRepository,
    private readonly attestation: EvidenceConsumptionAttestationPort,
    private readonly securityAudit: SecurityAuditPort,
    private readonly maximumEvidenceBytes: number,
  ) {}

  async registerSource(
    header: string | undefined,
    tenantId: string,
    command: EvidenceSourceCreate,
    idempotencyKey: string,
    meta: EvidenceRequestMetadata,
  ) {
    const actor = await this.actor(header, tenantId, EVIDENCE_PERMISSIONS.collect, meta);
    return this.repository.registerSource({
      ...actor,
      ...meta,
      sourceId: randomUUID(),
      command,
      idempotencyKey,
      requestHash: stableHash(command),
    });
  }

  async transitionSource(
    header: string | undefined,
    tenantId: string,
    sourceId: string,
    command: EvidenceSourceTransition,
    idempotencyKey: string,
    meta: EvidenceRequestMetadata,
  ) {
    const actor = await this.actor(header, tenantId, EVIDENCE_PERMISSIONS.collect, meta);
    return this.repository.transitionSource({
      ...actor,
      ...meta,
      sourceId,
      command,
      idempotencyKey,
      requestHash: stableHash({ sourceId, ...command }),
    });
  }

  async collect(
    header: string | undefined,
    tenantId: string,
    command: EvidenceCollect,
    idempotencyKey: string,
    meta: EvidenceRequestMetadata,
  ) {
    const actor = await this.actor(header, tenantId, EVIDENCE_PERMISSIONS.collect, meta);
    return this.repository.collect({
      ...actor,
      ...meta,
      ...this.prepare(command),
      idempotencyKey,
      requestHash: stableHash(redactedCommand(command)),
    });
  }

  async read(
    header: string | undefined,
    tenantId: string,
    evidenceId: string,
    meta: EvidenceRequestMetadata,
  ) {
    const actor = await this.actor(header, tenantId, EVIDENCE_PERMISSIONS.read, meta);
    const result = await this.repository.read({ ...actor, ...meta, evidenceId });
    if (result === null)
      throw new EvidenceChainOfCustodyFailure('NOT_FOUND', 'Evidence was not found.');
    return result;
  }

  async readContent(
    header: string | undefined,
    tenantId: string,
    evidenceId: string,
    meta: EvidenceRequestMetadata,
  ) {
    const actor = await this.actor(header, tenantId, EVIDENCE_PERMISSIONS.read, meta);
    const result = await this.repository.readContent({ ...actor, ...meta, evidenceId });
    if (result === null)
      throw new EvidenceChainOfCustodyFailure('NOT_FOUND', 'Evidence content is unavailable.');
    return result;
  }

  async verify(
    header: string | undefined,
    tenantId: string,
    evidenceId: string,
    expectedVersion: number,
    idempotencyKey: string,
    meta: EvidenceRequestMetadata,
  ) {
    const actor = await this.actor(header, tenantId, EVIDENCE_PERMISSIONS.verify, meta);
    const result = await this.repository.verify({
      ...actor,
      ...meta,
      evidenceId,
      expectedVersion,
      idempotencyKey,
      requestHash: stableHash({ evidenceId, expectedVersion }),
    });
    if (result.data.integrity_status === 'FAILED')
      throw new EvidenceChainOfCustodyFailure(
        'INTEGRITY_FAILED',
        'Evidence integrity validation failed.',
      );
    return result;
  }

  async derive(
    header: string | undefined,
    tenantId: string,
    parentEvidenceId: string,
    command: EvidenceDerive,
    idempotencyKey: string,
    meta: EvidenceRequestMetadata,
  ) {
    const actor = await this.actor(header, tenantId, EVIDENCE_PERMISSIONS.derive, meta);
    const collect: EvidenceCollect = {
      ...command,
      evidence_source_id: parentEvidenceId,
      source_event_id: `derivation:${randomUUID()}`,
    };
    return this.repository.derive({
      ...actor,
      ...meta,
      ...this.prepare(collect),
      parentEvidenceId,
      transformationId: command.transformation_id,
      transformationVersion: command.transformation_version,
      expectedVersion: command.expected_version,
      idempotencyKey,
      requestHash: stableHash(redactedCommand(command)),
    });
  }

  async governanceFact(
    header: string | undefined,
    tenantId: string,
    evidenceId: string,
    input: {
      action: 'CLASSIFY' | 'RETENTION_APPLIED' | 'LEGAL_HOLD_APPLIED';
      expectedVersion: number;
      reasonReference: string;
      classification?: EvidenceClassification;
      retentionPolicyId?: string;
    },
    idempotencyKey: string,
    meta: EvidenceRequestMetadata,
  ) {
    const actor = await this.actor(header, tenantId, EVIDENCE_PERMISSIONS.retain, meta);
    return this.repository.appendGovernanceFact({
      ...actor,
      ...meta,
      evidenceId,
      ...input,
      idempotencyKey,
      requestHash: stableHash({ evidenceId, ...input }),
    });
  }

  async protectedOperation(
    header: string | undefined,
    tenantId: string,
    evidenceId: string,
    action: 'EXPORT' | 'RETENTION_OVERRIDE' | 'LEGAL_HOLD_RELEASE' | 'DESTROY',
    command: EvidenceMpaOperation & { readonly hold_reference?: string },
    idempotencyKey: string,
    meta: EvidenceRequestMetadata,
  ) {
    const permission =
      action === 'EXPORT'
        ? EVIDENCE_PERMISSIONS.export
        : action === 'DESTROY'
          ? EVIDENCE_PERMISSIONS.destroy
          : EVIDENCE_PERMISSIONS.retentionOverride;
    const actor = await this.actor(header, tenantId, permission, meta);
    const current = await this.repository.read({ ...actor, ...meta, evidenceId, permission });
    if (current === null)
      throw new EvidenceChainOfCustodyFailure('NOT_FOUND', 'Evidence was not found.');
    const operation =
      action === 'EXPORT'
        ? EVIDENCE_PERMISSIONS.export
        : action === 'DESTROY'
          ? EVIDENCE_PERMISSIONS.destroy
          : EVIDENCE_PERMISSIONS.retentionOverride;
    const policyId =
      action === 'EXPORT'
        ? current.classification === 'RESTRICTED_SECURITY'
          ? 'cyberdefense.evidence.export.restricted_security'
          : 'cyberdefense.evidence.export.standard'
        : action === 'DESTROY'
          ? 'cyberdefense.evidence.destroy'
          : 'cyberdefense.evidence.retention_override';
    const requestHash = stableHash({ evidenceId, action, ...command });
    const mpaDecision = await this.authorization.authorize({
      action: 'platform.mpa.consume',
      resource: 'platform:multi-person-authorization',
      subject_id: actor.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!mpaDecision.allowed)
      return this.deny(actor.subject, tenantId, 'platform.mpa.consume', meta);
    const mpaContext = await this.contexts.issueContext(
      actor.subject,
      tenantId,
      'platform.mpa.consume',
    );
    if (mpaContext === null)
      return this.deny(actor.subject, tenantId, 'platform.mpa.consume', meta);
    return this.repository.consumeProtectedOperation({
      ...actor,
      contextToken: mpaContext.contextToken,
      ...meta,
      evidenceId,
      action,
      command,
      policyId,
      operation,
      targetReferenceHash: evidenceMpaTargetReferenceHash(
        tenantId,
        evidenceId,
        operation,
        command.expected_version,
      ),
      idempotencyKey,
      requestHash,
      verifyAttestation: async () =>
        (
          await this.attestation.verify({
            reference: command.attestation_reference,
            tenantId,
            policyId,
            authorizationId: command.authorization_id,
            consumerUserId: actor.userId,
          })
        ).verified,
    });
  }

  private prepare(command: EvidenceCollect): PreparedEvidence {
    const rawBytes = decodeBase64(command.raw_bytes_base64);
    if (rawBytes.byteLength > this.maximumEvidenceBytes)
      throw new EvidenceChainOfCustodyFailure(
        'CONTENT_TOO_LARGE',
        'Evidence exceeds the configured size boundary.',
      );
    const contentHash = sha256(rawBytes);
    if (command.declared_sha256 !== undefined && command.declared_sha256 !== contentHash)
      throw new EvidenceChainOfCustodyFailure(
        'HASH_MISMATCH',
        'Evidence integrity validation failed.',
      );
    return {
      evidenceId: randomUUID(),
      blobReferenceId: randomUUID(),
      command,
      rawBytes,
      contentHash,
      metadataHash: sha256(Buffer.from(canonicalizeMetadata(command.metadata), 'utf8')),
    };
  }

  private async actor(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: EvidenceRequestMetadata,
  ): Promise<EvidenceActor> {
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
      throw new EvidenceChainOfCustodyFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (identity === null)
      throw new EvidenceChainOfCustodyFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    const active = (await this.memberships.listActiveMembershipsBySubject(identity.subject)).find(
      (value) => value.tenantId === tenantId && value.userId === membership?.userId,
    );
    if (membership === null || active === undefined)
      return this.deny(identity.subject, tenantId, action, meta);
    const decision = await this.authorization.authorize({
      action,
      resource: 'cyberdefense:evidence',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed) return this.deny(identity.subject, tenantId, action, meta);
    const issued = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (issued === null) return this.deny(identity.subject, tenantId, action, meta);
    return {
      subject: identity.subject,
      userId: issued.userId,
      membershipId: active.membershipId,
      tenantId,
      contextToken: issued.contextToken,
    };
  }

  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    meta: EvidenceRequestMetadata,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: meta.correlationId,
      reasonCode: 'EVIDENCE_AUTHORITY_DENIED',
      requestId: meta.requestId,
      requestedTenantId: tenantId,
    });
    throw new EvidenceChainOfCustodyFailure('FORBIDDEN', 'Evidence operation is unavailable.');
  }
}

export function canonicalizeMetadata(value: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined && child !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

export function stableHash(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(canonicalValue(value)), 'utf8'));
}

export function evidenceMpaTargetReferenceHash(
  tenantId: string,
  evidenceId: string,
  operation: string,
  expectedVersion: number,
): string {
  return stableHash(`xcap005:v1:${tenantId}:${evidenceId}:${operation}:version:${expectedVersion}`);
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeBase64(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.length === 0 ||
    decoded.toString('base64').replace(/=+$/u, '') !== value.replace(/=+$/u, '')
  )
    throw new EvidenceChainOfCustodyFailure(
      'INVALID_CONTENT',
      'Evidence content encoding is invalid.',
    );
  return decoded;
}

function redactedCommand(command: EvidenceCollect | EvidenceDerive) {
  const bounded = Object.fromEntries(
    Object.entries(command).filter(([key]) => key !== 'raw_bytes_base64'),
  );
  return { ...bounded, content_sha256: sha256(Buffer.from(command.raw_bytes_base64, 'base64')) };
}
