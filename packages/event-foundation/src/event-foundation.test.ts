import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { EventEnvelope } from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import { IdempotentEventConsumer, UnsupportedEventVersionError } from './consumer.js';
import {
  OutboxPublisher,
  RetryableTransportError,
  TerminalTransportError,
  retryDelayMilliseconds,
} from './publisher.js';
import { ControlledReplayService, ReplayDeniedError } from './replay.js';
import { TestOnlyInMemoryEventTransport } from './test-transport.js';
import { EventDeliveryHealthTracker } from './types.js';
import type {
  ClaimedEvent,
  ConsumerReceiptPort,
  OutboxRepositoryPort,
  ReplayRepositoryPort,
} from './types.js';

/* eslint-disable @typescript-eslint/unbound-method -- Vitest inspects port method mocks without invoking them. */

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    event_id: randomUUID(),
    event_type: 'platform.membership.role_assigned',
    schema_version: '1.0.0',
    tenant_id: randomUUID(),
    timestamp: new Date('2026-08-18T00:00:00.000Z').toISOString(),
    correlation_id: randomUUID(),
    causation_id: randomUUID(),
    producer: 'event-foundation-test',
    classification: 'INTERNAL',
    payload: { membership_id: randomUUID(), version: 2 },
    ...overrides,
  };
}

function publisherRepository(events: ClaimedEvent[]) {
  const repository: OutboxRepositoryPort = {
    backlog: vi.fn(() => Promise.resolve({ oldestPendingSeconds: 0, pending: events.length })),
    claimBatch: vi.fn(() => Promise.resolve(events)),
    markFailed: vi.fn((input: Parameters<OutboxRepositoryPort['markFailed']>[0]) =>
      Promise.resolve(input.retryable ? ('RETRY_PENDING' as const) : ('DEAD_LETTERED' as const)),
    ),
    markPublished: vi.fn(() => Promise.resolve()),
  };
  return repository;
}

describe('event delivery publisher foundation', () => {
  it('publishes a bounded claimed batch and acknowledges after transport acceptance', async () => {
    const event = envelope();
    const repository = publisherRepository([
      { attemptCount: 1, claimToken: randomUUID(), envelope: event },
    ]);
    const transport = new TestOnlyInMemoryEventTransport();
    const publisher = new OutboxPublisher(repository, transport, {
      batchSize: 10,
      baseRetryMilliseconds: 100,
      leaseMilliseconds: 5_000,
      maxAttempts: 5,
      maxRetryMilliseconds: 10_000,
      workerId: 'worker-1',
    });

    await expect(publisher.runBatch()).resolves.toEqual({ claimed: 1, published: 1 });
    expect(transport.published).toEqual([event]);
    expect(repository.markPublished).toHaveBeenCalledOnce();
  });

  it.each([
    [new RetryableTransportError('TRANSIENT', 'retry'), true, 'RETRY_PENDING'],
    [new TerminalTransportError('INVALID', 'terminal'), false, 'DEAD_LETTERED'],
  ] as const)(
    'classifies transport failures without infinite retry',
    async (failure, retryable, state) => {
      const event = envelope();
      const repository = publisherRepository([
        { attemptCount: 3, claimToken: randomUUID(), envelope: event },
      ]);
      const publisher = new OutboxPublisher(
        repository,
        { publish: vi.fn(() => Promise.reject(failure)) },
        {
          batchSize: 1,
          baseRetryMilliseconds: 100,
          leaseMilliseconds: 5_000,
          maxAttempts: 5,
          maxRetryMilliseconds: 10_000,
          workerId: 'worker-1',
        },
        undefined,
        () => new Date('2026-08-18T00:00:00.000Z'),
      );

      await publisher.runBatch();
      expect(repository.markFailed).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: failure.code, retryable }),
      );
      await expect(
        repository.markFailed(vi.mocked(repository.markFailed).mock.calls[0]![0]),
      ).resolves.toBe(state);
    },
  );

  it('bounds exponential retry delay', () => {
    expect(
      retryDelayMilliseconds(1, { baseRetryMilliseconds: 100, maxRetryMilliseconds: 1_000 }),
    ).toBe(100);
    expect(
      retryDelayMilliseconds(20, { baseRetryMilliseconds: 100, maxRetryMilliseconds: 1_000 }),
    ).toBe(1_000);
  });

  it('documents at-least-once duplicate behavior when acknowledgement fails after publish', async () => {
    const event = envelope();
    const transport = new TestOnlyInMemoryEventTransport();
    const first = publisherRepository([
      { attemptCount: 1, claimToken: randomUUID(), envelope: event },
    ]);
    first.markPublished = vi.fn(() => Promise.reject(new Error('acknowledgement connection lost')));
    const configuration = {
      batchSize: 1,
      baseRetryMilliseconds: 100,
      leaseMilliseconds: 5_000,
      maxAttempts: 3,
      maxRetryMilliseconds: 1_000,
      workerId: 'worker-crash-boundary',
    };
    await expect(new OutboxPublisher(first, transport, configuration).runBatch()).rejects.toThrow();
    const recovered = publisherRepository([
      { attemptCount: 2, claimToken: randomUUID(), envelope: event },
    ]);
    await new OutboxPublisher(recovered, transport, configuration).runBatch();
    expect(
      transport.published.filter((candidate) => candidate.event_id === event.event_id),
    ).toHaveLength(2);
  });

  it('reports transport degradation separately from application liveness', async () => {
    const event = envelope();
    const health = new EventDeliveryHealthTracker();
    const repository = publisherRepository([
      { attemptCount: 1, claimToken: randomUUID(), envelope: event },
    ]);
    const publisher = new OutboxPublisher(
      repository,
      { publish: () => Promise.reject(new RetryableTransportError('OUTAGE', 'offline')) },
      {
        batchSize: 1,
        baseRetryMilliseconds: 100,
        leaseMilliseconds: 5_000,
        maxAttempts: 3,
        maxRetryMilliseconds: 1_000,
        workerId: 'health-worker',
      },
      undefined,
      undefined,
      health,
    );
    await publisher.runBatch();
    expect(health.status()).toEqual({ reason: 'TRANSPORT_FAILURE', state: 'DEGRADED' });
  });
});

describe('idempotent consumer foundation', () => {
  it('returns a safe duplicate result without invoking the handler', async () => {
    const event = envelope();
    const receipts: ConsumerReceiptPort = {
      acquire: vi.fn(() => Promise.resolve({ duplicate: true })),
      complete: vi.fn(),
      release: vi.fn(),
    };
    const handler = vi.fn();
    const consumer = new IdempotentEventConsumer(receipts, {
      consumer: 'test-consumer',
      leaseMilliseconds: 5_000,
      retentionMilliseconds: 60_000,
      supportedMajorVersion: 1,
    });

    await expect(consumer.consume(event, handler)).resolves.toBe('DUPLICATE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('records completion only after successful processing and rejects incompatible versions', async () => {
    const event = envelope();
    const claimToken = randomUUID();
    const receipts: ConsumerReceiptPort = {
      acquire: vi.fn(() => Promise.resolve({ claimToken, duplicate: false })),
      complete: vi.fn(() => Promise.resolve()),
      release: vi.fn(() => Promise.resolve()),
    };
    const consumer = new IdempotentEventConsumer(receipts, {
      consumer: 'test-consumer',
      leaseMilliseconds: 5_000,
      retentionMilliseconds: 60_000,
      supportedMajorVersion: 1,
    });

    await expect(
      consumer.consume(
        event,
        vi.fn(() => Promise.resolve()),
      ),
    ).resolves.toBe('PROCESSED');
    expect(receipts.complete).toHaveBeenCalledOnce();
    await expect(
      consumer.consume({ ...event, schema_version: '2.0.0' }, vi.fn()),
    ).rejects.toBeInstanceOf(UnsupportedEventVersionError);
  });
});

describe('controlled replay foundation', () => {
  const repository: ReplayRepositoryPort = { requestReplay: vi.fn(() => Promise.resolve()) };

  it('fails closed without step-up before authorization or repository access', async () => {
    const authorization: AuthorizationPort = {
      authorize: vi.fn(() => Promise.resolve({ allowed: true, reason: 'ALLOW' })),
    };
    const service = new ControlledReplayService(authorization, repository);
    await expect(
      service.request({
        actorId: randomUUID(),
        assuranceSatisfied: false,
        correlationId: randomUUID(),
        eventId: randomUUID(),
        reason: 'Operator requested controlled recovery.',
        tenantId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ReplayDeniedError);
    expect(authorization.authorize).not.toHaveBeenCalled();
  });

  it('requires server-side authorization and a bounded reason', async () => {
    const authorization: AuthorizationPort = {
      authorize: vi.fn(() => Promise.resolve({ allowed: true, reason: 'ALLOW' })),
    };
    const replay = { requestReplay: vi.fn(() => Promise.resolve()) };
    const service = new ControlledReplayService(authorization, replay);
    await service.request({
      actorId: randomUUID(),
      assuranceSatisfied: true,
      correlationId: randomUUID(),
      eventId: randomUUID(),
      reason: 'Recover a verified terminal transport failure.',
      tenantId: randomUUID(),
    });
    expect(replay.requestReplay).toHaveBeenCalledOnce();
  });
});
