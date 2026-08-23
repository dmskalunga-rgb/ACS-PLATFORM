import { z } from 'zod';

export const subscriptionStatusSchema = z.enum([
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

export const subscriptionSchema = z.object({
  id: z.uuid(),
  source_contract_id: z.uuid(),
  source_contract_revision_number: z.number().int().positive(),
  customer_id: z.uuid(),
  owner_membership_id: z.uuid(),
  created_by_membership_id: z.uuid(),
  status: subscriptionStatusSchema,
  effective_from: z.iso.datetime(),
  effective_until: z.iso.datetime().nullable(),
  revision_number: z.number().int().positive(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const subscriptionCreateSchema = z
  .object({
    contract_id: z.uuid(),
    owner_membership_id: z.uuid().optional(),
    effective_from: z.iso.datetime(),
    effective_until: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.effective_until || new Date(value.effective_until) > new Date(value.effective_from),
    'Effective end must be later than start.',
  );

export const subscriptionUpdateSchema = z
  .object({
    effective_from: z.iso.datetime().optional(),
    effective_until: z.iso.datetime().nullable().optional(),
    expected_version: z.number().int().positive(),
  })
  .strict();
export const subscriptionAssignSchema = z
  .object({ owner_membership_id: z.uuid(), expected_version: z.number().int().positive() })
  .strict();
export const subscriptionTransitionSchema = z
  .object({ expected_version: z.number().int().positive() })
  .strict();
export const subscriptionRenewSchema = z
  .object({ effective_until: z.iso.datetime(), expected_version: z.number().int().positive() })
  .strict();
export const subscriptionEnvelopeSchema = z.object({
  data: subscriptionSchema,
  meta: metadataSchema,
});
export const subscriptionListEnvelopeSchema = z.object({
  data: z.array(subscriptionSchema),
  meta: metadataSchema
    .omit({ idempotent_replay: true })
    .extend({ next_cursor: z.uuid().nullable() }),
});

export type Subscription = z.infer<typeof subscriptionSchema>;
export type SubscriptionCreate = z.infer<typeof subscriptionCreateSchema>;
export type SubscriptionUpdate = z.infer<typeof subscriptionUpdateSchema>;
export type SubscriptionAssign = z.infer<typeof subscriptionAssignSchema>;
export type SubscriptionTransition = z.infer<typeof subscriptionTransitionSchema>;
export type SubscriptionRenew = z.infer<typeof subscriptionRenewSchema>;
