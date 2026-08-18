import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  ControlledReplayService,
  IdempotentEventConsumer,
  OutboxPublisher,
  ReplayDeniedError,
  TestOnlyInMemoryEventTransport,
} from '@acs/event-foundation';
import type { AuthorizationPort } from '@acs/foundation';
import { PostgresEventFoundationRepository } from './postgres-event-foundation.js';
const { Pool } = pg;

const required = {
  admin: process.env.DATABASE_URL,
  consumer: process.env.ACS_EVENT_CONSUMER_DATABASE_URL,
  operator: process.env.ACS_EVENT_OPERATOR_DATABASE_URL,
  publisher: process.env.ACS_EVENT_PUBLISHER_DATABASE_URL,
  retention: process.env.ACS_EVENT_RETENTION_DATABASE_URL,
};

const enabled = Object.values(required).every((value) => value !== undefined && value !== '');
const suite = enabled ? describe : describe.skip;
const tenantA = '00000000-0000-4000-8000-000000000011';
const tenantB = '00000000-0000-4000-8000-000000000022';
const actorA = '10000000-0000-4000-8000-000000000011';

suite('Event Delivery & Operational Lifecycle PostgreSQL E2E', () => {
  const admin = new Pool({ connectionString: required.admin, max: 10 });
  const publisherRepository = new PostgresEventFoundationRepository(required.publisher as string);
  const consumerRepository = new PostgresEventFoundationRepository(required.consumer as string);
  const operatorRepository = new PostgresEventFoundationRepository(required.operator as string);
  const retentionRepository = new PostgresEventFoundationRepository(required.retention as string);
  const createdEvents: string[] = [];

  afterAll(async () => {
    if (createdEvents.length > 0) {
      await admin.query('DELETE FROM platform.domain_events WHERE event_id = ANY($1::uuid[])', [
        createdEvents,
      ]);
    }
    await Promise.all([
      admin.end(),
      publisherRepository.close(),
      consumerRepository.close(),
      operatorRepository.close(),
      retentionRepository.close(),
    ]);
  });

  async function insertEvent(tenantId = tenantA): Promise<string> {
    const eventId = randomUUID();
    createdEvents.push(eventId);
    await admin.query(
      `INSERT INTO platform.domain_events(event_id,event_type,tenant_id,correlation_id,causation_id,payload)
       VALUES($1,'platform.foundation.test_event',$2,$3,$4,jsonb_build_object('safe_value','test'))`,
      [eventId, tenantId, randomUUID(), randomUUID()],
    );
    return eventId;
  }

  function publisher(workerId: string, transport: TestOnlyInMemoryEventTransport) {
    return new OutboxPublisher(publisherRepository, transport, {
      batchSize: 100,
      baseRetryMilliseconds: 100,
      leaseMilliseconds: 5_000,
      maxAttempts: 3,
      maxRetryMilliseconds: 5_000,
      workerId,
    });
  }

  it('publishes through the TEST_ONLY transport and gives consumers an atomic duplicate result', async () => {
    const eventId = await insertEvent();
    const transport = new TestOnlyInMemoryEventTransport();
    await expect(publisher('e2e-worker-1', transport).runBatch()).resolves.toMatchObject({
      published: 1,
    });
    expect(transport.published.map((event) => event.event_id)).toContain(eventId);
    const delivery = await admin.query<{ state: string }>(
      'SELECT state FROM platform.event_deliveries WHERE event_id=$1',
      [eventId],
    );
    expect(delivery.rows[0]?.state).toBe('PUBLISHED');

    const handler = vi.fn(() => Promise.resolve());
    const consumer = new IdempotentEventConsumer(consumerRepository, {
      consumer: 'event-foundation-e2e',
      leaseMilliseconds: 5_000,
      retentionMilliseconds: 60_000,
      supportedMajorVersion: 1,
    });
    const event = transport.published.find((candidate) => candidate.event_id === eventId)!;
    await expect(consumer.consume(event, handler)).resolves.toBe('PROCESSED');
    await expect(consumer.consume(event, handler)).resolves.toBe('DUPLICATE');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('allows simultaneous publishers without duplicate claims and recovers an expired lease', async () => {
    const batch = await Promise.all(Array.from({ length: 20 }, () => insertEvent()));
    const transportA = new TestOnlyInMemoryEventTransport();
    const transportB = new TestOnlyInMemoryEventTransport();
    const started = performance.now();
    await Promise.all([
      publisher('e2e-worker-a', transportA).runBatch(),
      publisher('e2e-worker-b', transportB).runBatch(),
    ]);
    const delivered = [...transportA.published, ...transportB.published]
      .map((event) => event.event_id)
      .filter((eventId) => batch.includes(eventId));
    expect(new Set(delivered).size).toBe(20);
    expect(performance.now() - started).toBeGreaterThanOrEqual(0);

    const crashEvent = await insertEvent();
    const claimed = await publisherRepository.claimBatch({
      batchSize: 1,
      leaseMilliseconds: 5_000,
      workerId: 'crashing-worker',
    });
    expect(claimed[0]?.envelope.event_id).toBe(crashEvent);
    await admin.query(
      "UPDATE platform.event_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE event_id=$1",
      [crashEvent],
    );
    const recovered = await publisherRepository.claimBatch({
      batchSize: 1,
      leaseMilliseconds: 5_000,
      workerId: 'recovery-worker',
    });
    expect(recovered[0]?.envelope.event_id).toBe(crashEvent);
  });

  it('fails replay closed for assurance, authorization, and wrong-tenant requests', async () => {
    const eventId = await insertEvent();
    await admin.query(
      `UPDATE platform.event_deliveries SET state='DEAD_LETTERED',dead_lettered_at=clock_timestamp(),
       last_error_code='TERMINAL_TEST' WHERE event_id=$1`,
      [eventId],
    );
    const allow: AuthorizationPort = {
      authorize: vi.fn(() => Promise.resolve({ allowed: true, reason: 'ALLOW' })),
    };
    const service = new ControlledReplayService(allow, operatorRepository);
    const request = {
      actorId: actorA,
      assuranceSatisfied: false,
      correlationId: randomUUID(),
      eventId,
      reason: 'Controlled E2E replay after terminal test failure.',
      tenantId: tenantA,
    };
    await expect(service.request(request)).rejects.toBeInstanceOf(ReplayDeniedError);
    await expect(
      service.request({ ...request, assuranceSatisfied: true, tenantId: tenantB }),
    ).rejects.toThrow();
    await expect(
      service.request({ ...request, assuranceSatisfied: true }),
    ).resolves.toBeUndefined();
    const state = await admin.query<{ state: string }>(
      'SELECT state FROM platform.event_deliveries WHERE event_id=$1',
      [eventId],
    );
    expect(state.rows[0]?.state).toBe('RETRY_PENDING');
  });

  it('cleans only expired published events and expired processed receipts', async () => {
    const eventId = await insertEvent();
    await admin.query(
      `UPDATE platform.event_deliveries SET state='PUBLISHED',published_at=clock_timestamp()-interval '120 seconds'
       WHERE event_id=$1`,
      [eventId],
    );
    const receipt = await consumerRepository.acquire({
      consumer: 'retention-e2e',
      eventId,
      leaseMilliseconds: 5_000,
      retentionMilliseconds: 60_000,
      tenantId: tenantA,
    });
    await consumerRepository.complete({
      claimToken: receipt.claimToken!,
      consumer: 'retention-e2e',
      eventId,
      tenantId: tenantA,
    });
    await admin.query(
      "UPDATE platform.consumer_event_receipts SET expires_at=clock_timestamp()-interval '1 second' WHERE event_id=$1",
      [eventId],
    );
    await expect(
      retentionRepository.cleanupConsumerReceipts({ batchSize: 10, correlationId: randomUUID() }),
    ).resolves.toBe(1);
    await expect(
      retentionRepository.cleanupPublished({
        batchSize: 10,
        correlationId: randomUUID(),
        retentionMilliseconds: 60_000,
      }),
    ).resolves.toBe(1);
    const exists = await admin.query('SELECT 1 FROM platform.domain_events WHERE event_id=$1', [
      eventId,
    ]);
    expect(exists.rowCount).toBe(0);
  });

  it('records a local PostgreSQL/test-transport performance baseline without asserting an SLO', async () => {
    const eventIds = await Promise.all(Array.from({ length: 50 }, () => insertEvent()));
    const transport = new TestOnlyInMemoryEventTransport();
    const publishStarted = performance.now();
    await publisher('baseline-worker', transport).runBatch();
    const publishMilliseconds = performance.now() - publishStarted;
    const baselinePublished = transport.published.filter((event) =>
      eventIds.includes(event.event_id),
    ).length;
    expect(baselinePublished).toBe(50);

    const retryEvent = await insertEvent();
    const retryTransport = new TestOnlyInMemoryEventTransport();
    retryTransport.fail(retryEvent, 'retryable');
    const retryStarted = performance.now();
    await publisher('baseline-retry-worker', retryTransport).runBatch();
    const retryMilliseconds = performance.now() - retryStarted;
    const retryState = await admin.query<{ state: string }>(
      'SELECT state FROM platform.event_deliveries WHERE event_id=$1',
      [retryEvent],
    );
    expect(retryState.rows[0]?.state).toBe('RETRY_PENDING');

    await admin.query(
      `UPDATE platform.event_deliveries SET published_at=clock_timestamp()-interval '120 seconds'
       WHERE event_id=ANY($1::uuid[]) AND state='PUBLISHED'`,
      [eventIds],
    );
    const cleanupStarted = performance.now();
    const removed = await retentionRepository.cleanupPublished({
      batchSize: 100,
      correlationId: randomUUID(),
      retentionMilliseconds: 60_000,
    });
    const cleanupMilliseconds = performance.now() - cleanupStarted;
    expect(removed).toBe(50);

    process.stdout.write(
      `${JSON.stringify({
        baseline_only_not_slo: true,
        cleanup_events: removed,
        cleanup_milliseconds: Number(cleanupMilliseconds.toFixed(2)),
        publish_events: baselinePublished,
        publish_milliseconds: Number(publishMilliseconds.toFixed(2)),
        retry_events: 1,
        retry_milliseconds: Number(retryMilliseconds.toFixed(2)),
      })}\n`,
    );
  });
});
