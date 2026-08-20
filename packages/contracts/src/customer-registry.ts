import { z } from 'zod';

export const customerStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const customerSchema = z.object({
  id: z.uuid(),
  display_name: z.string().min(1).max(160),
  reference_code: z.string().min(1).max(80).nullable(),
  contact_email: z.email().max(254).nullable(),
  status: customerStatusSchema,
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const customerCreateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(160),
    reference_code: z.string().trim().min(1).max(80).nullable().optional(),
    contact_email: z.email().max(254).nullable().optional(),
  })
  .strict();
export const customerUpdateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(160).optional(),
    reference_code: z.string().trim().min(1).max(80).nullable().optional(),
    contact_email: z.email().max(254).nullable().optional(),
    status: customerStatusSchema.optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine(
    ({ display_name, reference_code, contact_email, status }) =>
      display_name !== undefined ||
      reference_code !== undefined ||
      contact_email !== undefined ||
      status !== undefined,
    'At least one customer field must be supplied.',
  );
export const customerEnvelopeSchema = z.object({
  data: customerSchema,
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
    idempotent_replay: z.boolean().optional(),
  }),
});
export const customerListEnvelopeSchema = z.object({
  data: z.array(customerSchema),
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
    next_cursor: z.uuid().nullable(),
  }),
});

export type Customer = z.infer<typeof customerSchema>;
export type CustomerCreate = z.infer<typeof customerCreateSchema>;
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;
export type CustomerEnvelope = z.infer<typeof customerEnvelopeSchema>;
export type CustomerListEnvelope = z.infer<typeof customerListEnvelopeSchema>;
