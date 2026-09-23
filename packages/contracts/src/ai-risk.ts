import { z } from 'zod';

const reference = z.string().trim().min(1).max(256);
const uuid = z.uuid();
const expectedVersion = z.number().int().positive();

export const aiRiskCategorySchema = z.enum([
  'AIR-T01',
  'AIR-T02',
  'AIR-T03',
  'AIR-T04',
  'AIR-T05',
  'AIR-T06',
  'AIR-T07',
  'AIR-T08',
  'AIR-T09',
  'AIR-T10',
  'AIR-T11',
  'AIR-T12',
]);
export const aiRiskStatusSchema = z.enum([
  'IDENTIFIED',
  'ASSESSED',
  'TREATMENT_REQUIRED',
  'RESIDUAL_RISK_REVIEW',
  'REASSESSMENT_REQUIRED',
]);
export const aiRiskInventoryKindSchema = z.enum([
  'AI_SYSTEM',
  'MODEL',
  'MODEL_VERSION',
  'DATASET',
  'DATASET_VERSION',
  'PROMPT',
  'PROMPT_VERSION',
]);

export const aiRiskCreateSchema = z
  .object({
    risk_code: z.string().regex(/^[A-Z][A-Z0-9-]{2,31}$/u),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    primary_category: aiRiskCategorySchema,
    owner_user_id: uuid,
    inventory: z.object({ kind: aiRiskInventoryKindSchema, id: uuid }).strict().nullable(),
    evidence_reference: uuid,
  })
  .strict();

export const aiRiskUpdateSchema = z
  .object({
    expected_version: expectedVersion,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    reason_reference: reference,
    evidence_reference: uuid,
  })
  .strict();

export const aiRiskAssessmentSchema = z
  .object({
    expected_version: expectedVersion,
    likelihood: z.number().int().min(1).max(5),
    impact: z.number().int().min(1).max(5),
    exposure: z.number().int().min(1).max(5),
    detectability: z.number().int().min(1).max(5),
    autonomy: z.number().int().min(1).max(5),
    blast_radius: z.number().int().min(1).max(5),
    control_strength: z
      .number()
      .min(0)
      .max(1)
      .refine(
        (value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-8,
        'Control strength must use no more than four decimal places.',
      ),
    previous_assessment_id: uuid.nullable(),
    reason_reference: reference,
    trigger_reference: reference,
    evidence_reference: uuid,
  })
  .strict();

export const aiRiskTreatmentSchema = z
  .object({
    expected_version: expectedVersion,
    treatment_type: z.enum(['MITIGATE', 'AVOID', 'TRANSFER', 'ACCEPT', 'MONITOR']),
    rationale_reference: reference,
    planned_actions_reference: reference,
    evidence_reference: uuid,
  })
  .strict();

export const aiRiskResidualReviewSchema = z
  .object({
    expected_version: expectedVersion,
    assessment_id: uuid,
    reason_reference: reference,
    evidence_reference: uuid,
  })
  .strict();

export const aiRiskMonitoringSchema = z
  .object({
    expected_version: expectedVersion,
    trigger_kind: z.enum([
      'PERIODIC',
      'NEW_EVIDENCE',
      'CONTROL_CHANGE',
      'INVENTORY_CHANGE',
      'INCIDENT',
      'OTHER',
    ]),
    reassessment_required: z.boolean(),
    reason_reference: reference,
    evidence_reference: uuid,
  })
  .strict();

export const aiRiskProtectedDecisionSchema = z
  .object({
    expected_version: expectedVersion,
    decision: z.enum(['ACCEPT', 'REJECT']),
    review_id: uuid,
    reason_reference: reference,
    evidence_reference: uuid,
  })
  .strict();

export const aiRiskRecordSchema = z.object({
  risk_id: uuid,
  risk_code: z.string(),
  title: z.string(),
  description: z.string(),
  primary_category: aiRiskCategorySchema,
  owner_user_id: uuid,
  status: aiRiskStatusSchema,
  version: expectedVersion,
  inventory: z.object({ kind: aiRiskInventoryKindSchema, id: uuid }).nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export type AiRiskCreate = z.infer<typeof aiRiskCreateSchema>;
export type AiRiskUpdate = z.infer<typeof aiRiskUpdateSchema>;
export type AiRiskAssessment = z.infer<typeof aiRiskAssessmentSchema>;
export type AiRiskTreatment = z.infer<typeof aiRiskTreatmentSchema>;
export type AiRiskResidualReview = z.infer<typeof aiRiskResidualReviewSchema>;
export type AiRiskMonitoring = z.infer<typeof aiRiskMonitoringSchema>;
export type AiRiskRecord = z.infer<typeof aiRiskRecordSchema>;
