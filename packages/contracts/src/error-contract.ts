import { z } from 'zod';

export const errorDetailSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  request_id: z.uuid(),
  correlation_id: z.uuid(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const errorEnvelopeSchema = z.object({
  error: errorDetailSchema,
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
