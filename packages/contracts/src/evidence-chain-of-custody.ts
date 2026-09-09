import { z } from 'zod';

export const evidenceClassificationSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED_SECURITY',
]);
export const evidenceSourceStateSchema = z.enum([
  'UNREGISTERED',
  'REGISTERED',
  'QUARANTINED',
  'REVOKED',
]);
export const evidenceTrustClassificationSchema = z.enum(['UNTRUSTED', 'VALIDATED', 'TRUSTED']);
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
export const boundedReferenceSchema = z.string().trim().min(1).max(512);
export const evidenceEventTypeSchema = z.enum([
  'cyberdefense.evidence.recorded',
  'cyberdefense.evidence.integrity_verified',
  'cyberdefense.evidence.integrity_failed',
  'cyberdefense.evidence.derived',
  'cyberdefense.evidence.exported',
  'cyberdefense.evidence.quarantined',
  'cyberdefense.evidence.retention_applied',
]);
export const evidenceEventPayloadSchema = z
  .object({
    evidence_id: z.uuid(),
    request_id: z.uuid(),
  })
  .catchall(z.union([z.string().max(512), z.number(), z.boolean(), z.null()]));

export const evidenceSourceCreateSchema = z.object({
  source_type: z.string().trim().min(1).max(64),
  connector_type: z.string().trim().min(1).max(64),
  external_binding: boundedReferenceSchema,
  credential_reference: boundedReferenceSchema,
  trust_classification: evidenceTrustClassificationSchema,
  ingestion_policy_version: z.string().trim().min(1).max(32),
});

export const evidenceSourceTransitionSchema = z.object({
  status: z.enum(['REGISTERED', 'QUARANTINED', 'REVOKED']),
  expected_version: z.number().int().positive(),
  reason_reference: boundedReferenceSchema,
});

export const evidenceCollectSchema = z.object({
  evidence_source_id: z.uuid(),
  source_event_id: z.string().trim().min(1).max(256),
  observed_at: z.iso.datetime({ offset: true }),
  media_type: z.string().trim().min(1).max(128),
  raw_bytes_base64: z.string().min(1),
  declared_sha256: sha256Schema.optional(),
  classification: evidenceClassificationSchema,
  metadata: z.record(z.string(), z.unknown()),
  retention_policy_id: boundedReferenceSchema,
});

export const evidenceDeriveSchema = evidenceCollectSchema
  .omit({
    evidence_source_id: true,
    source_event_id: true,
  })
  .extend({
    transformation_id: boundedReferenceSchema,
    transformation_version: z.string().trim().min(1).max(64),
    expected_version: z.number().int().positive(),
  });

export const evidenceExpectedVersionSchema = z.object({
  expected_version: z.number().int().positive(),
});

export const evidenceReasonedTransitionSchema = evidenceExpectedVersionSchema.extend({
  reason_reference: boundedReferenceSchema,
});

export const evidenceClassificationDecisionSchema = evidenceReasonedTransitionSchema.extend({
  classification: evidenceClassificationSchema,
});

export const evidenceRetentionBindingSchema = evidenceReasonedTransitionSchema.extend({
  retention_policy_id: boundedReferenceSchema,
});

export const evidenceMpaOperationSchema = evidenceReasonedTransitionSchema.extend({
  authorization_id: z.uuid(),
  authorization_expected_version: z.number().int().positive(),
  attestation_reference: boundedReferenceSchema,
});
export const evidenceLegalHoldReleaseSchema = evidenceMpaOperationSchema.extend({
  hold_reference: boundedReferenceSchema,
});

export const evidenceRecordSchema = z.object({
  evidence_id: z.uuid(),
  tenant_id: z.uuid(),
  evidence_source_id: z.uuid(),
  parent_evidence_id: z.uuid().nullable(),
  record_contract_version: z.literal('1.0.0'),
  blob_reference_id: z.uuid(),
  media_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  content_sha256: sha256Schema,
  metadata_sha256: sha256Schema,
  canonicalization_version: z.literal('xcap005-evidence-metadata-v1'),
  classification: evidenceClassificationSchema,
  integrity_status: z.enum(['VERIFIED', 'FAILED', 'UNVERIFIABLE']),
  operational_status: z.enum(['AVAILABLE', 'QUARANTINED', 'DESTRUCTION_AUTHORIZED']),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
});

export const evidenceSourceSchema = z.object({
  source_id: z.uuid(),
  tenant_id: z.uuid(),
  machine_principal_id: z.uuid(),
  source_type: z.string(),
  connector_type: z.string(),
  external_binding: z.string(),
  credential_reference: z.string(),
  trust_classification: evidenceTrustClassificationSchema,
  status: evidenceSourceStateSchema,
  ingestion_policy_version: z.string(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
});

export const evidenceMutationEnvelopeSchema = z.object({
  data: evidenceRecordSchema,
  meta: z.object({ request_id: z.uuid(), correlation_id: z.uuid(), replay: z.boolean() }),
});
export const evidenceReadEnvelopeSchema = z.object({
  data: evidenceRecordSchema,
  meta: z.object({ request_id: z.uuid(), correlation_id: z.uuid() }),
});
export const evidenceSourceEnvelopeSchema = z.object({
  data: evidenceSourceSchema,
  meta: z.object({ request_id: z.uuid(), correlation_id: z.uuid(), replay: z.boolean() }),
});

export type EvidenceClassification = z.infer<typeof evidenceClassificationSchema>;
export type EvidenceSourceCreate = z.infer<typeof evidenceSourceCreateSchema>;
export type EvidenceSourceTransition = z.infer<typeof evidenceSourceTransitionSchema>;
export type EvidenceCollect = z.infer<typeof evidenceCollectSchema>;
export type EvidenceDerive = z.infer<typeof evidenceDeriveSchema>;
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
export type EvidenceMpaOperation = z.infer<typeof evidenceMpaOperationSchema>;
