import { z } from 'zod';

export const proposalStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);
const money = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/);
const positiveMoney = money.refine((value) => !/^0+(\.0+)?$/.test(value));
const supportedCurrencyCodes = new Set(Intl.supportedValuesOf('currency'));
const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((value) => supportedCurrencyCodes.has(value), 'Unsupported ISO 4217 currency.');
const nullableUuid = z.uuid().nullable().optional();
const lineSchema = z.object({
  id: z.uuid(),
  line_number: z.number().int().positive(),
  plan_id: z.uuid(),
  plan_name_snapshot: z.string(),
  description_snapshot: z.string(),
  quantity: money,
  unit_price: money,
  line_subtotal: money,
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const proposalSchema = z.object({
  id: z.uuid(),
  proposal_code: z.string(),
  title: z.string(),
  opportunity_id: z.uuid(),
  customer_id: z.uuid().nullable(),
  partner_id: z.uuid().nullable(),
  owner_membership_id: z.uuid(),
  created_by_membership_id: z.uuid(),
  currency_code: currencyCode,
  status: proposalStatusSchema,
  issued_at: z.iso.datetime().nullable(),
  valid_until: z.iso.datetime(),
  revision_number: z.number().int().positive(),
  version: z.number().int().positive(),
  proposal_subtotal: money,
  grand_total: money,
  approved_by_membership_id: z.uuid().nullable(),
  approved_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  lines: z.array(lineSchema),
});
const createFields = {
  proposal_code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  opportunity_id: z.uuid(),
  customer_id: nullableUuid,
  partner_id: nullableUuid,
  owner_membership_id: z.uuid().optional(),
  currency_code: currencyCode,
  valid_until: z.iso.datetime(),
};
export const proposalCreateSchema = z.object(createFields).strict();
export const proposalUpdateSchema = z
  .object({
    title: createFields.title.optional(),
    customer_id: nullableUuid,
    partner_id: nullableUuid,
    valid_until: z.iso.datetime().optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'expected_version'));
export const proposalLineCreateSchema = z
  .object({
    plan_id: z.uuid(),
    quantity: positiveMoney,
    unit_price: money,
    expected_version: z.number().int().positive(),
  })
  .strict();
export const proposalLineUpdateSchema = z
  .object({
    quantity: positiveMoney.optional(),
    unit_price: money.optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'expected_version'));
export const proposalTransitionSchema = z
  .object({ expected_version: z.number().int().positive() })
  .strict();
export const proposalAssignSchema = z
  .object({ owner_membership_id: z.uuid(), expected_version: z.number().int().positive() })
  .strict();
const meta = z.object({
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  idempotent_replay: z.boolean().optional(),
});
export const proposalEnvelopeSchema = z.object({ data: proposalSchema, meta });
export const proposalListEnvelopeSchema = z.object({
  data: z.array(proposalSchema),
  meta: meta.omit({ idempotent_replay: true }).extend({ next_cursor: z.uuid().nullable() }),
});
export type Proposal = z.infer<typeof proposalSchema>;
export type ProposalCreate = z.infer<typeof proposalCreateSchema>;
export type ProposalUpdate = z.infer<typeof proposalUpdateSchema>;
export type ProposalLineCreate = z.infer<typeof proposalLineCreateSchema>;
export type ProposalLineUpdate = z.infer<typeof proposalLineUpdateSchema>;
export type ProposalTransition = z.infer<typeof proposalTransitionSchema>;
export type ProposalAssign = z.infer<typeof proposalAssignSchema>;
export type ProposalEnvelope = z.infer<typeof proposalEnvelopeSchema>;
export type ProposalListEnvelope = z.infer<typeof proposalListEnvelopeSchema>;
