import { z } from 'zod';

const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);
const key = bounded(100).regex(/^[a-z][a-z0-9_.-]+$/u);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
const reference = bounded(256);
const evidenceReference = z.uuid();
const classification = z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED_SECURITY']);

export const aiInventoryKindSchema = z.enum(['AI_SYSTEM', 'MODEL', 'DATASET', 'PROMPT']);
export const aiInventoryVersionKindSchema = z.enum([
  'MODEL_VERSION',
  'DATASET_VERSION',
  'PROMPT_VERSION',
]);

export const aiSystemCreateSchema = z
  .object({
    system_key: key,
    name: bounded(200),
    purpose: bounded(1000),
    owner_reference: reference,
    classification,
    evidence_reference: evidenceReference,
  })
  .strict();

export const aiModelCreateSchema = z
  .object({
    system_id: z.uuid(),
    model_key: key,
    name: bounded(200),
    provider_reference: reference,
    classification,
    evidence_reference: evidenceReference,
  })
  .strict();

export const aiDatasetCreateSchema = z
  .object({
    system_id: z.uuid(),
    dataset_key: key,
    name: bounded(200),
    classification,
    evidence_reference: evidenceReference,
  })
  .strict();

export const aiPromptCreateSchema = z
  .object({
    system_id: z.uuid(),
    prompt_key: key,
    name: bounded(200),
    classification,
    evidence_reference: evidenceReference,
  })
  .strict();

export const aiInventoryUpdateSchema = z
  .object({
    expected_version: z.number().int().positive(),
    name: bounded(200),
    reason_reference: reference,
    evidence_reference: evidenceReference,
  })
  .strict();

export const aiModelVersionCreateSchema = z
  .object({
    model_id: z.uuid(),
    version_label: bounded(128),
    artifact_sha256: sha256,
    artifact_reference: reference,
    source_reference: reference,
    provider_reference: reference,
    provenance_reference: evidenceReference,
    evidence_reference: evidenceReference,
  })
  .strict();

export const aiDatasetVersionCreateSchema = z
  .object({
    dataset_id: z.uuid(),
    version_label: bounded(128),
    content_sha256: sha256,
    content_reference: reference,
    provenance_reference: evidenceReference,
    permitted_uses: z.array(bounded(100)).min(1).max(32),
    residency_policy_reference: reference,
    retention_policy_reference: reference,
    evidence_reference: evidenceReference,
  })
  .strict();

export const aiPromptVersionCreateSchema = z
  .object({
    prompt_id: z.uuid(),
    version_label: bounded(128),
    content_sha256: sha256,
    content_reference: reference,
    change_reason: bounded(512),
    evidence_reference: evidenceReference,
  })
  .strict();

export const aiInventoryAssetSchema = z.object({
  asset_id: z.uuid(),
  kind: aiInventoryKindSchema,
  system_id: z.uuid().nullable(),
  asset_key: z.string(),
  name: z.string(),
  classification,
  status: z.literal('REGISTERED'),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const aiInventoryVersionSchema = z.object({
  version_id: z.uuid(),
  asset_id: z.uuid(),
  kind: aiInventoryVersionKindSchema,
  version_label: z.string(),
  content_sha256: sha256,
  status: z.literal('REGISTERED'),
  created_at: z.iso.datetime(),
});

export const aiInventoryMutationEnvelopeSchema = z.object({
  data: z.union([aiInventoryAssetSchema, aiInventoryVersionSchema]),
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
    idempotent_replay: z.boolean(),
  }),
});

export type AiSystemCreate = z.infer<typeof aiSystemCreateSchema>;
export type AiModelCreate = z.infer<typeof aiModelCreateSchema>;
export type AiDatasetCreate = z.infer<typeof aiDatasetCreateSchema>;
export type AiPromptCreate = z.infer<typeof aiPromptCreateSchema>;
export type AiInventoryUpdate = z.infer<typeof aiInventoryUpdateSchema>;
export type AiModelVersionCreate = z.infer<typeof aiModelVersionCreateSchema>;
export type AiDatasetVersionCreate = z.infer<typeof aiDatasetVersionCreateSchema>;
export type AiPromptVersionCreate = z.infer<typeof aiPromptVersionCreateSchema>;
export type AiInventoryAsset = z.infer<typeof aiInventoryAssetSchema>;
export type AiInventoryVersion = z.infer<typeof aiInventoryVersionSchema>;
