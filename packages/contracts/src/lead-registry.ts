import { z } from 'zod';

export const leadStatusSchema = z.enum(['NEW', 'QUALIFIED', 'DISQUALIFIED']);
export const leadSchema = z.object({
  id: z.uuid(),
  display_name: z.string().min(1).max(160),
  source: z.string().min(1).max(80).nullable(),
  contact_name: z.string().min(1).max(160).nullable(),
  contact_email: z.email().max(254).nullable(),
  status: leadStatusSchema,
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const leadCreateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(160),
    source: z.string().trim().min(1).max(80).nullable().optional(),
    contact_name: z.string().trim().min(1).max(160).nullable().optional(),
    contact_email: z.email().max(254).nullable().optional(),
  })
  .strict();
export const leadUpdateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(160).optional(),
    source: z.string().trim().min(1).max(80).nullable().optional(),
    contact_name: z.string().trim().min(1).max(160).nullable().optional(),
    contact_email: z.email().max(254).nullable().optional(),
    status: leadStatusSchema.optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine(
    ({ display_name, source, contact_name, contact_email, status }) =>
      display_name !== undefined ||
      source !== undefined ||
      contact_name !== undefined ||
      contact_email !== undefined ||
      status !== undefined,
    'At least one lead field must be supplied.',
  );
export const leadEnvelopeSchema = z.object({
  data: leadSchema,
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
    idempotent_replay: z.boolean().optional(),
  }),
});
export const leadListEnvelopeSchema = z.object({
  data: z.array(leadSchema),
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
    next_cursor: z.uuid().nullable(),
  }),
});
export type Lead = z.infer<typeof leadSchema>;
export type LeadCreate = z.infer<typeof leadCreateSchema>;
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;
export type LeadEnvelope = z.infer<typeof leadEnvelopeSchema>;
export type LeadListEnvelope = z.infer<typeof leadListEnvelopeSchema>;
