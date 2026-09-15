import { z } from 'zod';

const nilUuid = '00000000-0000-0000-0000-000000000000';
const boundedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(
      (value) =>
        !Array.from(value).some((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint <= 31 || codePoint === 127;
        }),
    )
    .refine((value) => value === value.normalize('NFC'));

export const fusionUuidSchema = z
  .uuid()
  .refine((value) => value !== nilUuid, 'nil UUID is prohibited')
  .refine((value) => value === value.toLowerCase(), 'UUID must be lowercase');
export const fusionSha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
export const fusionVersionSchema = z.literal('1.0.0');
export const fusionClassificationSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'BOARD_CONFIDENTIAL',
]);

export const fusionFailureCodeSchema = z.enum([
  'AUTHENTICATION_REQUIRED',
  'MEMBERSHIP_INACTIVE',
  'TENANT_CONTEXT_INVALID',
  'AUTHORIZATION_DENIED',
  'CROSS_TENANT_REFERENCE',
  'REFERENCE_UNAUTHORIZED',
  'REFERENCE_NOT_FOUND',
  'REFERENCE_VERSION_MISMATCH',
  'REFERENCE_OWNER_UNAVAILABLE',
  'REFERENCE_OWNER_UNSUPPORTED',
  'REFERENCE_INTEGRITY_FAILED',
  'REFERENCE_PROVENANCE_INVALID',
  'PROVENANCE_MISSING',
  'PROVENANCE_INVALID',
  'PROVENANCE_TAMPERED',
  'CONFIDENCE_INVALID',
  'INSUFFICIENT_CONFIDENCE',
  'CONTEXT_STALE',
  'POLICY_VERSION_MISMATCH',
  'DEPENDENCY_UNAVAILABLE',
  'DEPENDENCY_TIMEOUT',
  'SCHEMA_INVALID',
  'REPLAY_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'UNTRUSTED_CONTENT',
  'SENSITIVE_CONTENT_REJECTED',
  'MODEL_PROVIDER_UNTRUSTED',
  'MODEL_RESULT_INVALID',
]);

export const fusionEvidenceReferenceSchema = z.strictObject({
  reference_type: z.literal('EVIDENCE'),
  canonical_owner: z.literal('ACS-XCAP-005'),
  resource_id: fusionUuidSchema,
  tenant_id: fusionUuidSchema,
  resource_version: z.string().regex(/^[1-9][0-9]*$/u),
  provenance_reference: fusionUuidSchema,
});
export const fusionContextReferenceSchema = z.strictObject({
  reference_type: z.literal('CONTEXT_SNAPSHOT'),
  canonical_owner: z.literal('ACS-PLATFORM-CONTEXT'),
  resource_id: fusionUuidSchema,
  tenant_id: fusionUuidSchema,
  resource_version: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
  provenance_reference: z.never().optional(),
});
export const fusionReferenceSchema = z.discriminatedUnion('reference_type', [
  fusionEvidenceReferenceSchema,
  fusionContextReferenceSchema,
]);

export const fusionContextSnapshotSchema = z
  .strictObject({
    snapshot_id: fusionUuidSchema,
    tenant_id: fusionUuidSchema,
    user_id: fusionUuidSchema,
    membership_id: fusionUuidSchema,
    membership_status: z.literal('ACTIVE'),
    context_permission: z.literal('platform.context.read'),
    source_revision: z.literal('platform-context-request-projection-v1'),
    projection_version: fusionVersionSchema,
    policy_version: fusionVersionSchema,
    captured_at: z.iso.datetime({ offset: true }),
    valid_until: z.iso.datetime({ offset: true }),
  })
  .superRefine((value, context) => {
    if (Date.parse(value.captured_at) >= Date.parse(value.valid_until))
      context.addIssue({
        code: 'custom',
        message: 'context snapshot is stale',
        path: ['valid_until'],
      });
  });

const fusionRequestShape = {
  schema_version: fusionVersionSchema,
  tenant_id: fusionUuidSchema,
  fusion_request_id: fusionUuidSchema,
  request_id: fusionUuidSchema,
  correlation_id: fusionUuidSchema,
  idempotency_key: fusionUuidSchema,
  reasoning_purpose: z.enum(['EVIDENCE_REFERENCE_VALIDATION', 'EVIDENCE_METADATA_SYNTHESIS']),
  requested_reasoning_mode: z.enum(['REFERENCE_VALIDATION', 'DETERMINISTIC_SYNTHESIS']),
  policy_version: fusionVersionSchema,
  evidence_references: z.array(fusionEvidenceReferenceSchema).min(1).max(128),
  observable_references: z.array(z.never()).max(0),
  entity_references: z.array(z.never()).max(0),
  correlation_references: z.array(z.never()).max(0),
  graph_references: z.array(z.never()).max(0),
  case_reference: z.never().optional(),
  time_window: z
    .strictObject({
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
    })
    .optional(),
  context_snapshot_reference: fusionContextSnapshotSchema.optional(),
};
const validateRequest = (
  value: {
    reasoning_purpose: 'EVIDENCE_REFERENCE_VALIDATION' | 'EVIDENCE_METADATA_SYNTHESIS';
    requested_reasoning_mode: 'REFERENCE_VALIDATION' | 'DETERMINISTIC_SYNTHESIS';
    evidence_references: readonly z.infer<typeof fusionEvidenceReferenceSchema>[];
    time_window?: { start: string; end: string } | undefined;
  },
  context: z.RefinementCtx,
) => {
  const expected =
    value.reasoning_purpose === 'EVIDENCE_REFERENCE_VALIDATION'
      ? 'REFERENCE_VALIDATION'
      : 'DETERMINISTIC_SYNTHESIS';
  if (value.requested_reasoning_mode !== expected)
    context.addIssue({
      code: 'custom',
      message: 'reasoning purpose/mode mismatch',
      path: ['requested_reasoning_mode'],
    });
  if (value.time_window && Date.parse(value.time_window.start) > Date.parse(value.time_window.end))
    context.addIssue({ code: 'custom', message: 'invalid time window', path: ['time_window'] });
  const identities = value.evidence_references.map(
    (reference) =>
      `${reference.canonical_owner}:${reference.tenant_id}:${reference.resource_id}:${reference.resource_version}`,
  );
  if (new Set(identities).size !== identities.length)
    context.addIssue({
      code: 'custom',
      message: 'duplicate reference identity',
      path: ['evidence_references'],
    });
};
export const fusionRequestSchema = z.strictObject(fusionRequestShape).superRefine(validateRequest);
export const fusionRequestCommandSchema = z
  .strictObject({
    schema_version: fusionRequestShape.schema_version,
    tenant_id: fusionRequestShape.tenant_id.optional(),
    idempotency_key: fusionRequestShape.idempotency_key,
    reasoning_purpose: fusionRequestShape.reasoning_purpose,
    requested_reasoning_mode: fusionRequestShape.requested_reasoning_mode,
    policy_version: fusionRequestShape.policy_version,
    evidence_references: fusionRequestShape.evidence_references,
    observable_references: fusionRequestShape.observable_references,
    entity_references: fusionRequestShape.entity_references,
    correlation_references: fusionRequestShape.correlation_references,
    graph_references: fusionRequestShape.graph_references,
    time_window: fusionRequestShape.time_window,
    context_snapshot_reference: fusionRequestShape.context_snapshot_reference,
  })
  .superRefine(validateRequest);

export const fusionConfidenceDimensionSchema = z
  .strictObject({
    dimension: z.enum([
      'MODEL_CONFIDENCE',
      'EVIDENCE_SUFFICIENCY',
      'SOURCE_TRUST',
      'CORRELATION_STRENGTH',
      'HYPOTHESIS_CONFIDENCE',
      'OPERATIONAL_DECISION_CONFIDENCE',
    ]),
    state: z.enum(['KNOWN', 'UNKNOWN']),
    value: z.number().min(0).max(1).nullable(),
    computation_version: fusionVersionSchema,
    policy_version: fusionVersionSchema,
    supporting_references: z.array(fusionReferenceSchema).max(64),
  })
  .superRefine((value, context) => {
    if (
      value.state === 'KNOWN' &&
      (value.value === null || value.supporting_references.length === 0)
    )
      context.addIssue({ code: 'custom', message: 'known confidence requires value and support' });
    if (value.state === 'UNKNOWN' && value.value !== null)
      context.addIssue({ code: 'custom', message: 'unknown confidence requires null value' });
  });

export const fusionProvenanceBindingSchema = z
  .strictObject({
    binding_id: fusionUuidSchema,
    binding_role: z.enum(['INPUT', 'SUPPORT', 'CONTRADICTION']),
    reference: fusionReferenceSchema,
    canonical_owner: z.enum(['ACS-XCAP-005', 'ACS-PLATFORM-CONTEXT']),
    resolved_tenant_id: fusionUuidSchema,
    resolved_resource_id: fusionUuidSchema,
    resolved_resource_version: z.union([
      z.number().int().positive(),
      z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u),
    ]),
    integrity_state: z.enum(['VERIFIED', 'FAILED', 'UNVERIFIABLE', 'NOT_APPLICABLE']),
    provenance_state: z.enum([
      'VERIFIED',
      'INCOMPLETE',
      'INVALID',
      'TAMPERED',
      'UNAVAILABLE',
      'NOT_APPLICABLE',
    ]),
    source_trust_state: z.enum(['UNTRUSTED', 'VALIDATED', 'TRUSTED', 'NOT_APPLICABLE']),
    derivation_state: z.enum(['ORIGINAL', 'DERIVED', 'NOT_APPLICABLE']),
    derivation_id: fusionUuidSchema.nullable(),
    classification: fusionClassificationSchema,
    canonicalization_identifier: boundedText(64),
    projection_contract_version: fusionVersionSchema,
    resolved_at: z.iso.datetime({ offset: true }),
  })
  .superRefine((value, context) => {
    const evidence = value.reference.reference_type === 'EVIDENCE';
    const expectedVersion = evidence
      ? Number(value.reference.resource_version)
      : value.reference.resource_version;
    if (
      value.canonical_owner !== value.reference.canonical_owner ||
      value.resolved_tenant_id !== value.reference.tenant_id ||
      value.resolved_resource_id !== value.reference.resource_id ||
      value.resolved_resource_version !== expectedVersion
    )
      context.addIssue({ code: 'custom', message: 'provenance binding is detached' });
    if (evidence) {
      if (
        value.integrity_state === 'NOT_APPLICABLE' ||
        value.provenance_state === 'NOT_APPLICABLE' ||
        value.source_trust_state === 'NOT_APPLICABLE' ||
        value.derivation_state === 'NOT_APPLICABLE' ||
        value.canonicalization_identifier !== 'xcap005-evidence-metadata-v1' ||
        (value.derivation_state === 'DERIVED') !== (value.derivation_id !== null)
      )
        context.addIssue({ code: 'custom', message: 'evidence provenance state is invalid' });
    } else if (
      value.integrity_state !== 'NOT_APPLICABLE' ||
      value.provenance_state !== 'NOT_APPLICABLE' ||
      value.source_trust_state !== 'NOT_APPLICABLE' ||
      value.derivation_state !== 'NOT_APPLICABLE' ||
      value.derivation_id !== null ||
      value.canonicalization_identifier !== 'platform-context-request-projection-v1'
    )
      context.addIssue({ code: 'custom', message: 'context provenance state is invalid' });
  });

const assertionSchema = z
  .strictObject({
    assertion_id: fusionUuidSchema,
    assertion_class: z.enum([
      'FACT',
      'OBSERVATION',
      'CORRELATION',
      'INFERENCE',
      'HYPOTHESIS',
      'PREDICTION',
      'RECOMMENDATION',
    ]),
    statement: boundedText(4096),
    supporting_references: z.array(fusionReferenceSchema).min(1).max(64),
    contradicting_references: z.array(fusionReferenceSchema).max(64),
    explanation: boundedText(4096),
    contributing_domains: z.array(boundedText(64)).min(1).max(16),
  })
  .superRefine((value, context) => {
    if (new Set(value.contributing_domains).size !== value.contributing_domains.length)
      context.addIssue({ code: 'custom', message: 'contributing domains must be unique' });
  });
const crossDomainAssertionSchema = assertionSchema.superRefine((value, context) => {
  if (value.contributing_domains.length < 2)
    context.addIssue({
      code: 'custom',
      message: 'cross-domain assertions require at least two contributing domains',
      path: ['contributing_domains'],
    });
});
const hypothesisSchema = z.strictObject({
  hypothesis_id: fusionUuidSchema,
  hypothesis_class: z.enum(['INFERENCE', 'PREDICTION']),
  statement: boundedText(4096),
  supporting_references: z.array(fusionReferenceSchema).min(1).max(64),
  contradicting_references: z.array(fusionReferenceSchema).max(64),
  confidence_dimension: z.literal('HYPOTHESIS_CONFIDENCE'),
  state: z.enum(['GENERATED', 'SUPERSEDED']),
});
const evidenceGapSchema = z.strictObject({
  gap_id: fusionUuidSchema,
  description: boundedText(2048),
  required_reference_types: z
    .array(
      z.enum([
        'EVIDENCE',
        'OBSERVABLE',
        'ENTITY',
        'CORRELATION',
        'GRAPH',
        'CASE',
        'CONTEXT_SNAPSHOT',
      ]),
    )
    .min(1)
    .max(7),
});
const assumptionSchema = z.strictObject({
  assumption_id: fusionUuidSchema,
  statement: boundedText(2048),
  supporting_references: z.array(fusionReferenceSchema).max(32),
});
const investigationActionSchema = z.strictObject({
  action_id: fusionUuidSchema,
  description: boundedText(2048),
  rationale: boundedText(2048),
  required_permission: z
    .string()
    .regex(/^[a-z][a-z0-9_.]{2,127}$/u)
    .nullable(),
});
export const fusionResponseCandidateSchema = z.strictObject({
  action_id: fusionUuidSchema,
  description: boundedText(2048),
  rationale: boundedText(2048),
  protected_operation: z.string().regex(/^[a-z][a-z0-9_.]{2,127}$/u),
  authorization_state: z.literal('NOT_AUTHORIZED'),
});

export const fusionProvenanceSchema = z
  .strictObject({
    derivation_id: fusionUuidSchema,
    fusion_request_id: fusionUuidSchema,
    fusion_result_id: fusionUuidSchema,
    tenant_id: fusionUuidSchema,
    input_bindings: z.array(fusionProvenanceBindingSchema).min(1).max(256),
    support_bindings: z.array(fusionProvenanceBindingSchema).max(256),
    contradiction_bindings: z.array(fusionProvenanceBindingSchema).max(256),
    reasoning_policy_version: fusionVersionSchema,
    confidence_computation_version: fusionVersionSchema,
    generated_at: z.iso.datetime({ offset: true }),
    model_binding: z.null(),
    canonicalization_version: z.literal('xcap011-m0-provenance-v1'),
    binding_sha256: fusionSha256Schema,
  })
  .superRefine((value, context) => {
    const groups = [
      ['INPUT', value.input_bindings],
      ['SUPPORT', value.support_bindings],
      ['CONTRADICTION', value.contradiction_bindings],
    ] as const;
    const bindings = groups.flatMap(([, entries]) => entries);
    if (new Set(bindings.map(({ binding_id }) => binding_id)).size !== bindings.length)
      context.addIssue({ code: 'custom', message: 'provenance binding identities must be unique' });
    for (const [role, entries] of groups)
      if (entries.some(({ binding_role }) => binding_role !== role))
        context.addIssue({
          code: 'custom',
          message: 'provenance binding role must match its containing array',
        });
  });

export const fusionResultSchema = z
  .strictObject({
    schema_version: fusionVersionSchema,
    fusion_result_id: fusionUuidSchema,
    fusion_request_id: fusionUuidSchema,
    request_id: fusionUuidSchema,
    correlation_id: fusionUuidSchema,
    tenant_id: fusionUuidSchema,
    status: z.enum(['COMPLETED', 'REFUSED', 'FAILED']),
    generated_at: z.iso.datetime({ offset: true }),
    contract_versions: z.strictObject({
      request: fusionVersionSchema,
      result: fusionVersionSchema,
      reference: fusionVersionSchema,
      provenance: fusionVersionSchema,
      confidence: fusionVersionSchema,
    }),
    policy_versions: z.strictObject({
      reasoning_policy: fusionVersionSchema,
      confidence_policy: fusionVersionSchema,
      content_policy: fusionVersionSchema,
    }),
    assertions: z.array(assertionSchema).max(128),
    hypotheses: z.array(hypothesisSchema).max(64),
    cross_domain_assertions: z.array(crossDomainAssertionSchema).max(64),
    explanation: z.strictObject({
      summary: boundedText(4096),
      assertion_explanations: z
        .array(z.strictObject({ assertion_id: fusionUuidSchema, rationale: boundedText(4096) }))
        .max(128),
      remaining_uncertainty: boundedText(4096),
    }),
    evidence_gaps: z.array(evidenceGapSchema).max(64),
    assumptions: z.array(assumptionSchema).max(64),
    recommended_investigation_actions: z.array(investigationActionSchema).max(32),
    response_candidates: z.array(fusionResponseCandidateSchema).max(16).optional(),
    uncertainty: z.strictObject({
      level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
      reasons: z.array(boundedText(1024)).min(1).max(32),
    }),
    confidence: z.array(fusionConfidenceDimensionSchema).length(6),
    provenance: fusionProvenanceSchema,
    classification: fusionClassificationSchema,
    failure_code: fusionFailureCodeSchema.nullable(),
  })
  .superRefine((value, context) => {
    const dimensions = value.confidence.map(({ dimension }) => dimension);
    if (new Set(dimensions).size !== 6)
      context.addIssue({
        code: 'custom',
        message: 'confidence dimensions must be unique',
        path: ['confidence'],
      });
    if ((value.status === 'COMPLETED') !== (value.failure_code === null))
      context.addIssue({ code: 'custom', message: 'result status/failure mismatch' });
    if (
      value.status !== 'COMPLETED' &&
      (value.assertions.length > 0 ||
        value.hypotheses.length > 0 ||
        value.cross_domain_assertions.length > 0 ||
        value.evidence_gaps.length > 0 ||
        value.assumptions.length > 0 ||
        value.recommended_investigation_actions.length > 0 ||
        (value.response_candidates?.length ?? 0) > 0)
    )
      context.addIssue({
        code: 'custom',
        message: 'refused and failed results cannot promote assertions or actions',
      });
    if (
      value.provenance.fusion_request_id !== value.fusion_request_id ||
      value.provenance.fusion_result_id !== value.fusion_result_id ||
      value.provenance.tenant_id !== value.tenant_id ||
      value.provenance.generated_at !== value.generated_at ||
      value.provenance.input_bindings.some(
        (binding) =>
          binding.resolved_tenant_id !== value.tenant_id ||
          Date.parse(binding.resolved_at) > Date.parse(value.generated_at),
      )
    )
      context.addIssue({ code: 'custom', message: 'result provenance is detached or out of time' });
    if (
      value.status === 'COMPLETED' &&
      value.assertions.length === 0 &&
      value.evidence_gaps.length === 0
    )
      context.addIssue({
        code: 'custom',
        message: 'completed result requires assertion or evidence gap',
      });
    const explanationIds = value.explanation.assertion_explanations.map(
      ({ assertion_id }) => assertion_id,
    );
    const assertionIds = value.assertions.map(({ assertion_id }) => assertion_id);
    if (
      explanationIds.length !== assertionIds.length ||
      assertionIds.some((id) => !explanationIds.includes(id))
    )
      context.addIssue({
        code: 'custom',
        message: 'assertion explanations must bind every assertion',
      });
  });

export const fusionUntrustedContentSchema = z.strictObject({
  content_class: z.enum([
    'UNTRUSTED_TEXT',
    'STRUCTURED_OBSERVATION',
    'EXTERNAL_TELEMETRY',
    'POTENTIAL_PROMPT_INJECTION',
  ]),
  source_reference: fusionEvidenceReferenceSchema,
  content_reference: fusionUuidSchema,
  trust_state: z.enum(['UNTRUSTED', 'VALIDATED', 'TRUSTED']),
  instruction_state: z.literal('DATA_ONLY'),
  redaction_state: z.enum(['NOT_REQUIRED', 'REDACTED', 'REJECTED']),
  classification_state: z.enum(['CLASSIFIED', 'UNKNOWN']),
});
export const fusionContentDecisionSchema = z
  .strictObject({
    classification: fusionClassificationSchema,
    classification_authority: z.enum(['ACS-XCAP-005', 'ACS-EVENT-FOUNDATION']),
    redaction_required: z.boolean(),
    redaction_state: z.enum(['NOT_REQUIRED', 'REDACTED', 'REJECTED']),
    allowed_destination: z
      .array(z.enum(['FUSION_RESULT', 'MODEL', 'EVENT', 'AUDIT', 'OBSERVABILITY']))
      .min(1)
      .max(5),
    model_eligibility: z.literal('PROHIBITED_M0'),
    event_eligibility: z.enum(['METADATA_ONLY', 'REDACTED', 'PROHIBITED']),
    audit_eligibility: z.enum(['METADATA_ONLY', 'REDACTED', 'PROHIBITED']),
    observability_eligibility: z.enum(['METADATA_ONLY', 'REDACTED', 'PROHIBITED']),
    policy_version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/u)
      .max(32),
  })
  .superRefine((value, context) => {
    const exactDestinations = ['FUSION_RESULT', 'EVENT', 'AUDIT', 'OBSERVABILITY'];
    if (
      value.allowed_destination.length !== exactDestinations.length ||
      value.allowed_destination.some((entry, index) => entry !== exactDestinations[index])
    )
      context.addIssue({
        code: 'custom',
        message: 'M0 destinations must match the closed content-decision row',
        path: ['allowed_destination'],
      });
    const sensitive = !['PUBLIC', 'INTERNAL'].includes(value.classification);
    const validRedaction = sensitive
      ? value.redaction_required && value.redaction_state === 'REDACTED'
      : !value.redaction_required && value.redaction_state === 'NOT_REQUIRED';
    if (!validRedaction)
      context.addIssue({
        code: 'custom',
        message: 'redaction state is inconsistent with classification',
        path: ['redaction_state'],
      });
    const eligibility = [
      value.event_eligibility,
      value.audit_eligibility,
      value.observability_eligibility,
    ];
    const expectedEligibility = sensitive ? 'REDACTED' : 'METADATA_ONLY';
    if (eligibility.some((entry) => entry !== expectedEligibility))
      context.addIssue({
        code: 'custom',
        message: 'destination eligibility is inconsistent with classification',
      });
  });

export const fusionDependencyClassSchema = z.enum([
  'NONE',
  'XCAP005_EVIDENCE',
  'PLATFORM_CONTEXT',
  'AUTHORIZATION',
  'EVENT_FOUNDATION',
  'AUDIT',
  'IDEMPOTENCY_RECEIPT',
  'AI_GATEWAY_CONTRACT',
]);
export const fusionEventTypeSchema = z.enum([
  'cyberdefense.fusion.requested',
  'cyberdefense.fusion.completed',
  'cyberdefense.fusion.failed',
  'cyberdefense.fusion.hypothesis_generated',
  'cyberdefense.fusion.hypothesis_superseded',
]);
const eventVersions = {
  request_schema_version: fusionVersionSchema,
  result_schema_version: fusionVersionSchema,
  reference_schema_version: fusionVersionSchema,
  provenance_schema_version: fusionVersionSchema,
  confidence_schema_version: fusionVersionSchema,
  reasoning_policy_version: fusionVersionSchema,
  confidence_policy_version: fusionVersionSchema,
  content_policy_version: fusionVersionSchema,
};
export const fusionRequestedPayloadSchema = z.strictObject({
  fusion_request_id: fusionUuidSchema,
  reasoning_mode: z.enum(['REFERENCE_VALIDATION', 'DETERMINISTIC_SYNTHESIS']),
  reasoning_purpose: z.enum(['EVIDENCE_REFERENCE_VALIDATION', 'EVIDENCE_METADATA_SYNTHESIS']),
  evidence_reference_count: z.number().int().min(1).max(128),
  observable_reference_count: z.literal(0),
  entity_reference_count: z.literal(0),
  correlation_reference_count: z.literal(0),
  graph_reference_count: z.literal(0),
  context_snapshot_present: z.boolean(),
  ...eventVersions,
});
export const fusionCompletedPayloadSchema = z.strictObject({
  fusion_request_id: fusionUuidSchema,
  fusion_result_id: fusionUuidSchema,
  status: z.literal('COMPLETED'),
  assertion_count: z.number().int().min(1).max(128),
  hypothesis_count: z.number().int().min(0).max(64),
  cross_domain_assertion_count: z.number().int().min(0).max(64),
  evidence_gap_count: z.number().int().min(0).max(64),
  investigation_action_count: z.number().int().min(0).max(32),
  response_candidate_count: z.number().int().min(0).max(16),
  ...eventVersions,
});
export const fusionFailedPayloadSchema = z.strictObject({
  fusion_request_id: fusionUuidSchema,
  fusion_result_id: fusionUuidSchema.optional(),
  failure_code: fusionFailureCodeSchema,
  dependency_class: fusionDependencyClassSchema,
  ...eventVersions,
});
export const fusionHypothesisGeneratedPayloadSchema = z.strictObject({
  fusion_request_id: fusionUuidSchema,
  fusion_result_id: fusionUuidSchema,
  hypothesis_id: fusionUuidSchema,
  hypothesis_class: z.enum(['INFERENCE', 'PREDICTION']),
  confidence_state: z.enum(['KNOWN', 'UNKNOWN']),
  provenance_sha256: fusionSha256Schema,
  ...eventVersions,
});
export const fusionHypothesisSupersededPayloadSchema = z
  .strictObject({
    fusion_request_id: fusionUuidSchema,
    fusion_result_id: fusionUuidSchema,
    prior_hypothesis_id: fusionUuidSchema,
    new_hypothesis_id: fusionUuidSchema.optional(),
    supersession_reason: z.enum([
      'CONTRADICTED_BY_NEW_EVIDENCE',
      'SOURCE_TRUST_REVOKED',
      'PROVENANCE_INVALIDATED',
      'POLICY_VERSION_CHANGED',
      'CONTEXT_SUPERSEDED',
    ]),
    provenance_sha256: fusionSha256Schema,
    ...eventVersions,
  })
  .superRefine((value, context) => {
    const requiresNew =
      value.supersession_reason === 'CONTRADICTED_BY_NEW_EVIDENCE' ||
      value.supersession_reason === 'CONTEXT_SUPERSEDED';
    if (requiresNew !== (value.new_hypothesis_id !== undefined))
      context.addIssue({
        code: 'custom',
        message: 'new hypothesis binding is inconsistent',
        path: ['new_hypothesis_id'],
      });
  });

export type FusionRequest = z.infer<typeof fusionRequestSchema>;
export type FusionRequestCommand = z.infer<typeof fusionRequestCommandSchema>;
export type FusionResult = z.infer<typeof fusionResultSchema>;
export type FusionFailureCode = z.infer<typeof fusionFailureCodeSchema>;
export type FusionClassification = z.infer<typeof fusionClassificationSchema>;
export type FusionResponseCandidate = z.infer<typeof fusionResponseCandidateSchema>;
