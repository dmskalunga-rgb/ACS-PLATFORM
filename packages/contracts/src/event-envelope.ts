import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const dataClassificationSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'BOARD_CONFIDENTIAL',
]);

export const eventEnvelopeSchema = z.object({
  event_id: z.uuid(),
  event_type: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(?:-[a-z0-9_]+)*(?:\.[a-z][a-z0-9_]*(?:-[a-z0-9_]+)*)+$/),
  schema_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  tenant_id: z.uuid(),
  timestamp: z.iso.datetime({ offset: true }),
  correlation_id: z.uuid(),
  causation_id: z.uuid().nullable(),
  producer: z.string().min(1),
  classification: dataClassificationSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
export type NewEventEnvelope = Omit<EventEnvelope, 'event_id' | 'timestamp'>;

export function createEventEnvelope(input: NewEventEnvelope): EventEnvelope {
  return eventEnvelopeSchema.parse({
    ...input,
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
  });
}
