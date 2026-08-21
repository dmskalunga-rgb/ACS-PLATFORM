import { z } from 'zod';

export const planStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
const planFields = {
  plan_code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000).nullable(),
};
export const planSchema = z.object({
  id: z.uuid(),
  ...planFields,
  status: planStatusSchema,
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const planFeatureSchema = z.object({
  id: z.uuid(),
  plan_id: z.uuid(),
  feature_code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000).nullable(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const planCreateSchema = z
  .object({ ...planFields, description: planFields.description.optional() })
  .strict();
export const planUpdateSchema = z
  .object({
    plan_code: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(2000).nullable().optional(),
    status: planStatusSchema.optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expected_version'),
    'At least one plan field must be supplied.',
  );
export const planFeatureCreateSchema = z
  .object({
    feature_code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();
export const planFeatureUpdateSchema = z
  .object({
    feature_code: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(2000).nullable().optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expected_version'),
    'At least one feature field must be supplied.',
  );
const meta = z.object({
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  idempotent_replay: z.boolean().optional(),
});
export const planEnvelopeSchema = z.object({ data: planSchema, meta });
export const planFeatureEnvelopeSchema = z.object({ data: planFeatureSchema, meta });
export const planListEnvelopeSchema = z.object({
  data: z.array(planSchema),
  meta: meta.omit({ idempotent_replay: true }).extend({ next_cursor: z.uuid().nullable() }),
});
export const planFeatureListEnvelopeSchema = z.object({
  data: z.array(planFeatureSchema),
  meta: meta.omit({ idempotent_replay: true }).extend({ next_cursor: z.uuid().nullable() }),
});
export type Plan = z.infer<typeof planSchema>;
export type PlanFeature = z.infer<typeof planFeatureSchema>;
export type PlanCreate = z.infer<typeof planCreateSchema>;
export type PlanUpdate = z.infer<typeof planUpdateSchema>;
export type PlanFeatureCreate = z.infer<typeof planFeatureCreateSchema>;
export type PlanFeatureUpdate = z.infer<typeof planFeatureUpdateSchema>;
export type PlanEnvelope = z.infer<typeof planEnvelopeSchema>;
export type PlanFeatureEnvelope = z.infer<typeof planFeatureEnvelopeSchema>;
export type PlanListEnvelope = z.infer<typeof planListEnvelopeSchema>;
export type PlanFeatureListEnvelope = z.infer<typeof planFeatureListEnvelopeSchema>;
