import { z } from 'zod';

export const opportunityStageSchema = z.enum([
  'QUALIFICATION',
  'DISCOVERY',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
]);

const optionalUuid = z.uuid().nullable().optional();
const opportunityFields = {
  opportunity_code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  owner_membership_id: z.uuid(),
  customer_id: z.uuid().nullable(),
  lead_id: z.uuid().nullable(),
  partner_id: z.uuid().nullable(),
  plan_id: z.uuid().nullable(),
  probability_percent: z.number().int().min(0).max(100).nullable(),
  expected_close_date: z.iso.date().nullable(),
};

export const opportunitySchema = z.object({
  id: z.uuid(),
  ...opportunityFields,
  stage: opportunityStageSchema,
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const opportunityCreateSchema = z
  .object({
    opportunity_code: opportunityFields.opportunity_code,
    title: opportunityFields.title,
    owner_membership_id: opportunityFields.owner_membership_id,
    customer_id: optionalUuid,
    lead_id: optionalUuid,
    partner_id: optionalUuid,
    plan_id: optionalUuid,
    probability_percent: opportunityFields.probability_percent.optional(),
    expected_close_date: opportunityFields.expected_close_date.optional(),
  })
  .strict();

export const opportunityUpdateSchema = z
  .object({
    opportunity_code: opportunityFields.opportunity_code.optional(),
    title: opportunityFields.title.optional(),
    owner_membership_id: opportunityFields.owner_membership_id.optional(),
    customer_id: optionalUuid,
    lead_id: optionalUuid,
    partner_id: optionalUuid,
    plan_id: optionalUuid,
    probability_percent: opportunityFields.probability_percent.optional(),
    expected_close_date: opportunityFields.expected_close_date.optional(),
    stage: opportunityStageSchema.optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expected_version'),
    'At least one opportunity field must be supplied.',
  );

const meta = z.object({
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  idempotent_replay: z.boolean().optional(),
});
export const opportunityEnvelopeSchema = z.object({ data: opportunitySchema, meta });
export const opportunityListEnvelopeSchema = z.object({
  data: z.array(opportunitySchema),
  meta: meta.omit({ idempotent_replay: true }).extend({ next_cursor: z.uuid().nullable() }),
});
export type Opportunity = z.infer<typeof opportunitySchema>;
export type OpportunityCreate = z.infer<typeof opportunityCreateSchema>;
export type OpportunityUpdate = z.infer<typeof opportunityUpdateSchema>;
export type OpportunityEnvelope = z.infer<typeof opportunityEnvelopeSchema>;
export type OpportunityListEnvelope = z.infer<typeof opportunityListEnvelopeSchema>;
