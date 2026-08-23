import { z } from 'zod';

export const contractStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'CANCELLED',
  'TERMINATED',
]);
const money = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/);
const supportedCurrencies = new Set(Intl.supportedValuesOf('currency'));
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((value) => supportedCurrencies.has(value), 'Unsupported ISO 4217 currency.');
const metadata = z.object({
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  idempotent_replay: z.boolean().optional(),
});

export const contractLineSchema = z.object({
  id: z.uuid(),
  line_number: z.number().int().positive(),
  source_proposal_line_item_id: z.uuid(),
  plan_id: z.uuid(),
  plan_name_snapshot: z.string(),
  description_snapshot: z.string(),
  quantity: money,
  unit_price: money,
  line_subtotal: money,
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const contractSchema = z.object({
  id: z.uuid(),
  source_proposal_id: z.uuid(),
  source_proposal_revision_number: z.number().int().positive(),
  source_proposal_code: z.string(),
  title: z.string(),
  opportunity_id: z.uuid(),
  customer_id: z.uuid().nullable(),
  partner_id: z.uuid().nullable(),
  owner_membership_id: z.uuid(),
  created_by_membership_id: z.uuid(),
  currency_code: currency,
  status: contractStatusSchema,
  effective_from: z.iso.datetime().nullable(),
  effective_until: z.iso.datetime().nullable(),
  revision_number: z.number().int().positive(),
  version: z.number().int().positive(),
  contract_subtotal: money,
  grand_total: money,
  approved_by_membership_id: z.uuid().nullable(),
  approved_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  lines: z.array(contractLineSchema),
});
export const contractCreateSchema = z
  .object({
    source_proposal_id: z.uuid(),
    title: z.string().trim().min(1).max(160).optional(),
    owner_membership_id: z.uuid().optional(),
  })
  .strict();
export const contractUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    effective_from: z.iso.datetime().nullable().optional(),
    effective_until: z.iso.datetime().nullable().optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_version'));
export const contractLineCreateSchema = z
  .object({
    plan_id: z.uuid(),
    quantity: money.refine((value) => !/^0+(\.0+)?$/.test(value)),
    unit_price: money,
    expected_version: z.number().int().positive(),
  })
  .strict();
export const contractLineUpdateSchema = z
  .object({
    quantity: money.optional(),
    unit_price: money.optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_version'));
export const contractAssignSchema = z
  .object({ owner_membership_id: z.uuid(), expected_version: z.number().int().positive() })
  .strict();
export const contractTransitionSchema = z
  .object({ expected_version: z.number().int().positive() })
  .strict();
export const contractEnvelopeSchema = z.object({ data: contractSchema, meta: metadata });
export const contractListEnvelopeSchema = z.object({
  data: z.array(contractSchema),
  meta: metadata.omit({ idempotent_replay: true }).extend({ next_cursor: z.uuid().nullable() }),
});
export type Contract = z.infer<typeof contractSchema>;
export type ContractCreate = z.infer<typeof contractCreateSchema>;
export type ContractUpdate = z.infer<typeof contractUpdateSchema>;
export type ContractLineCreate = z.infer<typeof contractLineCreateSchema>;
export type ContractLineUpdate = z.infer<typeof contractLineUpdateSchema>;
export type ContractAssign = z.infer<typeof contractAssignSchema>;
export type ContractTransition = z.infer<typeof contractTransitionSchema>;
