import { createHash } from 'node:crypto';
import type {
  MultiPersonAuthorizationAuthorityClass,
  MultiPersonAuthorizationEnvelope,
  MultiPersonAuthorizationPolicyId,
  MultiPersonAuthorizationRequest,
  MultiPersonAuthorizationState,
  ProtectedOperation,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  type ActiveMembershipRepository,
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const MPA_PERMISSIONS = [
  'platform.mpa.request',
  'platform.mpa.read',
  'platform.mpa.approve',
  'platform.mpa.reject',
  'platform.mpa.revoke',
  'platform.mpa.consume',
] as const;

export interface MultiPersonAuthorizationPolicy {
  readonly id: MultiPersonAuthorizationPolicyId;
  readonly version: '1.0.0';
  readonly operation: ProtectedOperation;
  readonly requirement: AuthorityClassRequirement;
  readonly expirySeconds: 900;
  readonly consumption: 'SINGLE_USE';
}

export interface AuthorityClassRequirement {
  readonly authorityClass: MultiPersonAuthorizationAuthorityClass;
  readonly count: 1 | 2;
  readonly requesterMustBeIndependent: true;
}

export interface ProtectedOperationBinding {
  readonly operation: ProtectedOperation;
  readonly targetReferenceHash: string;
  readonly policyId: MultiPersonAuthorizationPolicyId;
  readonly policyVersion: '1.0.0';
}

export interface MultiPersonAuthorizationDecision {
  readonly actorUserId: string;
  readonly authorityClass: MultiPersonAuthorizationAuthorityClass;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly attestationReferenceHash?: string;
}

export interface VerifiedApproverBinding {
  readonly actorUserId: string;
  readonly tenantId: string;
  readonly authorityClass: MultiPersonAuthorizationAuthorityClass;
}

export interface PhysicalHumanAttestationReference {
  readonly reference: string;
}

export interface MultiPersonAuthorizationConsumption {
  readonly authorizationId: string;
  readonly consumptionId: string;
  readonly resultingVersion: number;
}

export interface MultiPersonAuthorizationCommandReceipt {
  readonly authorization: MultiPersonAuthorizationRecord;
  readonly replay: boolean;
}

export interface MultiPersonAuthorizationRecord {
  readonly authorizationId: string;
  readonly tenantId: string;
  readonly requesterUserId: string;
  readonly operation: ProtectedOperation;
  readonly targetReferenceHash: string;
  readonly policyId: MultiPersonAuthorizationPolicyId;
  readonly policyVersion: '1.0.0';
  readonly state: MultiPersonAuthorizationState;
  readonly version: number;
  readonly approvalCount: number;
  readonly requiredApprovalCount: number;
  readonly expiresAt: string;
}

export type AttestationFailureReason =
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE'
  | 'UNKNOWN'
  | 'MALFORMED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'IDENTITY_MISMATCH'
  | 'TENANT_MISMATCH'
  | 'POLICY_MISMATCH'
  | 'UNVERIFIED';

export type PhysicalHumanAttestationResult =
  | { readonly verified: true; readonly referenceHash: string }
  | { readonly verified: false; readonly reason: AttestationFailureReason };

export interface PhysicalHumanIndependenceAttestationPort {
  verify(input: {
    readonly reference: string;
    readonly tenantId: string;
    readonly policyId: MultiPersonAuthorizationPolicyId;
    readonly requesterUserId: string;
    readonly approverUserId: string;
    readonly existingApproverUserIds: readonly string[];
  }): Promise<PhysicalHumanAttestationResult>;
}

export class NotConfiguredPhysicalHumanAttestation implements PhysicalHumanIndependenceAttestationPort {
  verify(): Promise<PhysicalHumanAttestationResult> {
    return Promise.resolve({ verified: false, reason: 'NOT_CONFIGURED' });
  }
}

export interface MultiPersonAuthorizationRepository {
  request(input: {
    readonly actorUserId: string;
    readonly actorMembershipId: string;
    readonly contextToken: string;
    readonly tenantId: string;
    readonly binding: ProtectedOperationBinding;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<MultiPersonAuthorizationCommandReceipt>;
  read(input: {
    readonly contextToken: string;
    readonly actorUserId: string;
    readonly tenantId: string;
    readonly authorizationId: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<MultiPersonAuthorizationRecord | null>;
  decide(input: {
    readonly actorUserId: string;
    readonly actorMembershipId: string;
    readonly contextToken: string;
    readonly tenantId: string;
    readonly authorizationId: string;
    readonly expectedVersion: number;
    readonly decision: 'APPROVE' | 'REJECT';
    readonly attestationReferenceHash?: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<MultiPersonAuthorizationCommandReceipt>;
  revoke(input: {
    readonly actorUserId: string;
    readonly actorMembershipId: string;
    readonly contextToken: string;
    readonly tenantId: string;
    readonly authorizationId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<MultiPersonAuthorizationCommandReceipt>;
  approvalPreparation(input: {
    readonly contextToken: string;
    readonly actorUserId: string;
    readonly actorMembershipId: string;
    readonly tenantId: string;
    readonly authorizationId: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<{
    readonly authorization: MultiPersonAuthorizationRecord | null;
    readonly binding: VerifiedApproverBinding | null;
    readonly existingApproverUserIds: readonly string[];
  }>;
}

export type MultiPersonAuthorizationFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STALE_VERSION'
  | 'INVALID_TRANSITION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SELF_APPROVAL_DENIED'
  | 'DUPLICATE_APPROVAL_DENIED'
  | 'WRONG_AUTHORITY_CLASS'
  | 'ATTESTATION_DENIED'
  | 'EXPIRED';

export class MultiPersonAuthorizationFailure extends Error {
  constructor(
    readonly code: MultiPersonAuthorizationFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export interface MultiPersonAuthorizationMetadata {
  readonly requestId: string;
  readonly correlationId: string;
}

export class MultiPersonAuthorizationService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly memberships: ActiveMembershipRepository,
    private readonly repository: MultiPersonAuthorizationRepository,
    private readonly attestation: PhysicalHumanIndependenceAttestationPort,
    private readonly securityAudit: SecurityAuditPort,
  ) {}

  async request(
    header: string | undefined,
    tenantId: string,
    command: MultiPersonAuthorizationRequest,
    idempotencyKey: string,
    metadata: MultiPersonAuthorizationMetadata,
  ): Promise<MultiPersonAuthorizationEnvelope> {
    const actor = await this.actor(header, tenantId, 'platform.mpa.request', metadata);
    const binding = bindingFor(command);
    const result = await this.repository.request({
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      contextToken: actor.contextToken,
      tenantId,
      binding,
      idempotencyKey,
      requestHash: hash({ tenantId, binding }),
      requestId: metadata.requestId,
      correlationId: metadata.correlationId,
    });
    return envelope(result, metadata);
  }

  async read(
    header: string | undefined,
    tenantId: string,
    authorizationId: string,
    metadata: MultiPersonAuthorizationMetadata,
  ): Promise<MultiPersonAuthorizationEnvelope> {
    const actor = await this.actor(header, tenantId, 'platform.mpa.read', metadata);
    const authorization = await this.repository.read({
      contextToken: actor.contextToken,
      actorUserId: actor.userId,
      tenantId,
      authorizationId,
      requestId: metadata.requestId,
      correlationId: metadata.correlationId,
    });
    if (authorization === null) {
      throw new MultiPersonAuthorizationFailure('NOT_FOUND', 'Authorization is not available.');
    }
    return envelope({ authorization, replay: false }, metadata);
  }

  async approve(
    header: string | undefined,
    tenantId: string,
    authorizationId: string,
    expectedVersion: number,
    attestationReference: string,
    idempotencyKey: string,
    metadata: MultiPersonAuthorizationMetadata,
  ): Promise<MultiPersonAuthorizationEnvelope> {
    const actor = await this.actor(header, tenantId, 'platform.mpa.approve', metadata);
    const preparation = await this.repository.approvalPreparation({
      contextToken: actor.contextToken,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      tenantId,
      authorizationId,
      requestId: metadata.requestId,
      correlationId: metadata.correlationId,
    });
    const current = this.required(preparation.authorization);
    if (current.requesterUserId === actor.userId) {
      throw new MultiPersonAuthorizationFailure(
        'SELF_APPROVAL_DENIED',
        'Self approval is prohibited.',
      );
    }
    const binding = preparation.binding;
    if (binding === null) {
      throw new MultiPersonAuthorizationFailure(
        'WRONG_AUTHORITY_CLASS',
        'The required approval authority is not available.',
      );
    }
    const existing = preparation.existingApproverUserIds;
    if (existing.includes(actor.userId)) {
      throw new MultiPersonAuthorizationFailure(
        'DUPLICATE_APPROVAL_DENIED',
        'Duplicate approval is prohibited.',
      );
    }
    const verified = await this.attestation.verify({
      reference: attestationReference,
      tenantId,
      policyId: current.policyId,
      requesterUserId: current.requesterUserId,
      approverUserId: actor.userId,
      existingApproverUserIds: existing,
    });
    if (!verified.verified) {
      throw new MultiPersonAuthorizationFailure(
        'ATTESTATION_DENIED',
        `Physical-human independence attestation was denied (${verified.reason}).`,
      );
    }
    const mutationContext = await this.contexts.issueContext(
      actor.subject,
      tenantId,
      'platform.mpa.approve',
    );
    if (mutationContext === null)
      return this.deny(actor.subject, tenantId, 'platform.mpa.approve', metadata);
    return envelope(
      this.requireNonExpiredTransition(
        await this.repository.decide({
          actorUserId: actor.userId,
          actorMembershipId: actor.membershipId,
          contextToken: mutationContext.contextToken,
          tenantId,
          authorizationId,
          expectedVersion,
          decision: 'APPROVE',
          attestationReferenceHash: verified.referenceHash,
          idempotencyKey,
          requestHash: hash({ authorizationId, expectedVersion, decision: 'APPROVE' }),
          requestId: metadata.requestId,
          correlationId: metadata.correlationId,
        }),
      ),
      metadata,
    );
  }

  async reject(
    header: string | undefined,
    tenantId: string,
    authorizationId: string,
    expectedVersion: number,
    idempotencyKey: string,
    metadata: MultiPersonAuthorizationMetadata,
  ) {
    const actor = await this.actor(header, tenantId, 'platform.mpa.reject', metadata);
    return envelope(
      this.requireNonExpiredTransition(
        await this.repository.decide({
          actorUserId: actor.userId,
          actorMembershipId: actor.membershipId,
          contextToken: actor.contextToken,
          tenantId,
          authorizationId,
          expectedVersion,
          decision: 'REJECT',
          idempotencyKey,
          requestHash: hash({ authorizationId, expectedVersion, decision: 'REJECT' }),
          requestId: metadata.requestId,
          correlationId: metadata.correlationId,
        }),
      ),
      metadata,
    );
  }

  async revoke(
    header: string | undefined,
    tenantId: string,
    authorizationId: string,
    expectedVersion: number,
    idempotencyKey: string,
    metadata: MultiPersonAuthorizationMetadata,
  ) {
    const actor = await this.actor(header, tenantId, 'platform.mpa.revoke', metadata);
    return envelope(
      this.requireNonExpiredTransition(
        await this.repository.revoke({
          actorUserId: actor.userId,
          actorMembershipId: actor.membershipId,
          contextToken: actor.contextToken,
          tenantId,
          authorizationId,
          expectedVersion,
          idempotencyKey,
          requestHash: hash({ authorizationId, expectedVersion, decision: 'REVOKE' }),
          requestId: metadata.requestId,
          correlationId: metadata.correlationId,
        }),
      ),
      metadata,
    );
  }

  private required(current: MultiPersonAuthorizationRecord | null) {
    if (current === null)
      throw new MultiPersonAuthorizationFailure('NOT_FOUND', 'Authorization is not available.');
    if (new Date(current.expiresAt).getTime() <= Date.now())
      throw new MultiPersonAuthorizationFailure('EXPIRED', 'Authorization has expired.');
    if (current.state !== 'REQUESTED' && current.state !== 'PARTIALLY_APPROVED')
      throw new MultiPersonAuthorizationFailure(
        'INVALID_TRANSITION',
        'Authorization transition is not available.',
      );
    return current;
  }

  private requireNonExpiredTransition(result: MultiPersonAuthorizationCommandReceipt) {
    if (result.authorization.state === 'EXPIRED')
      throw new MultiPersonAuthorizationFailure('EXPIRED', 'Authorization has expired.');
    return result;
  }

  private async actor(
    header: string | undefined,
    tenantId: string,
    action: (typeof MPA_PERMISSIONS)[number],
    metadata: MultiPersonAuthorizationMetadata,
  ) {
    let identity;
    try {
      identity = await this.identity.authenticate(header);
    } catch (error) {
      const reasonCode =
        error instanceof IdentityAuthenticationError ? error.reasonCode : 'IDENTITY_PROVIDER_ERROR';
      await this.securityAudit.recordDenied({
        action,
        correlationId: metadata.correlationId,
        reasonCode,
        requestId: metadata.requestId,
        requestedTenantId: tenantId,
      });
      throw new MultiPersonAuthorizationFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (identity === null)
      throw new MultiPersonAuthorizationFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (membership === null) return this.deny(identity.subject, tenantId, action, metadata);
    const activeMembership = (
      await this.memberships.listActiveMembershipsBySubject(identity.subject)
    ).find(
      (candidate) => candidate.tenantId === tenantId && candidate.userId === membership.userId,
    );
    if (activeMembership === undefined)
      return this.deny(identity.subject, tenantId, action, metadata);
    const decision = await this.authorization.authorize({
      action,
      resource: 'platform:multi-person-authorization',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed) return this.deny(identity.subject, tenantId, action, metadata);
    const issued = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (issued === null) return this.deny(identity.subject, tenantId, action, metadata);
    return { ...issued, membershipId: activeMembership.membershipId, subject: identity.subject };
  }

  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    metadata: MultiPersonAuthorizationMetadata,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode: 'MPA_AUTHORITY_DENIED',
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
    throw new MultiPersonAuthorizationFailure(
      'FORBIDDEN',
      'Multi-person authorization operation is not available.',
    );
  }
}

export const MPA_POLICIES: Readonly<
  Record<MultiPersonAuthorizationPolicyId, MultiPersonAuthorizationPolicy>
> = {
  'cyberdefense.evidence.export.standard': policy(
    'cyberdefense.evidence.export.standard',
    'cyberdefense.evidence.export',
    'cyberdefense.evidence.export_authority',
    1,
  ),
  'cyberdefense.evidence.export.restricted_security': policy(
    'cyberdefense.evidence.export.restricted_security',
    'cyberdefense.evidence.export',
    'cyberdefense.evidence.export_authority',
    2,
  ),
  'cyberdefense.evidence.retention_override': policy(
    'cyberdefense.evidence.retention_override',
    'cyberdefense.evidence.retention_override',
    'cyberdefense.evidence.retention_override_authority',
    2,
  ),
  'cyberdefense.evidence.destroy': policy(
    'cyberdefense.evidence.destroy',
    'cyberdefense.evidence.destroy',
    'cyberdefense.evidence.destroy_authority',
    2,
  ),
};

function policy(
  id: MultiPersonAuthorizationPolicyId,
  operation: ProtectedOperation,
  authorityClass: MultiPersonAuthorizationAuthorityClass,
  count: 1 | 2,
): MultiPersonAuthorizationPolicy {
  return {
    id,
    version: '1.0.0',
    operation,
    requirement: { authorityClass, count, requesterMustBeIndependent: true },
    expirySeconds: 900,
    consumption: 'SINGLE_USE',
  };
}

function bindingFor(command: MultiPersonAuthorizationRequest): ProtectedOperationBinding {
  const policy = MPA_POLICIES[command.policy_id];
  if (
    policy === undefined ||
    policy.version !== command.policy_version ||
    policy.operation !== command.operation
  ) {
    throw new MultiPersonAuthorizationFailure('FORBIDDEN', 'Policy binding is not available.');
  }
  return {
    operation: command.operation,
    targetReferenceHash: hash(command.target_reference),
    policyId: command.policy_id,
    policyVersion: command.policy_version,
  };
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function envelope(
  result: MultiPersonAuthorizationCommandReceipt,
  metadata: MultiPersonAuthorizationMetadata,
): MultiPersonAuthorizationEnvelope {
  const a = result.authorization;
  return {
    data: {
      authorization_id: a.authorizationId,
      tenant_id: a.tenantId,
      operation: a.operation,
      target_reference_hash: a.targetReferenceHash,
      policy_id: a.policyId,
      policy_version: a.policyVersion,
      state: a.state,
      version: a.version,
      approval_count: a.approvalCount,
      required_approval_count: a.requiredApprovalCount,
      expires_at: a.expiresAt,
    },
    meta: {
      request_id: metadata.requestId,
      correlation_id: metadata.correlationId,
      idempotent_replay: result.replay,
    },
  };
}
