import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEventEnvelope, eventEnvelopeSchema } from './event-envelope.js';

describe('FOUNDATION event envelope', () => {
  it('creates a versioned, tenant-scoped envelope', () => {
    const envelope = createEventEnvelope({
      event_type: 'foundation.health_observed',
      schema_version: '1.0.0',
      tenant_id: randomUUID(),
      correlation_id: randomUUID(),
      causation_id: null,
      producer: 'platform-api',
      classification: 'INTERNAL',
      payload: { status: 'ok' },
    });

    expect(eventEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('rejects an unversioned event type', () => {
    expect(() =>
      eventEnvelopeSchema.parse({
        event_id: randomUUID(),
        event_type: 'invalid',
        schema_version: '1.0.0',
        tenant_id: randomUUID(),
        timestamp: new Date().toISOString(),
        correlation_id: randomUUID(),
        causation_id: null,
        producer: 'platform-api',
        classification: 'INTERNAL',
        payload: {},
      }),
    ).toThrow();
  });
});
