import { createHash, randomUUID } from 'node:crypto';
import type {
  XcfExpectedVersion,
  XcfFrameworkObject,
  XcfFrameworkRelease,
  XcfFrameworkReleaseIngest,
  XcfFrameworkSource,
  XcfFrameworkSourceCreate,
  XcfProtectedTransition,
  XcfPublisher,
  XcfPublisherCreate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type ActiveMembershipRepository,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';
import {
  type XcfArtifactAcquisitionPort,
  XcfFrameworkArtifactValidator,
  type XcfM1QuarantineReason,
  type XcfSourceIngestionPolicy,
  type XcfTrustedKeyResolver,
} from './xcf-framework-artifact.js';
export { XcfM1Failure } from './xcf-framework-registry-errors.js';
import { XcfM1Failure } from './xcf-framework-registry-errors.js';

export const XCF_M1_PERMISSIONS = {
  publisherRead: 'xcf.publisher.read',
  publisherAdminister: 'xcf.publisher.administer',
  sourceRead: 'xcf.framework_source.read',
  sourceRegister: 'xcf.framework_source.register',
  sourceActivate: 'xcf.framework_source.activate',
  sourceSuspend: 'xcf.framework_source.suspend',
  sourceRevoke: 'xcf.framework_source.revoke',
  releaseRead: 'xcf.framework_release.read',
  releaseIngest: 'xcf.framework_release.ingest',
  releaseApprove: 'xcf.framework_release.approve',
  releaseActivate: 'xcf.framework_release.activate',
  releaseRevoke: 'xcf.framework_release.revoke',
} as const;

export interface XcfM1Metadata {
  readonly requestId: string;
  readonly correlationId: string;
}

export interface XcfM1Actor {
  readonly tenantId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly subject: string;
  readonly contextToken: string;
}

export interface XcfM1MutationReceipt<T> {
  readonly data: T;
  readonly replay: boolean;
}

export interface XcfM1ConsumptionAttestationPort {
  verify(input: {
    readonly reference: string;
    readonly tenantId: string;
    readonly authorizationId: string;
    readonly operation: string;
    readonly targetReferenceHash: string;
    readonly consumerUserId: string;
  }): Promise<{ readonly verified: boolean }>;
}

export interface XcfM1Repository {
  createPublisher(
    input: XcfM1Actor &
      XcfM1Metadata & {
        readonly publisherId: string;
        readonly command: XcfPublisherCreate;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<XcfM1MutationReceipt<XcfPublisher>>;
  registerSource(
    input: XcfM1Actor &
      XcfM1Metadata & {
        readonly sourceId: string;
        readonly frameworkId: string;
        readonly command: XcfFrameworkSourceCreate;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<XcfM1MutationReceipt<XcfFrameworkSource>>;
  readSource(
    input: XcfM1Actor & XcfM1Metadata & { readonly sourceId: string },
  ): Promise<XcfFrameworkSource | null>;
  readSourceIngestionPolicy(
    input: XcfM1Actor & XcfM1Metadata & { readonly sourceId: string },
  ): Promise<XcfSourceIngestionPolicy | null>;
  recordIngestionFailure(
    input: XcfM1Actor &
      XcfM1Metadata & {
        readonly sourceId: string;
        readonly artifactUri: string;
        readonly reason: string;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<void>;
  ingestRelease(
    input: XcfM1Actor &
      XcfM1Metadata & {
        readonly releaseId: string;
        readonly artifactId: string;
        readonly command: Omit<XcfFrameworkReleaseIngest, 'signature_base64'> & {
          readonly artifact_media_type: string;
          readonly retrieved_at: string;
        };
        readonly artifactBytes: Buffer;
        readonly artifactSha256: string;
        readonly signatureResult: 'VALID' | 'INVALID';
        readonly objects: readonly XcfFrameworkObject[];
        readonly licenseIdentity: string | null;
        readonly licenseVersion: string | null;
        readonly quarantineReason?: XcfM1QuarantineReason;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<XcfM1MutationReceipt<XcfFrameworkRelease>>;
  approveRelease(
    input: XcfM1Actor &
      XcfM1Metadata & {
        readonly releaseId: string;
        readonly command: XcfExpectedVersion;
        readonly idempotencyKey: string;
        readonly requestHash: string;
      },
  ): Promise<XcfM1MutationReceipt<XcfFrameworkRelease>>;
  transitionSource(
    input: XcfM1Actor &
      XcfM1Metadata & {
        readonly sourceId: string;
        readonly transition: 'ACTIVATE' | 'SUSPEND' | 'REVOKE';
        readonly command: XcfExpectedVersion | XcfProtectedTransition;
        readonly idempotencyKey: string;
        readonly requestHash: string;
        readonly targetReferenceHash?: string;
        readonly verifyAttestation?: () => Promise<boolean>;
      },
  ): Promise<XcfM1MutationReceipt<XcfFrameworkSource>>;
  transitionRelease(
    input: XcfM1Actor &
      XcfM1Metadata & {
        readonly releaseId: string;
        readonly transition: 'ACTIVATE' | 'REVOKE';
        readonly command: XcfProtectedTransition;
        readonly idempotencyKey: string;
        readonly requestHash: string;
        readonly targetReferenceHash: string;
        readonly verifyAttestation: () => Promise<boolean>;
      },
  ): Promise<XcfM1MutationReceipt<XcfFrameworkRelease>>;
}

export class XcfFrameworkRegistryService {
  private readonly artifactValidator: XcfFrameworkArtifactValidator;

  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly memberships: ActiveMembershipRepository,
    private readonly repository: XcfM1Repository,
    private readonly artifactAcquisition: XcfArtifactAcquisitionPort,
    trustedKeyResolver: XcfTrustedKeyResolver,
    private readonly attestation: XcfM1ConsumptionAttestationPort,
    private readonly securityAudit: SecurityAuditPort,
    private readonly governanceTenantId: string,
    private readonly maximumArtifactBytes: number,
  ) {
    this.artifactValidator = new XcfFrameworkArtifactValidator(
      trustedKeyResolver,
      maximumArtifactBytes,
    );
  }

  async createPublisher(
    header: string | undefined,
    command: XcfPublisherCreate,
    idempotencyKey: string,
    metadata: XcfM1Metadata,
  ) {
    const actor = await this.actor(header, XCF_M1_PERMISSIONS.publisherAdminister, metadata);
    return this.repository.createPublisher({
      ...actor,
      ...metadata,
      publisherId: randomUUID(),
      command,
      idempotencyKey,
      requestHash: stableHash(command),
    });
  }

  async registerSource(
    header: string | undefined,
    command: XcfFrameworkSourceCreate,
    idempotencyKey: string,
    metadata: XcfM1Metadata,
  ) {
    const actor = await this.actor(header, XCF_M1_PERMISSIONS.sourceRegister, metadata);
    return this.repository.registerSource({
      ...actor,
      ...metadata,
      sourceId: randomUUID(),
      frameworkId: randomUUID(),
      command,
      idempotencyKey,
      requestHash: stableHash(command),
    });
  }

  async readSource(header: string | undefined, sourceId: string, metadata: XcfM1Metadata) {
    const actor = await this.actor(header, XCF_M1_PERMISSIONS.sourceRead, metadata);
    const source = await this.repository.readSource({ ...actor, ...metadata, sourceId });
    if (source === null) throw new XcfM1Failure('NOT_FOUND');
    return source;
  }

  async ingestRelease(
    header: string | undefined,
    command: XcfFrameworkReleaseIngest,
    idempotencyKey: string,
    metadata: XcfM1Metadata,
  ) {
    const actor = await this.actor(header, XCF_M1_PERMISSIONS.releaseIngest, metadata);
    const policy = await this.repository.readSourceIngestionPolicy({
      ...actor,
      ...metadata,
      sourceId: command.source_id,
    });
    if (
      policy === null ||
      policy.status !== 'ACTIVE' ||
      policy.publisherTrustStatus !== 'TRUSTED' ||
      policy.reviewDueAt.getTime() <= Date.now()
    )
      throw new XcfM1Failure('SOURCE_NOT_TRUSTED');
    let acquired;
    try {
      acquired = await this.artifactAcquisition.acquire(command.artifact_uri);
    } catch (error) {
      const reason = error instanceof XcfM1Failure ? error.code : 'SOURCE_UNAVAILABLE';
      const { signature_base64: signature, ...redacted } = command;
      await this.repository.recordIngestionFailure({
        ...actor,
        ...metadata,
        sourceId: command.source_id,
        artifactUri: command.artifact_uri,
        reason,
        idempotencyKey,
        requestHash: stableHash({ ...redacted, signature_sha256: sha256(Buffer.from(signature)) }),
      });
      throw error instanceof XcfM1Failure ? error : new XcfM1Failure('SOURCE_UNAVAILABLE');
    }
    const validated = await this.artifactValidator.validate(policy, command, acquired);
    const { signature_base64: signature, ...boundedCommand } = command;
    return this.repository.ingestRelease({
      ...actor,
      ...metadata,
      releaseId: randomUUID(),
      artifactId: randomUUID(),
      command: {
        ...boundedCommand,
        artifact_media_type: validated.mediaType,
        retrieved_at: validated.retrievedAt,
      },
      artifactBytes: validated.artifactBytes,
      artifactSha256: validated.artifactSha256,
      signatureResult: validated.signatureVerified ? 'VALID' : 'INVALID',
      objects: validated.objects,
      licenseIdentity: validated.licenseIdentity,
      licenseVersion: validated.licenseVersion,
      ...(validated.quarantineReason === undefined
        ? {}
        : { quarantineReason: validated.quarantineReason }),
      idempotencyKey,
      requestHash: stableHash({
        ...boundedCommand,
        artifact_sha256: validated.artifactSha256,
        signature_sha256: sha256(Buffer.from(signature)),
      }),
    });
  }

  async approveRelease(
    header: string | undefined,
    releaseId: string,
    command: XcfExpectedVersion,
    idempotencyKey: string,
    metadata: XcfM1Metadata,
  ) {
    const actor = await this.actor(header, XCF_M1_PERMISSIONS.releaseApprove, metadata);
    return this.repository.approveRelease({
      ...actor,
      ...metadata,
      releaseId,
      command,
      idempotencyKey,
      requestHash: stableHash({ releaseId, ...command }),
    });
  }

  async transitionSource(
    header: string | undefined,
    sourceId: string,
    transition: 'ACTIVATE' | 'SUSPEND' | 'REVOKE',
    command: XcfExpectedVersion | XcfProtectedTransition,
    idempotencyKey: string,
    metadata: XcfM1Metadata,
  ) {
    const permission = {
      ACTIVATE: XCF_M1_PERMISSIONS.sourceActivate,
      SUSPEND: XCF_M1_PERMISSIONS.sourceSuspend,
      REVOKE: XCF_M1_PERMISSIONS.sourceRevoke,
    }[transition];
    if (transition !== 'SUSPEND' && !isProtected(command)) throw new XcfM1Failure('MPA_DENIED');
    const actor = await this.actor(header, permission, metadata);
    const contextToken =
      transition === 'SUSPEND'
        ? actor.contextToken
        : await this.mpaConsumptionContext(actor, metadata);
    const targetReferenceHash = xcfM1TargetReferenceHash(
      actor.tenantId,
      sourceId,
      permission,
      command.expected_version,
    );
    return this.repository.transitionSource({
      ...actor,
      contextToken,
      ...metadata,
      sourceId,
      transition,
      command,
      idempotencyKey,
      requestHash: stableHash({ sourceId, transition, ...command }),
      targetReferenceHash,
      ...(isProtected(command)
        ? {
            verifyAttestation: async () =>
              (
                await this.attestation.verify({
                  reference: command.attestation_reference,
                  tenantId: actor.tenantId,
                  authorizationId: command.authorization_id,
                  operation: permission,
                  targetReferenceHash,
                  consumerUserId: actor.userId,
                })
              ).verified,
          }
        : {}),
    });
  }

  async transitionRelease(
    header: string | undefined,
    releaseId: string,
    transition: 'ACTIVATE' | 'REVOKE',
    command: XcfProtectedTransition,
    idempotencyKey: string,
    metadata: XcfM1Metadata,
  ) {
    const permission =
      transition === 'ACTIVATE'
        ? XCF_M1_PERMISSIONS.releaseActivate
        : XCF_M1_PERMISSIONS.releaseRevoke;
    const actor = await this.actor(header, permission, metadata);
    const contextToken = await this.mpaConsumptionContext(actor, metadata);
    const targetReferenceHash = xcfM1TargetReferenceHash(
      actor.tenantId,
      releaseId,
      permission,
      command.expected_version,
    );
    return this.repository.transitionRelease({
      ...actor,
      contextToken,
      ...metadata,
      releaseId,
      transition,
      command,
      idempotencyKey,
      requestHash: stableHash({ releaseId, transition, ...command }),
      targetReferenceHash,
      verifyAttestation: async () =>
        (
          await this.attestation.verify({
            reference: command.attestation_reference,
            tenantId: actor.tenantId,
            authorizationId: command.authorization_id,
            operation: permission,
            targetReferenceHash,
            consumerUserId: actor.userId,
          })
        ).verified,
    });
  }

  private async actor(
    header: string | undefined,
    action: string,
    metadata: XcfM1Metadata,
  ): Promise<XcfM1Actor> {
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
        requestedTenantId: this.governanceTenantId,
      });
      throw new XcfM1Failure('UNAUTHENTICATED');
    }
    if (identity === null) throw new XcfM1Failure('UNAUTHENTICATED');
    const membership = await this.contexts.resolveMembership(
      identity.subject,
      this.governanceTenantId,
    );
    const active = (await this.memberships.listActiveMembershipsBySubject(identity.subject)).find(
      (candidate) =>
        candidate.tenantId === this.governanceTenantId && candidate.userId === membership?.userId,
    );
    if (membership === null || active === undefined)
      return this.deny(identity.subject, action, metadata);
    const decision = await this.authorization.authorize({
      action,
      resource: 'xcf:framework-registry',
      subject_id: membership.userId,
      tenant_id: this.governanceTenantId,
      attributes: {},
    });
    if (!decision.allowed) return this.deny(identity.subject, action, metadata);
    const issued = await this.contexts.issueContext(
      identity.subject,
      this.governanceTenantId,
      action,
    );
    if (issued === null) return this.deny(identity.subject, action, metadata);
    return {
      tenantId: this.governanceTenantId,
      userId: issued.userId,
      membershipId: active.membershipId,
      subject: identity.subject,
      contextToken: issued.contextToken,
    };
  }

  private async mpaConsumptionContext(actor: XcfM1Actor, metadata: XcfM1Metadata) {
    const action = 'platform.mpa.consume';
    const decision = await this.authorization.authorize({
      action,
      resource: 'platform:multi-person-authorization',
      subject_id: actor.userId,
      tenant_id: actor.tenantId,
      attributes: {},
    });
    if (!decision.allowed) return this.deny(actor.subject, action, metadata);
    const issued = await this.contexts.issueContext(actor.subject, actor.tenantId, action);
    if (issued === null) return this.deny(actor.subject, action, metadata);
    return issued.contextToken;
  }

  private async deny(subject: string, action: string, metadata: XcfM1Metadata): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode: 'XCF_M1_AUTHORITY_DENIED',
      requestId: metadata.requestId,
      requestedTenantId: this.governanceTenantId,
    });
    throw new XcfM1Failure('FORBIDDEN');
  }
}

export function xcfM1TargetReferenceHash(
  tenantId: string,
  targetId: string,
  operation: string,
  expectedVersion: number,
) {
  return stableHash(`xcf-m1:v1:${tenantId}:${targetId}:${operation}:version:${expectedVersion}`);
}

function isProtected(command: XcfExpectedVersion | XcfProtectedTransition) {
  return 'authorization_id' in command && 'attestation_reference' in command;
}

function stableHash(value: unknown) {
  return sha256(Buffer.from(JSON.stringify(canonicalValue(value)), 'utf8'));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined && child !== null)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  return value;
}

function sha256(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
