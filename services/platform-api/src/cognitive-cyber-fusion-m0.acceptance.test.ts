import {
  fusionCompletedPayloadSchema,
  fusionConfidenceDimensionSchema,
  fusionContentDecisionSchema,
  fusionProvenanceSchema,
  fusionRequestCommandSchema,
  fusionResultSchema,
  fusionUntrustedContentSchema,
  type FusionFailureCode,
  type FusionResult,
} from '@acs/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  CognitiveCyberFusionM0Service,
  CognitiveFusionFailure,
  type FusionAiGatewayIdentityState,
  type FusionM0ContractAssessment,
  type FusionReceiptRepository,
} from './cognitive-cyber-fusion-m0.js';

const uuid = (suffix: number) => `21000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const tenantId = uuid(1);
const command = {
  schema_version: '1.0.0',
  idempotency_key: uuid(2),
  reasoning_purpose: 'EVIDENCE_REFERENCE_VALIDATION',
  requested_reasoning_mode: 'REFERENCE_VALIDATION',
  policy_version: '1.0.0',
  evidence_references: [
    {
      reference_type: 'EVIDENCE',
      canonical_owner: 'ACS-XCAP-005',
      resource_id: uuid(3),
      tenant_id: tenantId,
      resource_version: '1',
      provenance_reference: uuid(4),
    },
  ],
  observable_references: [],
  entity_references: [],
  correlation_references: [],
  graph_references: [],
} as const;

const modelFreeAssessment: FusionM0ContractAssessment = {
  aiGatewayAvailability: 'NOT_REQUIRED_M0',
  providerModelIdentityState: 'NOT_APPLICABLE_M0',
  operationalDecisionConfidence: { state: 'UNKNOWN', value: null },
  responseCandidates: [],
};

class Receipts implements FusionReceiptRepository {
  readonly values = new Map<
    string,
    {
      hash: string;
      result?: FusionResult;
      failure?: {
        code: FusionFailureCode;
        dependencyClass?: CognitiveFusionFailure['dependencyClass'];
      };
    }
  >();
  async execute(input: Parameters<FusionReceiptRepository['execute']>[0]) {
    const key = `${input.tenantId}:${input.idempotencyKey}`;
    const prior = this.values.get(key);
    if (prior) {
      if (prior.hash !== input.requestHash)
        throw new CognitiveFusionFailure('IDEMPOTENCY_CONFLICT');
      if (prior.failure)
        throw new CognitiveFusionFailure(
          prior.failure.code,
          undefined,
          prior.failure.dependencyClass,
        );
      return { result: prior.result!, replay: true };
    }
    try {
      const result = await input.produce(
        '2026-09-09T00:00:00.000Z',
        input.fusionRequestId,
        input.fusionResultId,
        input.requestId,
        input.correlationId,
      );
      this.values.set(key, { hash: input.requestHash, result });
      return { result, replay: false };
    } catch (error) {
      const failure =
        error instanceof CognitiveFusionFailure
          ? { code: error.code, dependencyClass: error.dependencyClass }
          : { code: 'DEPENDENCY_UNAVAILABLE' as const };
      this.values.set(key, { hash: input.requestHash, failure });
      throw new CognitiveFusionFailure(failure.code, undefined, failure.dependencyClass);
    }
  }
}

function harness(
  options: {
    authenticated?: boolean;
    active?: boolean;
    authorized?: boolean;
    contextValidUntil?: string;
    evidenceFailure?: FusionFailureCode;
    integrity?: 'VERIFIED' | 'FAILED';
    provenance?: 'VERIFIED' | 'INVALID';
    receipts?: FusionReceiptRepository;
    contractAssessment?: FusionM0ContractAssessment;
  } = {},
) {
  const evidence = vi.fn(() => {
    if (options.evidenceFailure) throw new CognitiveFusionFailure(options.evidenceFailure);
    return Promise.resolve({
      projection_schema_version: '1.0.0' as const,
      evidence_id: uuid(3),
      tenant_id: tenantId,
      evidence_version: 1,
      integrity_state: options.integrity ?? ('VERIFIED' as const),
      provenance_state: options.provenance ?? ('VERIFIED' as const),
      source_trust_state: 'TRUSTED' as const,
      derivation_state: 'ORIGINAL' as const,
      derivation_id: null,
      classification: 'INTERNAL' as const,
      opaque_blob_reference: uuid(8),
      canonical_owner: 'ACS-XCAP-005' as const,
      canonicalization_identifier: 'xcap005-evidence-metadata-v1' as const,
      resolved_at: '2026-09-09T00:00:00.000Z',
    });
  });
  const telemetry = { record: vi.fn() };
  const contractBoundary = {
    assess: vi.fn().mockResolvedValue(options.contractAssessment ?? modelFreeAssessment),
  };
  const receipts = options.receipts ?? new Receipts();
  const validUntil = options.contextValidUntil ?? new Date(Date.now() + 60_000).toISOString();
  const service = new CognitiveCyberFusionM0Service(
    {
      configured: true,
      authenticate: vi
        .fn()
        .mockResolvedValue(options.authenticated === false ? null : { subject: 'oidc|alice' }),
    },
    {
      authorize: vi
        .fn()
        .mockResolvedValue({ allowed: options.authorized !== false, reason: 'acceptance' }),
    },
    {
      resolveMembership: vi
        .fn()
        .mockResolvedValue(options.active === false ? null : { userId: uuid(5), tenantId }),
      issueContext: vi
        .fn()
        .mockResolvedValue({ userId: uuid(5), tenantId, contextToken: uuid(6), validUntil }),
    } as never,
    {
      listActiveMembershipsBySubject: vi
        .fn()
        .mockResolvedValue(
          options.active === false ? [] : [{ userId: uuid(5), tenantId, membershipId: uuid(7) }],
        ),
    },
    { resolve: evidence },
    receipts,
    { recordDenied: vi.fn() },
    300,
    telemetry,
    contractBoundary,
  );
  return { service, evidence, telemetry, receipts, validUntil, contractBoundary };
}

const metadata = () => ({ requestId: uuid(9), correlationId: uuid(10) });
const execute = (service: CognitiveCyberFusionM0Service, body: unknown = command) =>
  service.request('Bearer opaque', tenantId, body, metadata());
const code = async (promise: Promise<unknown>, expected: FusionFailureCode) =>
  expect(promise).rejects.toMatchObject({ code: expected });

describe('ACS-XCAP-011 M0 governed 43-case acceptance matrix', () => {
  const positive = [
    [
      'XCAP011-M0-POS-001',
      () => expect(fusionRequestCommandSchema.safeParse(command).success).toBe(true),
    ],
    [
      'XCAP011-M0-POS-002',
      async () => {
        const h = harness();
        await execute(h.service);
        expect(h.evidence).toHaveBeenCalledOnce();
      },
    ],
    [
      'XCAP011-M0-POS-003',
      async () =>
        expect(
          fusionResultSchema.safeParse((await execute(harness().service)).result).success,
        ).toBe(true),
    ],
    [
      'XCAP011-M0-POS-004',
      async () => {
        const result = (await execute(harness().service)).result;
        expect(result.confidence).toHaveLength(6);
        expect(
          result.confidence.every((item) => item.state === 'UNKNOWN' && item.value === null),
        ).toBe(true);
      },
    ],
    [
      'XCAP011-M0-POS-005',
      async () => {
        const receipts = new Receipts();
        const h = harness({ receipts });
        const first = await execute(h.service);
        const replay = await execute(h.service);
        expect([first.replay, replay.replay]).toEqual([false, true]);
        expect(replay.result).toEqual(first.result);
      },
    ],
    [
      'XCAP011-M0-POS-006',
      () =>
        expect(
          fusionCompletedPayloadSchema.safeParse({
            fusion_request_id: uuid(1),
            fusion_result_id: uuid(2),
            status: 'COMPLETED',
            assertion_count: 1,
            hypothesis_count: 0,
            cross_domain_assertion_count: 0,
            evidence_gap_count: 0,
            investigation_action_count: 0,
            response_candidate_count: 0,
            request_schema_version: '1.0.0',
            result_schema_version: '1.0.0',
            reference_schema_version: '1.0.0',
            provenance_schema_version: '1.0.0',
            confidence_schema_version: '1.0.0',
            reasoning_policy_version: '1.0.0',
            confidence_policy_version: '1.0.0',
            content_policy_version: '1.0.0',
          }).success,
        ).toBe(true),
    ],
    [
      'XCAP011-M0-POS-007',
      async () => {
        const h = harness();
        await execute(h.service);
        expect(h.telemetry.record).toHaveBeenCalledWith({
          outcome: 'COMPLETED',
          reasoningMode: 'REFERENCE_VALIDATION',
          referenceCount: 1,
        });
      },
    ],
    [
      'XCAP011-M0-POS-008',
      async () => expect((await execute(harness().service)).result.response_candidates).toEqual([]),
    ],
    [
      'XCAP011-M0-POS-009',
      async () => {
        const result = (await execute(harness().service)).result;
        expect([
          result.hypotheses,
          result.cross_domain_assertions,
          result.response_candidates,
        ]).toEqual([[], [], []]);
      },
    ],
    [
      'XCAP011-M0-POS-010',
      async () => {
        const result = (await execute(harness().service)).result;
        expect(result.provenance.input_bindings[0]).toMatchObject({
          canonical_owner: 'ACS-XCAP-005',
          resolved_resource_id: uuid(3),
        });
      },
    ],
  ] as const;

  const negative = [
    [
      'XCAP011-M0-NEG-001',
      () =>
        code(
          harness({ authenticated: false }).service.request(
            undefined,
            tenantId,
            command,
            metadata(),
          ),
          'AUTHENTICATION_REQUIRED',
        ),
    ],
    [
      'XCAP011-M0-NEG-002',
      async () => code(execute(harness({ active: false }).service), 'MEMBERSHIP_INACTIVE'),
    ],
    [
      'XCAP011-M0-NEG-003',
      async () => code(execute(harness({ authorized: false }).service), 'AUTHORIZATION_DENIED'),
    ],
    [
      'XCAP011-M0-NEG-004',
      () =>
        code(
          execute(harness().service, {
            ...command,
            evidence_references: [{ ...command.evidence_references[0], tenant_id: uuid(11) }],
          }),
          'CROSS_TENANT_REFERENCE',
        ),
    ],
    [
      'XCAP011-M0-NEG-005',
      () =>
        code(
          execute(harness({ evidenceFailure: 'REFERENCE_UNAUTHORIZED' }).service),
          'REFERENCE_UNAUTHORIZED',
        ),
    ],
    [
      'XCAP011-M0-NEG-006',
      async () => {
        await code(
          execute(harness({ evidenceFailure: 'REFERENCE_NOT_FOUND' }).service),
          'REFERENCE_NOT_FOUND',
        );
        await code(execute(harness({ integrity: 'FAILED' }).service), 'REFERENCE_INTEGRITY_FAILED');
        await code(
          execute(harness({ provenance: 'INVALID' }).service),
          'REFERENCE_PROVENANCE_INVALID',
        );
      },
    ],
    [
      'XCAP011-M0-NEG-007',
      () =>
        expect(
          fusionRequestCommandSchema.safeParse({ ...command, raw_evidence: 'forbidden' }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-008',
      () =>
        expect(
          fusionUntrustedContentSchema.parse({
            content_class: 'POTENTIAL_PROMPT_INJECTION',
            source_reference: command.evidence_references[0],
            content_reference: uuid(12),
            trust_state: 'UNTRUSTED',
            instruction_state: 'DATA_ONLY',
            redaction_state: 'REJECTED',
            classification_state: 'UNKNOWN',
          }).instruction_state,
        ).toBe('DATA_ONLY'),
    ],
    [
      'XCAP011-M0-NEG-009',
      () =>
        expect(
          fusionUntrustedContentSchema.safeParse({
            content_class: 'EXTERNAL_TELEMETRY',
            source_reference: command.evidence_references[0],
            content_reference: uuid(12),
            trust_state: 'UNTRUSTED',
            instruction_state: 'EXECUTE',
            redaction_state: 'REJECTED',
            classification_state: 'UNKNOWN',
          }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-010',
      async () =>
        expect(
          fusionResultSchema.safeParse({
            ...(await execute(harness().service)).result,
            canonical_entities: [{}],
          }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-011',
      async () =>
        expect(
          fusionResultSchema.safeParse({
            ...(await execute(harness().service)).result,
            canonical_iocs: [{}],
          }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-012',
      () =>
        expect(
          fusionConfidenceDimensionSchema.safeParse({
            dimension: 'MODEL_CONFIDENCE',
            state: 'KNOWN',
            value: 1,
            computation_version: '1.0.0',
            policy_version: '1.0.0',
            supporting_references: [],
          }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-013',
      async () =>
        expect(
          fusionResultSchema.safeParse({
            ...(await execute(harness().service)).result,
            response_candidates: [
              {
                action_id: uuid(13),
                description: 'candidate',
                rationale: 'test',
                protected_operation: 'cyberdefense.response.execute',
                authorization_state: 'AUTHORIZED',
              },
            ],
          }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-014',
      () =>
        expect(fusionRequestCommandSchema.safeParse({ ...command, mpa_bypass: true }).success).toBe(
          false,
        ),
    ],
    [
      'XCAP011-M0-NEG-015',
      () =>
        expect(
          fusionContentDecisionSchema.safeParse({
            classification: 'RESTRICTED',
            classification_authority: 'ACS-XCAP-005',
            redaction_required: false,
            redaction_state: 'NOT_REQUIRED',
            allowed_destination: ['FUSION_RESULT', 'EVENT', 'AUDIT', 'OBSERVABILITY'],
            model_eligibility: 'PROHIBITED_M0',
            event_eligibility: 'METADATA_ONLY',
            audit_eligibility: 'METADATA_ONLY',
            observability_eligibility: 'METADATA_ONLY',
            policy_version: '1.0.0',
          }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-016',
      () =>
        expect(
          fusionRequestCommandSchema.safeParse({ ...command, provider: 'direct' }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-017',
      () =>
        expect(
          fusionRequestCommandSchema.safeParse({ ...command, graph_authority: true }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-NEG-018',
      () =>
        expect(fusionRequestCommandSchema.safeParse({ ...command, maturity: 'M1' }).success).toBe(
          false,
        ),
    ],
    [
      'XCAP011-M0-NEG-019',
      async () => {
        const rejectedStates: FusionAiGatewayIdentityState[] = [
          'MISSING',
          'MISMATCHED',
          'UNTRUSTED_PROVIDER',
          'UNTRUSTED_MODEL',
          'REVOKED',
          'SUBSTITUTED',
        ];
        for (const providerModelIdentityState of rejectedStates) {
          const h = harness({
            contractAssessment: {
              ...modelFreeAssessment,
              aiGatewayAvailability: 'AVAILABLE',
              providerModelIdentityState,
            },
          });
          await expect(execute(h.service)).rejects.toMatchObject({
            code: 'MODEL_PROVIDER_UNTRUSTED',
            dependencyClass: 'AI_GATEWAY_CONTRACT',
          });
          expect(h.contractBoundary.assess).toHaveBeenCalledOnce();
          expect(h.evidence).not.toHaveBeenCalled();
        }
      },
    ],
    [
      'XCAP011-M0-NEG-020',
      async () => {
        const provenance = (await execute(harness().service)).result.provenance;
        expect(
          fusionProvenanceSchema.safeParse({ ...provenance, fusion_result_id: uuid(14) }).success,
        ).toBe(true);
        expect(
          fusionResultSchema.safeParse({
            ...(await execute(harness().service)).result,
            provenance: { ...provenance, fusion_result_id: uuid(14) },
          }).success,
        ).toBe(false);
      },
    ],
    [
      'XCAP011-M0-NEG-021',
      () =>
        expect(fusionRequestCommandSchema.safeParse({ ...command, confidence: 1 }).success).toBe(
          false,
        ),
    ],
  ] as const;

  const failures = [
    [
      'XCAP011-M0-FI-001',
      async () => {
        const h = harness({
          contractAssessment: {
            ...modelFreeAssessment,
            aiGatewayAvailability: 'UNAVAILABLE',
          },
        });
        await expect(execute(h.service)).rejects.toMatchObject({
          code: 'DEPENDENCY_UNAVAILABLE',
          dependencyClass: 'AI_GATEWAY_CONTRACT',
        });
        expect(h.contractBoundary.assess).toHaveBeenCalledOnce();
        expect(h.evidence).not.toHaveBeenCalled();
      },
    ],
    [
      'XCAP011-M0-FI-002',
      () =>
        expect(
          fusionRequestCommandSchema.safeParse({ ...command, model_provider: 'fallback' }).success,
        ).toBe(false),
    ],
    [
      'XCAP011-M0-FI-003',
      async () =>
        code(
          execute(harness({ evidenceFailure: 'DEPENDENCY_TIMEOUT' }).service),
          'DEPENDENCY_TIMEOUT',
        ),
    ],
    [
      'XCAP011-M0-FI-004',
      () => expect(fusionResultSchema.safeParse({ status: 'COMPLETED' }).success).toBe(false),
    ],
    [
      'XCAP011-M0-FI-005',
      () =>
        code(execute(harness().service, { ...command, schema_version: '2.0.0' }), 'SCHEMA_INVALID'),
    ],
    [
      'XCAP011-M0-FI-006',
      () =>
        code(
          execute(harness().service, { ...command, policy_version: '2.0.0' }),
          'POLICY_VERSION_MISMATCH',
        ),
    ],
    [
      'XCAP011-M0-FI-007',
      async () =>
        code(
          execute(harness({ evidenceFailure: 'REFERENCE_OWNER_UNAVAILABLE' }).service),
          'REFERENCE_OWNER_UNAVAILABLE',
        ),
    ],
    [
      'XCAP011-M0-FI-008',
      async () => {
        const h = harness({
          contractAssessment: {
            ...modelFreeAssessment,
            responseCandidates: [
              {
                action_id: uuid(13),
                description: 'Candidate requiring governed operational confidence.',
                rationale: 'M0 fixture for refusal behavior.',
                protected_operation: 'cyberdefense.response.execute',
                authorization_state: 'NOT_AUTHORIZED',
              },
            ],
          },
        });
        const outcome = await execute(h.service);
        expect(outcome.result).toMatchObject({
          status: 'REFUSED',
          failure_code: 'INSUFFICIENT_CONFIDENCE',
          assertions: [],
          hypotheses: [],
          cross_domain_assertions: [],
          evidence_gaps: [],
          assumptions: [],
          recommended_investigation_actions: [],
          response_candidates: [],
          uncertainty: { level: 'UNKNOWN' },
        });
        expect(outcome.result.confidence).toHaveLength(6);
        expect(
          outcome.result.confidence.every(
            ({ state, value, supporting_references }) =>
              state === 'UNKNOWN' && value === null && supporting_references.length === 0,
          ),
        ).toBe(true);
        expect(outcome.result.provenance.input_bindings).toHaveLength(1);
        expect(outcome.result.provenance.model_binding).toBeNull();
        expect(h.contractBoundary.assess).toHaveBeenCalledOnce();
        expect(h.evidence).toHaveBeenCalledOnce();
        expect(h.telemetry.record).toHaveBeenCalledWith(
          expect.objectContaining({ outcome: 'REFUSED' }),
        );
      },
    ],
    [
      'XCAP011-M0-FI-009',
      async () => {
        const expiry = new Date().toISOString();
        const h = harness({ contextValidUntil: expiry });
        await code(
          execute(h.service, {
            ...command,
            context_snapshot_reference: {
              snapshot_id: uuid(9),
              tenant_id: tenantId,
              user_id: uuid(5),
              membership_id: uuid(7),
              membership_status: 'ACTIVE',
              context_permission: 'platform.context.read',
              source_revision: 'platform-context-request-projection-v1',
              projection_version: '1.0.0',
              policy_version: '1.0.0',
              captured_at: expiry,
              valid_until: expiry,
            },
          }),
          'CONTEXT_STALE',
        );
      },
    ],
    [
      'XCAP011-M0-FI-010',
      async () => {
        const h = harness({ receipts: new Receipts() });
        await execute(h.service);
        expect((await execute(h.service)).replay).toBe(true);
      },
    ],
    [
      'XCAP011-M0-FI-011',
      async () => {
        const h = harness({ receipts: new Receipts() });
        await execute(h.service);
        await code(
          execute(h.service, {
            ...command,
            reasoning_purpose: 'EVIDENCE_METADATA_SYNTHESIS',
            requested_reasoning_mode: 'DETERMINISTIC_SYNTHESIS',
          }),
          'IDEMPOTENCY_CONFLICT',
        );
      },
    ],
    [
      'XCAP011-M0-FI-012',
      () =>
        expect(new CognitiveFusionFailure('DEPENDENCY_UNAVAILABLE').code).toBe(
          'DEPENDENCY_UNAVAILABLE',
        ),
    ],
  ] as const;

  it.each(positive)('%s', async (_id, run) => run());
  it.each(negative)('%s', async (_id, run) => run());
  it.each(failures)('%s', async (_id, run) => run());
});
