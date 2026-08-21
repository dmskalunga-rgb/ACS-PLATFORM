import { z } from 'zod';

export const partnerStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
const partnerFields = {
  partner_code: z.string().trim().min(1).max(80),
  display_name: z.string().trim().min(1).max(160),
};
export const partnerSchema = z.object({
  id: z.uuid(),
  ...partnerFields,
  status: partnerStatusSchema,
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const partnerCreateSchema = z.object(partnerFields).strict();
export const partnerUpdateSchema = z
  .object({
    partner_code: partnerFields.partner_code.optional(),
    display_name: partnerFields.display_name.optional(),
    status: partnerStatusSchema.optional(),
    expected_version: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expected_version'),
    'At least one partner field must be supplied.',
  );
const meta = z.object({
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  idempotent_replay: z.boolean().optional(),
});
export const partnerEnvelopeSchema = z.object({ data: partnerSchema, meta });
export const partnerListEnvelopeSchema = z.object({
  data: z.array(partnerSchema),
  meta: meta.omit({ idempotent_replay: true }).extend({ next_cursor: z.uuid().nullable() }),
});
export type Partner = z.infer<typeof partnerSchema>;
export type PartnerCreate = z.infer<typeof partnerCreateSchema>;
export type PartnerUpdate = z.infer<typeof partnerUpdateSchema>;
export type PartnerEnvelope = z.infer<typeof partnerEnvelopeSchema>;
export type PartnerListEnvelope = z.infer<typeof partnerListEnvelopeSchema>;
