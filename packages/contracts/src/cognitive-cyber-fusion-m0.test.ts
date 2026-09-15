import { describe, expect, it } from 'vitest';
import {
  fusionCompletedPayloadSchema,
  fusionContentDecisionSchema,
  fusionEventTypeSchema,
  fusionFailureCodeSchema,
  fusionHypothesisGeneratedPayloadSchema,
  fusionHypothesisSupersededPayloadSchema,
  fusionRequestCommandSchema,
  fusionRequestedPayloadSchema,
  fusionUntrustedContentSchema,
} from './cognitive-cyber-fusion-m0.js';

const uuid = (suffix: number) => `10000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const versions = {
  request_schema_version: '1.0.0',
  result_schema_version: '1.0.0',
  reference_schema_version: '1.0.0',
  provenance_schema_version: '1.0.0',
  confidence_schema_version: '1.0.0',
  reasoning_policy_version: '1.0.0',
  confidence_policy_version: '1.0.0',
  content_policy_version: '1.0.0',
} as const;
const reference = {
  reference_type: 'EVIDENCE',
  canonical_owner: 'ACS-XCAP-005',
  resource_id: uuid(1),
  tenant_id: uuid(2),
  resource_version: '1',
  provenance_reference: uuid(3),
} as const;
const command = {
  schema_version: '1.0.0',
  idempotency_key: uuid(4),
  reasoning_purpose: 'EVIDENCE_REFERENCE_VALIDATION',
  requested_reasoning_mode: 'REFERENCE_VALIDATION',
  policy_version: '1.0.0',
  evidence_references: [reference],
  observable_references: [],
  entity_references: [],
  correlation_references: [],
  graph_references: [],
} as const;

describe('ACS-XCAP-011 M0 contracts', () => {
  it('accepts the closed M0 request and rejects an unsupported owner array', () => {
    expect(fusionRequestCommandSchema.safeParse(command).success).toBe(true);
    expect(
      fusionRequestCommandSchema.safeParse({ ...command, entity_references: [reference] }).success,
    ).toBe(false);
  });
  it('rejects duplicate evidence identities and mismatched purpose/mode', () => {
    expect(
      fusionRequestCommandSchema.safeParse({
        ...command,
        evidence_references: [reference, reference],
      }).success,
    ).toBe(false);
    expect(
      fusionRequestCommandSchema.safeParse({
        ...command,
        requested_reasoning_mode: 'DETERMINISTIC_SYNTHESIS',
      }).success,
    ).toBe(false);
  });
  it('defines the five final Event Foundation event identifiers', () => {
    expect(fusionEventTypeSchema.options).toEqual([
      'cyberdefense.fusion.requested',
      'cyberdefense.fusion.completed',
      'cyberdefense.fusion.failed',
      'cyberdefense.fusion.hypothesis_generated',
      'cyberdefense.fusion.hypothesis_superseded',
    ]);
  });
  it('accepts only bounded metadata event payloads', () => {
    expect(
      fusionRequestedPayloadSchema.safeParse({
        fusion_request_id: uuid(5),
        reasoning_mode: 'REFERENCE_VALIDATION',
        reasoning_purpose: 'EVIDENCE_REFERENCE_VALIDATION',
        evidence_reference_count: 1,
        observable_reference_count: 0,
        entity_reference_count: 0,
        correlation_reference_count: 0,
        graph_reference_count: 0,
        context_snapshot_present: false,
        ...versions,
      }).success,
    ).toBe(true);
    expect(
      fusionCompletedPayloadSchema.safeParse({
        fusion_request_id: uuid(5),
        fusion_result_id: uuid(6),
        status: 'COMPLETED',
        assertion_count: 1,
        hypothesis_count: 0,
        cross_domain_assertion_count: 0,
        evidence_gap_count: 0,
        investigation_action_count: 0,
        response_candidate_count: 0,
        raw_evidence: 'prohibited',
        ...versions,
      }).success,
    ).toBe(false);
  });
  it('validates both hypothesis event shapes without enabling hypothesis execution', () => {
    expect(
      fusionHypothesisGeneratedPayloadSchema.safeParse({
        fusion_request_id: uuid(5),
        fusion_result_id: uuid(6),
        hypothesis_id: uuid(7),
        hypothesis_class: 'INFERENCE',
        confidence_state: 'UNKNOWN',
        provenance_sha256: 'a'.repeat(64),
        ...versions,
      }).success,
    ).toBe(true);
    expect(
      fusionHypothesisSupersededPayloadSchema.safeParse({
        fusion_request_id: uuid(5),
        fusion_result_id: uuid(6),
        prior_hypothesis_id: uuid(7),
        supersession_reason: 'CONTRADICTED_BY_NEW_EVIDENCE',
        provenance_sha256: 'a'.repeat(64),
        ...versions,
      }).success,
    ).toBe(false);
  });
  it('keeps untrusted content data-only and model-ineligible', () => {
    expect(
      fusionUntrustedContentSchema.safeParse({
        content_class: 'POTENTIAL_PROMPT_INJECTION',
        source_reference: reference,
        content_reference: uuid(8),
        trust_state: 'UNTRUSTED',
        instruction_state: 'DATA_ONLY',
        redaction_state: 'REJECTED',
        classification_state: 'CLASSIFIED',
      }).success,
    ).toBe(true);
    expect(
      fusionContentDecisionSchema.safeParse({
        classification: 'INTERNAL',
        classification_authority: 'ACS-XCAP-005',
        redaction_required: false,
        redaction_state: 'NOT_REQUIRED',
        allowed_destination: ['FUSION_RESULT', 'MODEL'],
        model_eligibility: 'ALLOWED',
        event_eligibility: 'METADATA_ONLY',
        audit_eligibility: 'METADATA_ONLY',
        observability_eligibility: 'METADATA_ONLY',
        policy_version: '1.0.0',
      }).success,
    ).toBe(false);
    expect(
      fusionContentDecisionSchema.safeParse({
        classification: 'RESTRICTED',
        classification_authority: 'ACS-XCAP-005',
        redaction_required: true,
        redaction_state: 'REDACTED',
        allowed_destination: ['FUSION_RESULT', 'EVENT', 'AUDIT', 'OBSERVABILITY'],
        model_eligibility: 'PROHIBITED_M0',
        event_eligibility: 'REDACTED',
        audit_eligibility: 'REDACTED',
        observability_eligibility: 'REDACTED',
        policy_version: '1.0.0',
      }).success,
    ).toBe(true);
    expect(
      fusionContentDecisionSchema.safeParse({
        classification: 'CONFIDENTIAL',
        classification_authority: 'ACS-XCAP-005',
        redaction_required: false,
        redaction_state: 'NOT_REQUIRED',
        allowed_destination: ['FUSION_RESULT', 'EVENT'],
        model_eligibility: 'PROHIBITED_M0',
        event_eligibility: 'METADATA_ONLY',
        audit_eligibility: 'METADATA_ONLY',
        observability_eligibility: 'METADATA_ONLY',
        policy_version: '1.0.0',
      }).success,
    ).toBe(false);
  });
  it('keeps the governed failure vocabulary closed', () => {
    expect(fusionFailureCodeSchema.safeParse('AUTHORIZATION_DENIED').success).toBe(true);
    expect(fusionFailureCodeSchema.safeParse('BYPASS').success).toBe(false);
  });
});
