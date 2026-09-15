import { createHash, randomUUID } from 'node:crypto';
import type {
  FusionFailureCode,
  FusionRequest,
  FusionResponseCandidate,
  FusionResult,
  Xcap005FusionEvidenceProjection,
} from '@acs/contracts';
import {
  fusionResponseCandidateSchema,
  fusionRequestCommandSchema,
  fusionRequestSchema,
  fusionResultSchema,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import type {
  ActiveMembershipRepository,
  IdentityAdapter,
  SecurityAuditPort,
  TenantContextRepository,
} from './platform-context.js';

export const FUSION_PERMISSIONS = {
  request: 'cyberdefense.fusion.request',
  read: 'cyberdefense.fusion.read',
} as const;

export class CognitiveFusionFailure extends Error {
  constructor(
    readonly code: FusionFailureCode,
    message = 'Fusion request is unavailable.',
    readonly dependencyClass?:
      | 'NONE'
      | 'XCAP005_EVIDENCE'
      | 'PLATFORM_CONTEXT'
      | 'AUTHORIZATION'
      | 'EVENT_FOUNDATION'
      | 'AUDIT'
      | 'IDEMPOTENCY_RECEIPT'
      | 'AI_GATEWAY_CONTRACT',
  ) {
    super(message);
  }
}

export type FusionAiGatewayIdentityState =
  | 'NOT_APPLICABLE_M0'
  | 'TRUSTED'
  | 'MISSING'
  | 'MISMATCHED'
  | 'UNTRUSTED_PROVIDER'
  | 'UNTRUSTED_MODEL'
  | 'REVOKED'
  | 'SUBSTITUTED';

export interface FusionM0ContractAssessment {
  readonly aiGatewayAvailability: 'NOT_REQUIRED_M0' | 'AVAILABLE' | 'UNAVAILABLE';
  readonly providerModelIdentityState: FusionAiGatewayIdentityState;
  readonly operationalDecisionConfidence: { readonly state: 'UNKNOWN'; readonly value: null };
  readonly responseCandidates: readonly FusionResponseCandidate[];
}

export interface FusionM0ContractBoundaryPort {
  assess(input: {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly reasoningMode: FusionRequest['requested_reasoning_mode'];
    readonly reasoningPurpose: FusionRequest['reasoning_purpose'];
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<FusionM0ContractAssessment>;
}

export const modelFreeM0ContractBoundary: FusionM0ContractBoundaryPort = {
  assess() {
    return Promise.resolve({
      aiGatewayAvailability: 'NOT_REQUIRED_M0',
      providerModelIdentityState: 'NOT_APPLICABLE_M0',
      operationalDecisionConfidence: { state: 'UNKNOWN', value: null },
      responseCandidates: [],
    });
  },
};

export interface Xcap005FusionEvidenceResolutionPort {
  resolve(input: {
    readonly authorizationHeader: string;
    readonly tenantId: string;
    readonly evidenceId: string;
    readonly evidenceVersion: number;
    readonly provenanceReference: string;
    readonly resolvedAt: string;
    readonly requestId: string;
    readonly correlationId: string;
    readonly actorUserId: string;
  }): Promise<Xcap005FusionEvidenceProjection | null>;
}

export interface FusionReceiptRepository {
  execute(input: {
    readonly tenantId: string;
    readonly contextToken: string;
    readonly actorUserId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly fusionRequestId: string;
    readonly fusionResultId: string;
    readonly reasoningMode: FusionRequest['requested_reasoning_mode'];
    readonly reasoningPurpose: FusionRequest['reasoning_purpose'];
    readonly evidenceReferenceCount: number;
    readonly contextSnapshotPresent: boolean;
    readonly requestId: string;
    readonly correlationId: string;
    readonly expiresAt: Date;
    readonly produce: (
      completedAt: string,
      fusionRequestId: string,
      fusionResultId: string,
      requestId: string,
      correlationId: string,
    ) => Promise<FusionResult>;
  }): Promise<{ readonly result: FusionResult; readonly replay: boolean }>;
}

export interface FusionTelemetryPort {
  record(input: {
    readonly outcome: 'COMPLETED' | 'REFUSED' | 'FAILED';
    readonly reasoningMode: FusionRequest['requested_reasoning_mode'];
    readonly referenceCount: number;
  }): void;
}

export const noOpFusionTelemetry: FusionTelemetryPort = { record() {} };

interface FusionActor {
  readonly authorizationHeader: string;
  readonly contextValidUntil: string | undefined;
  readonly userId: string;
  readonly membershipId: string;
  readonly contextToken: string;
}

export class CognitiveCyberFusionM0Service {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly memberships: ActiveMembershipRepository,
    private readonly evidence: Xcap005FusionEvidenceResolutionPort,
    private readonly receipts: FusionReceiptRepository,
    private readonly securityAudit: SecurityAuditPort,
    private readonly receiptLifetimeSeconds: number,
    private readonly telemetry: FusionTelemetryPort = noOpFusionTelemetry,
    private readonly contractBoundary: FusionM0ContractBoundaryPort = modelFreeM0ContractBoundary,
  ) {}

  async request(
    authorizationHeader: string | undefined,
    tenantId: string,
    command: unknown,
    metadata: { readonly requestId: string; readonly correlationId: string },
  ) {
    const actor = await this.resolveActor(authorizationHeader, tenantId, metadata);
    if (Buffer.byteLength(canonicalJson(command), 'utf8') > 256 * 1024)
      throw new CognitiveFusionFailure('SCHEMA_INVALID');
    const commandResult = fusionRequestCommandSchema.safeParse(command);
    if (!commandResult.success) {
      if (
        commandResult.error.issues.some(
          ({ path }) => path[0] === 'context_snapshot_reference' && path.includes('valid_until'),
        )
      )
        throw new CognitiveFusionFailure('CONTEXT_STALE');
      const candidate =
        typeof command === 'object' && command !== null
          ? (command as Record<string, unknown>).policy_version
          : undefined;
      if (
        typeof candidate === 'string' &&
        candidate !== '1.0.0' &&
        /^\d+\.\d+\.\d+$/u.test(candidate)
      )
        throw new CognitiveFusionFailure('POLICY_VERSION_MISMATCH');
      throw new CognitiveFusionFailure('SCHEMA_INVALID');
    }
    if (commandResult.data.tenant_id !== undefined && commandResult.data.tenant_id !== tenantId)
      throw new CognitiveFusionFailure('TENANT_CONTEXT_INVALID');
    const parsed = fusionRequestSchema.safeParse({
      ...commandResult.data,
      tenant_id: tenantId,
      fusion_request_id: randomUUID(),
      request_id: metadata.requestId,
      correlation_id: metadata.correlationId,
    });
    if (!parsed.success) throw new CognitiveFusionFailure('SCHEMA_INVALID');
    const request = parsed.data;
    await this.validateContext(request, actor, tenantId, metadata.requestId);
    const requestHash = sha256(
      canonicalJson({
        request: {
          ...request,
          fusion_request_id: undefined,
          request_id: undefined,
          correlation_id: undefined,
          context_snapshot_reference:
            request.context_snapshot_reference === undefined
              ? undefined
              : {
                  ...request.context_snapshot_reference,
                  captured_at: undefined,
                  valid_until: undefined,
                },
        },
        actor_user_id: actor.userId,
        permission: FUSION_PERMISSIONS.request,
        contract_versions: ['1.0.0', '1.0.0', '1.0.0'],
      }),
    );
    const outcome = await this.receipts.execute({
      tenantId,
      contextToken: actor.contextToken,
      actorUserId: actor.userId,
      idempotencyKey: request.idempotency_key,
      requestHash,
      fusionRequestId: request.fusion_request_id,
      fusionResultId: randomUUID(),
      reasoningMode: request.requested_reasoning_mode,
      reasoningPurpose: request.reasoning_purpose,
      evidenceReferenceCount: request.evidence_references.length,
      contextSnapshotPresent: request.context_snapshot_reference !== undefined,
      requestId: metadata.requestId,
      correlationId: metadata.correlationId,
      expiresAt: new Date(Date.now() + this.receiptLifetimeSeconds * 1000),
      produce: async (
        completedAt,
        fusionRequestId,
        fusionResultId,
        canonicalRequestId,
        canonicalCorrelationId,
      ) =>
        this.synthesize(
          {
            ...request,
            fusion_request_id: fusionRequestId,
            request_id: canonicalRequestId,
            correlation_id: canonicalCorrelationId,
          },
          actor,
          completedAt,
          fusionResultId,
        ),
    });
    this.telemetry.record({
      outcome: outcome.result.status === 'REFUSED' ? 'REFUSED' : 'COMPLETED',
      reasoningMode: request.requested_reasoning_mode,
      referenceCount: request.evidence_references.length,
    });
    return outcome;
  }

  private async validateContext(
    request: FusionRequest,
    actor: FusionActor,
    tenantId: string,
    requestId: string,
  ) {
    const context = request.context_snapshot_reference;
    if (
      context &&
      (context.snapshot_id !== requestId ||
        context.tenant_id !== tenantId ||
        context.user_id !== actor.userId ||
        context.membership_id !== actor.membershipId ||
        actor.contextValidUntil === undefined ||
        context.valid_until !== actor.contextValidUntil ||
        Date.parse(context.captured_at) > Date.now() ||
        !Number.isFinite(Date.parse(actor.contextValidUntil)) ||
        Date.parse(actor.contextValidUntil) <= Date.now())
    )
      throw new CognitiveFusionFailure('CONTEXT_STALE');
    if (context) {
      const decision = await this.authorization.authorize({
        action: 'platform.context.read',
        resource: 'platform:tenant-context',
        subject_id: actor.userId,
        tenant_id: tenantId,
        attributes: {},
      });
      if (!decision.allowed) throw new CognitiveFusionFailure('TENANT_CONTEXT_INVALID');
    }
  }

  private async synthesize(
    request: FusionRequest,
    actor: FusionActor,
    completedAt: string,
    fusionResultId: string,
  ): Promise<FusionResult> {
    const contractAssessment = await this.contractBoundary
      .assess({
        tenantId: request.tenant_id,
        actorUserId: actor.userId,
        reasoningMode: request.requested_reasoning_mode,
        reasoningPurpose: request.reasoning_purpose,
        requestId: request.request_id,
        correlationId: request.correlation_id,
      })
      .catch(() => {
        throw new CognitiveFusionFailure(
          'DEPENDENCY_UNAVAILABLE',
          'Fusion request is unavailable.',
          'AI_GATEWAY_CONTRACT',
        );
      });
    validateAiGatewayContract(contractAssessment);
    const references = [...request.evidence_references].sort(
      (left, right) =>
        left.resource_id.localeCompare(right.resource_id) ||
        Number(left.resource_version) - Number(right.resource_version),
    );
    const projections: Xcap005FusionEvidenceProjection[] = [];
    for (const reference of references) {
      if (reference.tenant_id !== request.tenant_id)
        throw new CognitiveFusionFailure('CROSS_TENANT_REFERENCE');
      const projection = await this.evidence.resolve({
        authorizationHeader: actor.authorizationHeader,
        tenantId: request.tenant_id,
        evidenceId: reference.resource_id,
        evidenceVersion: Number(reference.resource_version),
        provenanceReference: reference.provenance_reference,
        resolvedAt: completedAt,
        requestId: request.request_id,
        correlationId: request.correlation_id,
        actorUserId: actor.userId,
      });
      if (!projection) throw new CognitiveFusionFailure('REFERENCE_NOT_FOUND');
      if (projection.integrity_state !== 'VERIFIED')
        throw new CognitiveFusionFailure('REFERENCE_INTEGRITY_FAILED');
      if (projection.provenance_state !== 'VERIFIED')
        throw new CognitiveFusionFailure('REFERENCE_PROVENANCE_INVALID');
      projections.push(projection);
    }
    const insufficientConfidence =
      contractAssessment.responseCandidates.length > 0 &&
      contractAssessment.operationalDecisionConfidence.state === 'UNKNOWN';
    return buildResult(
      request,
      references,
      projections,
      completedAt,
      fusionResultId,
      insufficientConfidence ? 'INSUFFICIENT_CONFIDENCE' : null,
    );
  }

  private async resolveActor(
    header: string | undefined,
    tenantId: string,
    metadata: { requestId: string; correlationId: string },
  ): Promise<FusionActor> {
    if (header === undefined) throw new CognitiveFusionFailure('AUTHENTICATION_REQUIRED');
    const identity = await this.identity.authenticate(header).catch(() => null);
    if (!identity) throw new CognitiveFusionFailure('AUTHENTICATION_REQUIRED');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    const active = (await this.memberships.listActiveMembershipsBySubject(identity.subject)).find(
      (value) => value.tenantId === tenantId && value.userId === membership?.userId,
    );
    if (!membership || !active) throw new CognitiveFusionFailure('MEMBERSHIP_INACTIVE');
    const decision = await this.authorization.authorize({
      action: FUSION_PERMISSIONS.request,
      resource: 'cyberdefense:fusion',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed) {
      await this.securityAudit.recordDenied({
        action: FUSION_PERMISSIONS.request,
        actorSubject: identity.subject,
        correlationId: metadata.correlationId,
        reasonCode: 'FUSION_AUTHORITY_DENIED',
        requestId: metadata.requestId,
        requestedTenantId: tenantId,
      });
      throw new CognitiveFusionFailure('AUTHORIZATION_DENIED');
    }
    const issued = await this.contexts.issueContext(
      identity.subject,
      tenantId,
      FUSION_PERMISSIONS.request,
    );
    if (!issued) throw new CognitiveFusionFailure('TENANT_CONTEXT_INVALID');
    return {
      authorizationHeader: header,
      contextValidUntil: issued.validUntil,
      userId: issued.userId,
      membershipId: active.membershipId,
      contextToken: issued.contextToken,
    };
  }
}

function buildResult(
  request: FusionRequest,
  references: FusionRequest['evidence_references'],
  projections: readonly Xcap005FusionEvidenceProjection[],
  completedAt: string,
  resultId: string,
  refusalCode: 'INSUFFICIENT_CONFIDENCE' | null,
): FusionResult {
  const assertions = refusalCode
    ? []
    : request.requested_reasoning_mode === 'REFERENCE_VALIDATION'
      ? projections.map((projection, index) => ({
          assertion_id: uuidV5(
            `urn:acs:xcap011:m0:${request.fusion_request_id}:assertion:${index}`,
          ),
          assertion_class: 'INFERENCE' as const,
          statement: `Evidence ${projection.evidence_id} version ${projection.evidence_version} passed M0 reference validation.`,
          explanation:
            'The canonical XCAP-005 projection reported verified integrity and provenance.',
          supporting_references: [references[index]!],
          contradicting_references: [],
          contributing_domains: ['ACS-XCAP-005'],
        }))
      : [
          {
            assertion_id: uuidV5(`urn:acs:xcap011:m0:${request.fusion_request_id}:assertion:0`),
            assertion_class: 'INFERENCE' as const,
            statement: `M0 metadata synthesis validated ${projections.length} governed evidence reference(s).`,
            explanation:
              'Every normalized XCAP-005 projection reported verified integrity and provenance.',
            supporting_references: references,
            contradicting_references: [],
            contributing_domains: ['ACS-XCAP-005'],
          },
        ];
  const dimensions = [
    'MODEL_CONFIDENCE',
    'EVIDENCE_SUFFICIENCY',
    'SOURCE_TRUST',
    'CORRELATION_STRENGTH',
    'HYPOTHESIS_CONFIDENCE',
    'OPERATIONAL_DECISION_CONFIDENCE',
  ] as const;
  const rank = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED_SECURITY: 3 } as const;
  const sourceClassification = projections.reduce<keyof typeof rank>(
    (current, projection) =>
      rank[projection.classification] > rank[current] ? projection.classification : current,
    'INTERNAL',
  );
  const classification =
    sourceClassification === 'RESTRICTED_SECURITY' ? 'RESTRICTED' : sourceClassification;
  const evidenceBindings = projections.map((projection, index) => ({
    binding_id: uuidV5(`urn:acs:xcap011:m0:${request.fusion_request_id}:INPUT:${index}`),
    binding_role: 'INPUT' as const,
    reference: references[index]!,
    canonical_owner: 'ACS-XCAP-005' as const,
    resolved_tenant_id: request.tenant_id,
    resolved_resource_id: projection.evidence_id,
    resolved_resource_version: projection.evidence_version,
    integrity_state: projection.integrity_state,
    provenance_state: projection.provenance_state,
    source_trust_state: projection.source_trust_state,
    derivation_state: projection.derivation_state,
    derivation_id: projection.derivation_id,
    classification:
      projection.classification === 'RESTRICTED_SECURITY'
        ? ('RESTRICTED' as const)
        : projection.classification,
    canonicalization_identifier: projection.canonicalization_identifier,
    projection_contract_version: '1.0.0' as const,
    resolved_at: projection.resolved_at,
  }));
  const contextBindings = request.context_snapshot_reference
    ? [
        {
          binding_id: uuidV5(
            `urn:acs:xcap011:m0:${request.fusion_request_id}:INPUT:${projections.length}`,
          ),
          binding_role: 'INPUT' as const,
          reference: {
            reference_type: 'CONTEXT_SNAPSHOT' as const,
            canonical_owner: 'ACS-PLATFORM-CONTEXT' as const,
            resource_id: request.context_snapshot_reference.snapshot_id,
            tenant_id: request.context_snapshot_reference.tenant_id,
            resource_version: request.context_snapshot_reference.source_revision,
          },
          canonical_owner: 'ACS-PLATFORM-CONTEXT' as const,
          resolved_tenant_id: request.context_snapshot_reference.tenant_id,
          resolved_resource_id: request.context_snapshot_reference.snapshot_id,
          resolved_resource_version: request.context_snapshot_reference.source_revision,
          integrity_state: 'NOT_APPLICABLE' as const,
          provenance_state: 'NOT_APPLICABLE' as const,
          source_trust_state: 'NOT_APPLICABLE' as const,
          derivation_state: 'NOT_APPLICABLE' as const,
          derivation_id: null,
          classification: 'INTERNAL' as const,
          canonicalization_identifier: request.context_snapshot_reference.source_revision,
          projection_contract_version: '1.0.0' as const,
          resolved_at: completedAt,
        },
      ]
    : [];
  const inputBindings = [...evidenceBindings, ...contextBindings];
  const provenanceBase = {
    derivation_id: uuidV5(`urn:acs:xcap011:m0:${request.fusion_request_id}:derivation`),
    fusion_request_id: request.fusion_request_id,
    fusion_result_id: resultId,
    tenant_id: request.tenant_id,
    input_bindings: inputBindings,
    support_bindings: [],
    contradiction_bindings: [],
    reasoning_policy_version: '1.0.0' as const,
    confidence_computation_version: '1.0.0' as const,
    generated_at: completedAt,
    model_binding: null,
    canonicalization_version: 'xcap011-m0-provenance-v1' as const,
  };
  const provenance = { ...provenanceBase, binding_sha256: sha256(canonicalJson(provenanceBase)) };
  const result = fusionResultSchema.parse({
    schema_version: '1.0.0',
    fusion_result_id: resultId,
    fusion_request_id: request.fusion_request_id,
    request_id: request.request_id,
    correlation_id: request.correlation_id,
    tenant_id: request.tenant_id,
    status: refusalCode === null ? 'COMPLETED' : 'REFUSED',
    generated_at: completedAt,
    contract_versions: {
      request: '1.0.0',
      result: '1.0.0',
      reference: '1.0.0',
      provenance: '1.0.0',
      confidence: '1.0.0',
    },
    policy_versions: {
      reasoning_policy: '1.0.0',
      confidence_policy: '1.0.0',
      content_policy: '1.0.0',
    },
    assertions,
    hypotheses: [],
    cross_domain_assertions: [],
    explanation: {
      summary:
        refusalCode === null
          ? 'M0 deterministic validation used canonical reference metadata only.'
          : 'M0 refused the response candidate because operational decision confidence is unknown.',
      assertion_explanations: assertions.map(({ assertion_id, explanation }) => ({
        assertion_id,
        rationale: explanation,
      })),
      remaining_uncertainty:
        'M0 performs deterministic metadata processing without model inference.',
    },
    evidence_gaps: [],
    assumptions: [],
    recommended_investigation_actions: [],
    response_candidates: [],
    uncertainty: {
      level: 'UNKNOWN',
      reasons: ['M0 performs deterministic metadata processing without model inference.'],
    },
    confidence: dimensions.map((dimension) => ({
      dimension,
      state: 'UNKNOWN',
      value: null,
      computation_version: '1.0.0',
      policy_version: '1.0.0',
      supporting_references: [],
    })),
    provenance,
    classification,
    failure_code: refusalCode,
  });
  if (Buffer.byteLength(canonicalJson(result), 'utf8') > 512 * 1024)
    throw new CognitiveFusionFailure('MODEL_RESULT_INVALID');
  return result;
}

function validateAiGatewayContract(assessment: FusionM0ContractAssessment): void {
  if (assessment.aiGatewayAvailability === 'UNAVAILABLE')
    throw new CognitiveFusionFailure(
      'DEPENDENCY_UNAVAILABLE',
      'Fusion request is unavailable.',
      'AI_GATEWAY_CONTRACT',
    );
  const validModelFreeState =
    assessment.aiGatewayAvailability === 'NOT_REQUIRED_M0' &&
    assessment.providerModelIdentityState === 'NOT_APPLICABLE_M0';
  const validTrustedContractState =
    assessment.aiGatewayAvailability === 'AVAILABLE' &&
    assessment.providerModelIdentityState === 'TRUSTED';
  if (!validModelFreeState && !validTrustedContractState)
    throw new CognitiveFusionFailure(
      'MODEL_PROVIDER_UNTRUSTED',
      'Fusion request is unavailable.',
      'AI_GATEWAY_CONTRACT',
    );
  if (
    !Array.isArray(assessment.responseCandidates) ||
    assessment.responseCandidates.length > 16 ||
    assessment.responseCandidates.some(
      (candidate) => !fusionResponseCandidateSchema.safeParse(candidate).success,
    )
  )
    throw new CognitiveFusionFailure(
      'MODEL_RESULT_INVALID',
      'Fusion request is unavailable.',
      'AI_GATEWAY_CONTRACT',
    );
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function uuidV5(name: string): string {
  const bytes = createHash('sha1')
    .update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
