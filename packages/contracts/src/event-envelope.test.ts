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

  it('accepts a canonical hyphenated segment without relaxing segment boundaries', () => {
    const base = {
      event_id: randomUUID(),
      schema_version: '1.0.0',
      tenant_id: randomUUID(),
      timestamp: new Date().toISOString(),
      correlation_id: randomUUID(),
      causation_id: null,
      producer: 'platform-api',
      classification: 'INTERNAL' as const,
      payload: {},
    };

    expect(
      eventEnvelopeSchema.parse({
        ...base,
        event_type: 'commercial.rating.rate-plan.activated',
      }).event_type,
    ).toBe('commercial.rating.rate-plan.activated');
    for (const event_type of [
      'commercial.rating.-rate-plan.activated',
      'commercial.rating.rate--plan.activated',
      'commercial.rating.rate-plan-.activated',
    ])
      expect(() => eventEnvelopeSchema.parse({ ...base, event_type })).toThrow();
  });
});
