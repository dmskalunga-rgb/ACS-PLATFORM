import { z } from 'zod';

const metadataSchema = z.object({
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  idempotent_replay: z.boolean().optional(),
});

export const ratePlanStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'SUPERSEDED',
  'RETIRED',
]);
export const pricingModelSchema = z.enum(['FLAT', 'PER_UNIT', 'TIERED_GRADUATED']);
export const ratingWindowSchema = z.enum(['HOURLY', 'DAILY']);
export const ratedFactStatusSchema = z.enum(['RATED', 'SUPERSEDED']);
const decimalSchema = z.string().regex(/^-?\d{1,16}(\.\d{1,8})?$/, 'Expected decimal string.');
const currencySchema = z.literal('USD');
const measurementTypeSchema = z.string().trim().min(1).max(100);
const unitSchema = z.string().trim().min(1).max(32);

export const rateTierSchema = z.object({
  id: z.uuid(),
  ordinal: z.number().int().positive(),
  lower_bound: decimalSchema,
  upper_bound: decimalSchema.nullable(),
  unit_rate: decimalSchema,
});
export const rateRuleSchema = z.object({
  id: z.uuid(),
  measurement_type: measurementTypeSchema,
  unit: unitSchema,
  pricing_model: pricingModelSchema,
  flat_amount: decimalSchema.nullable(),
  unit_rate: decimalSchema.nullable(),
  tiers: z.array(rateTierSchema),
});
export const ratePlanVersionSchema = z.object({
  id: z.uuid(),
  rate_plan_id: z.uuid(),
  tenant_id: z.uuid(),
  version_number: z.number().int().positive(),
  status: ratePlanStatusSchema,
  currency_code: currencySchema,
  currency_minor_scale: z.literal(2),
  effective_from: z.iso.datetime(),
  effective_to: z.iso.datetime().nullable(),
  created_by_membership_id: z.uuid(),
  approved_by_membership_id: z.uuid().nullable(),
  activated_by_membership_id: z.uuid().nullable(),
  expected_version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const ratePlanSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  owner_membership_id: z.uuid(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  versions: z.array(ratePlanVersionSchema),
});
export const ratingApplicabilitySchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  subscription_id: z.uuid(),
  rate_plan_id: z.uuid(),
  rate_plan_version_id: z.uuid(),
  effective_from: z.iso.datetime(),
  effective_to: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
});
export const ratedFactSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  subscription_id: z.uuid(),
  entitlement_id: z.uuid(),
  usage_aggregate_id: z.uuid(),
  usage_window: ratingWindowSchema,
  measurement_type: measurementTypeSchema,
  quantity: decimalSchema,
  unit: unitSchema,
  rate_plan_id: z.uuid(),
  rate_plan_version_id: z.uuid(),
  pricing_model: pricingModelSchema,
  currency_code: currencySchema,
  rate_evidence: z.record(z.string(), z.unknown()),
  pre_tax_amount: z.string().regex(/^-?\d{1,15}(\.\d{1,4})?$/),
  rounding_mode: z.literal('HALF_UP'),
  calculation_version: z.number().int().positive(),
  status: ratedFactStatusSchema,
  supersedes_rated_fact_id: z.uuid().nullable(),
  rerating_reason: z.string().trim().min(1).max(500).nullable(),
  created_at: z.iso.datetime(),
});

export const ratePlanCreateSchema = z
  .object({ code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(160) })
  .strict();
export const ratePlanDraftUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    expected_version: z.number().int().positive(),
  })
  .strict();
export const ratePlanLifecycleSchema = z
  .object({ expected_version: z.number().int().positive() })
  .strict();
export const ratingApplicabilityCreateSchema = z
  .object({
    subscription_id: z.uuid(),
    rate_plan_version_id: z.uuid(),
    effective_from: z.iso.datetime(),
    effective_to: z.iso.datetime().nullable().optional(),
  })
  .strict();
export const ratingExecuteSchema = z
  .object({ usage_aggregate_id: z.uuid(), idempotency_key: z.uuid() })
  .strict();
export const rerateSchema = z
  .object({
    rated_fact_id: z.uuid(),
    usage_aggregate_id: z.uuid(),
    reason: z.string().trim().min(1).max(500),
    idempotency_key: z.uuid(),
  })
  .strict();
export const ratePlanEnvelopeSchema = z.object({ data: ratePlanSchema, meta: metadataSchema });
export const ratedFactEnvelopeSchema = z.object({ data: ratedFactSchema, meta: metadataSchema });
export const ratePlanListEnvelopeSchema = z.object({ data: z.array(ratePlanSchema) });
export const ratedFactListEnvelopeSchema = z.object({ data: z.array(ratedFactSchema) });

export type RatePlan = z.infer<typeof ratePlanSchema>;
export type RatePlanVersion = z.infer<typeof ratePlanVersionSchema>;
export type RateRule = z.infer<typeof rateRuleSchema>;
export type RateTier = z.infer<typeof rateTierSchema>;
export type RatingApplicability = z.infer<typeof ratingApplicabilitySchema>;
export type RatedFact = z.infer<typeof ratedFactSchema>;
export type RatePlanCreate = z.infer<typeof ratePlanCreateSchema>;
export type RatePlanDraftUpdate = z.infer<typeof ratePlanDraftUpdateSchema>;
export type RatingApplicabilityCreate = z.infer<typeof ratingApplicabilityCreateSchema>;
