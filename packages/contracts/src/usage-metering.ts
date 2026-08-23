import { z } from 'zod';

const metadataSchema = z.object({
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  idempotent_replay: z.boolean().optional(),
});

export const measurementSourceStatusSchema = z.enum(['ACTIVE', 'DISABLED', 'REVOKED']);
export const rawMeasurementStatusSchema = z.enum(['ACCEPTED', 'REJECTED']);
export const measurementCorrectionStatusSchema = z.literal('APPLIED');
export const usageTimeBucketSchema = z.enum(['HOURLY', 'DAILY']);

const boundedDescriptorSchema = z.string().trim().min(1).max(500);
const measurementTypeSchema = z.string().trim().min(1).max(100);
const measurementUnitSchema = z.string().trim().min(1).max(32);
const sourceEventIdSchema = z.string().trim().min(1).max(256);

export const measurementSourceSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  name: z.string().trim().min(1).max(160),
  descriptor: boundedDescriptorSchema.nullable(),
  status: measurementSourceStatusSchema,
  credential_id: z.uuid(),
  credential_created_at: z.iso.datetime(),
  credential_rotated_at: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const rawMeasurementSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  source_id: z.uuid(),
  source_event_id: sourceEventIdSchema,
  subscription_id: z.uuid(),
  entitlement_id: z.uuid(),
  plan_feature_id: z.uuid().nullable(),
  measurement_type: measurementTypeSchema,
  value: z.number().finite(),
  unit: measurementUnitSchema,
  event_time: z.iso.datetime(),
  received_at: z.iso.datetime(),
  processed_at: z.iso.datetime(),
  status: rawMeasurementStatusSchema,
  schema_version: z.number().int().positive(),
  created_at: z.iso.datetime(),
});

export const measurementCorrectionSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  measurement_id: z.uuid(),
  reason: boundedDescriptorSchema,
  compensating_value: z.number().finite(),
  unit: measurementUnitSchema,
  status: measurementCorrectionStatusSchema,
  created_by_membership_id: z.uuid(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
});

export const usageAggregateSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  subscription_id: z.uuid(),
  entitlement_id: z.uuid(),
  plan_feature_id: z.uuid().nullable(),
  measurement_type: measurementTypeSchema,
  unit: measurementUnitSchema,
  time_bucket: usageTimeBucketSchema,
  bucket_start: z.iso.datetime(),
  aggregate_value: z.number().finite(),
  computed_at: z.iso.datetime(),
  version: z.number().int().positive(),
});

export const measurementSourceCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    descriptor: boundedDescriptorSchema.optional(),
  })
  .strict();
export const measurementSourceCredentialSchema = z.object({
  credential_id: z.uuid(),
  credential: z.string().min(32).max(512),
});
export const measurementSourceRegistrationEnvelopeSchema = z.object({
  data: measurementSourceSchema,
  credential: measurementSourceCredentialSchema,
  meta: metadataSchema,
});
export const measurementSourceUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    descriptor: boundedDescriptorSchema.nullable().optional(),
    expected_version: z.number().int().positive(),
  })
  .strict();
export const measurementSourceTransitionSchema = z
  .object({ status: measurementSourceStatusSchema, expected_version: z.number().int().positive() })
  .strict();
export const machineMeasurementIngestSchema = z
  .object({
    source_event_id: sourceEventIdSchema,
    entitlement_id: z.uuid(),
    plan_feature_id: z.uuid().optional(),
    measurement_type: measurementTypeSchema,
    value: z.number().finite(),
    unit: measurementUnitSchema,
    event_time: z.iso.datetime(),
    schema_version: z.number().int().positive(),
  })
  .strict();
export const measurementCorrectionCreateSchema = z
  .object({
    measurement_id: z.uuid(),
    reason: boundedDescriptorSchema,
    compensating_value: z.number().finite(),
    unit: measurementUnitSchema,
    expected_version: z.number().int().positive(),
  })
  .strict();
export const usageAggregateQuerySchema = z
  .object({
    subscription_id: z.uuid().optional(),
    entitlement_id: z.uuid().optional(),
    plan_feature_id: z.uuid().optional(),
    measurement_type: measurementTypeSchema.optional(),
    unit: measurementUnitSchema.optional(),
    time_bucket: usageTimeBucketSchema,
    from: z.iso.datetime(),
    until: z.iso.datetime(),
  })
  .strict();

export const measurementSourceEnvelopeSchema = z.object({
  data: measurementSourceSchema,
  meta: metadataSchema,
});
export const rawMeasurementEnvelopeSchema = z.object({
  data: rawMeasurementSchema,
  meta: metadataSchema,
});
export const measurementCorrectionEnvelopeSchema = z.object({
  data: measurementCorrectionSchema,
  meta: metadataSchema,
});
export const usageAggregateListEnvelopeSchema = z.object({
  data: z.array(usageAggregateSchema),
  meta: metadataSchema
    .omit({ idempotent_replay: true })
    .extend({ next_cursor: z.uuid().nullable() }),
});

export type MeasurementSource = z.infer<typeof measurementSourceSchema>;
export type RawMeasurement = z.infer<typeof rawMeasurementSchema>;
export type MeasurementCorrection = z.infer<typeof measurementCorrectionSchema>;
export type UsageAggregate = z.infer<typeof usageAggregateSchema>;
export type MachineMeasurementIngest = z.infer<typeof machineMeasurementIngestSchema>;
export type MeasurementSourceCreate = z.infer<typeof measurementSourceCreateSchema>;
export type MeasurementSourceUpdate = z.infer<typeof measurementSourceUpdateSchema>;
export type MeasurementSourceTransition = z.infer<typeof measurementSourceTransitionSchema>;
export type MeasurementCorrectionCreate = z.infer<typeof measurementCorrectionCreateSchema>;
