import { eventEnvelopeSchema } from '@acs/contracts';
import {
  noOpEventTelemetry,
  noOpEventHealth,
  type EventDeliveryHealthPort,
  type EventDeliveryTelemetryPort,
  type EventTransportPort,
  type OutboxRepositoryPort,
} from './types.js';

export interface PublisherConfiguration {
  readonly batchSize: number;
  readonly baseRetryMilliseconds: number;
  readonly leaseMilliseconds: number;
  readonly maxAttempts: number;
  readonly maxRetryMilliseconds: number;
  readonly workerId: string;
}

export class RetryableTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RetryableTransportError';
  }
}

export class TerminalTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TerminalTransportError';
  }
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function validatePublisherConfiguration(
  input: PublisherConfiguration,
): PublisherConfiguration {
  const configuration = {
    batchSize: boundedInteger(input.batchSize, 1, 500, 'batchSize'),
    baseRetryMilliseconds: boundedInteger(
      input.baseRetryMilliseconds,
      100,
      60_000,
      'baseRetryMilliseconds',
    ),
    leaseMilliseconds: boundedInteger(input.leaseMilliseconds, 1_000, 300_000, 'leaseMilliseconds'),
    maxAttempts: boundedInteger(input.maxAttempts, 1, 100, 'maxAttempts'),
    maxRetryMilliseconds: boundedInteger(
      input.maxRetryMilliseconds,
      input.baseRetryMilliseconds,
      3_600_000,
      'maxRetryMilliseconds',
    ),
    workerId: input.workerId.trim(),
  };
  if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(configuration.workerId)) {
    throw new Error('workerId must be a bounded operational identifier.');
  }
  return configuration;
}

export function retryDelayMilliseconds(
  attempts: number,
  configuration: Pick<PublisherConfiguration, 'baseRetryMilliseconds' | 'maxRetryMilliseconds'>,
): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 30));
  return Math.min(
    configuration.maxRetryMilliseconds,
    configuration.baseRetryMilliseconds * 2 ** exponent,
  );
}

export class OutboxPublisher {
  private readonly configuration: PublisherConfiguration;

  constructor(
    private readonly repository: OutboxRepositoryPort,
    private readonly transport: EventTransportPort,
    configuration: PublisherConfiguration,
    private readonly telemetry: EventDeliveryTelemetryPort = noOpEventTelemetry,
    private readonly now: () => Date = () => new Date(),
    private readonly health: EventDeliveryHealthPort = noOpEventHealth,
  ) {
    this.configuration = validatePublisherConfiguration(configuration);
  }

  async runBatch(signal?: AbortSignal): Promise<{ claimed: number; published: number }> {
    if (isAborted(signal)) return { claimed: 0, published: 0 };
    const backlog = await this.repository.backlog();
    this.telemetry.backlog(backlog.pending, backlog.oldestPendingSeconds);
    const claimed = await this.repository.claimBatch({
      batchSize: this.configuration.batchSize,
      leaseMilliseconds: this.configuration.leaseMilliseconds,
      workerId: this.configuration.workerId,
    });
    this.telemetry.claim(claimed.length);
    let published = 0;
    for (const item of claimed) {
      if (isAborted(signal)) break;
      const started = this.now().getTime();
      const envelope = eventEnvelopeSchema.safeParse(item.envelope);
      if (!envelope.success) {
        const state = await this.recordTransportFailure(item, 'INVALID_EVENT_ENVELOPE', false);
        if (state === 'DEAD_LETTERED') this.telemetry.deadLetter();
        this.telemetry.observePublish(Math.max(0, this.now().getTime() - started));
        continue;
      }
      let result: Awaited<ReturnType<EventTransportPort['publish']>>;
      try {
        result = await this.transport.publish(envelope.data, signal);
      } catch (error) {
        const retryable = error instanceof RetryableTransportError;
        const errorCode =
          error instanceof RetryableTransportError || error instanceof TerminalTransportError
            ? error.code
            : 'UNCLASSIFIED_PUBLISH_FAILURE';
        const state = await this.recordTransportFailure(item, errorCode, retryable);
        if (state === 'DEAD_LETTERED') this.telemetry.deadLetter();
        this.telemetry.observePublish(Math.max(0, this.now().getTime() - started));
        continue;
      }
      try {
        await this.repository.markPublished({
          ...(result.brokerReference === undefined
            ? {}
            : { brokerReference: result.brokerReference }),
          claimToken: item.claimToken,
          eventId: envelope.data.event_id,
        });
        published += 1;
        this.telemetry.published();
        this.health.available();
      } catch (error) {
        this.health.degraded('PERSISTENCE_FAILURE');
        throw error;
      } finally {
        this.telemetry.observePublish(Math.max(0, this.now().getTime() - started));
      }
    }
    return { claimed: claimed.length, published };
  }

  private async recordTransportFailure(
    item: Awaited<ReturnType<OutboxRepositoryPort['claimBatch']>>[number],
    errorCode: string,
    retryable: boolean,
  ): Promise<'RETRY_PENDING' | 'DEAD_LETTERED'> {
    const delay = retryDelayMilliseconds(item.attemptCount, this.configuration);
    const state = await this.repository.markFailed({
      claimToken: item.claimToken,
      errorCode,
      eventId: item.envelope.event_id,
      maxAttempts: this.configuration.maxAttempts,
      nextAttemptAt: new Date(this.now().getTime() + delay).toISOString(),
      retryable,
    });
    this.telemetry.failure(retryable);
    this.health.degraded('TRANSPORT_FAILURE');
    return state;
  }

  async runUntilStopped(input: {
    readonly idleDelayMilliseconds: number;
    readonly signal: AbortSignal;
  }): Promise<void> {
    const idleDelay = boundedInteger(
      input.idleDelayMilliseconds,
      10,
      60_000,
      'idleDelayMilliseconds',
    );
    while (!isAborted(input.signal)) {
      const result = await this.runBatch(input.signal);
      if (result.claimed === 0 && !isAborted(input.signal)) {
        await abortableDelay(idleDelay, input.signal);
      }
    }
  }
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
