import { z } from 'zod';

export const entitlementStatusSchema = z.enum([
  'DRAFT',
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'TERMINATED',
]);

const metadataSchema = z.object({
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  idempotent_replay: z.boolean().optional(),
});

export const entitlementSchema = z.object({
  id: z.uuid(),
  subscription_id: z.uuid(),
  customer_id: z.uuid(),
  contract_id: z.uuid(),
  source_contract_line_item_id: z.uuid(),
  plan_id: z.uuid(),
  plan_feature_id: z.uuid().nullable(),
  content_model: z.literal('PLAN_LINE_ACCESS'),
  owner_membership_id: z.uuid(),
  created_by_membership_id: z.uuid(),
  status: entitlementStatusSchema,
  effective_from: z.iso.datetime(),
  effective_until: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const entitlementCreateSchema = z
  .object({
    subscription_id: z.uuid(),
    effective_from: z.iso.datetime(),
    effective_until: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.effective_until || new Date(value.effective_until) > new Date(value.effective_from),
    'Effective end must be later than start.',
  );
export const entitlementUpdateSchema = z
  .object({
    effective_from: z.iso.datetime().optional(),
    effective_until: z.iso.datetime().nullable().optional(),
    expected_version: z.number().int().positive(),
  })
  .strict();
export const entitlementAssignSchema = z
  .object({ owner_membership_id: z.uuid(), expected_version: z.number().int().positive() })
  .strict();
export const entitlementTransitionSchema = z
  .object({ expected_version: z.number().int().positive() })
  .strict();
export const entitlementEnvelopeSchema = z.object({
  data: entitlementSchema,
  meta: metadataSchema,
});
export const entitlementListEnvelopeSchema = z.object({
  data: z.array(entitlementSchema),
  meta: metadataSchema
    .omit({ idempotent_replay: true })
    .extend({ next_cursor: z.uuid().nullable() }),
});

export type Entitlement = z.infer<typeof entitlementSchema>;
export type EntitlementCreate = z.infer<typeof entitlementCreateSchema>;
export type EntitlementUpdate = z.infer<typeof entitlementUpdateSchema>;
export type EntitlementAssign = z.infer<typeof entitlementAssignSchema>;
export type EntitlementTransition = z.infer<typeof entitlementTransitionSchema>;
