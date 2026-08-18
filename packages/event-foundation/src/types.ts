import type { EventEnvelope } from '@acs/contracts';

export type DeliveryState =
  'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'RETRY_PENDING' | 'DEAD_LETTERED';

export interface ClaimedEvent {
  readonly attemptCount: number;
  readonly claimToken: string;
  readonly envelope: EventEnvelope;
}

export interface PublishResult {
  readonly brokerReference?: string;
}

export interface EventTransportPort {
  publish(event: EventEnvelope, signal?: AbortSignal): Promise<PublishResult>;
}

export interface OutboxRepositoryPort {
  backlog(): Promise<{ readonly oldestPendingSeconds: number; readonly pending: number }>;
  claimBatch(input: {
    readonly batchSize: number;
    readonly leaseMilliseconds: number;
    readonly workerId: string;
  }): Promise<readonly ClaimedEvent[]>;
  markFailed(input: {
    readonly claimToken: string;
    readonly errorCode: string;
    readonly eventId: string;
    readonly maxAttempts: number;
    readonly nextAttemptAt: string;
    readonly retryable: boolean;
  }): Promise<'RETRY_PENDING' | 'DEAD_LETTERED'>;
  markPublished(input: {
    readonly brokerReference?: string;
    readonly claimToken: string;
    readonly eventId: string;
  }): Promise<void>;
}

export interface ConsumerReceiptPort {
  acquire(input: {
    readonly consumer: string;
    readonly eventId: string;
    readonly leaseMilliseconds: number;
    readonly retentionMilliseconds: number;
    readonly tenantId: string;
  }): Promise<{ readonly claimToken?: string; readonly duplicate: boolean }>;
  complete(input: {
    readonly claimToken: string;
    readonly consumer: string;
    readonly eventId: string;
    readonly tenantId: string;
  }): Promise<void>;
  release(input: {
    readonly claimToken: string;
    readonly consumer: string;
    readonly eventId: string;
    readonly tenantId: string;
  }): Promise<void>;
}

export interface ReplayRepositoryPort {
  requestReplay(input: {
    readonly actorId: string;
    readonly correlationId: string;
    readonly eventId: string;
    readonly reason: string;
    readonly tenantId: string;
  }): Promise<void>;
}

export interface EventDeliveryTelemetryPort {
  backlog(pending: number, oldestSeconds: number): void;
  claim(count: number): void;
  deadLetter(): void;
  duplicate(): void;
  failure(retryable: boolean): void;
  observePublish(milliseconds: number): void;
  published(): void;
  replay(outcome: 'allowed' | 'denied'): void;
}

export interface EventDeliveryHealthPort {
  available(): void;
  degraded(reason: 'TRANSPORT_FAILURE' | 'PERSISTENCE_FAILURE'): void;
}

export const noOpEventHealth: EventDeliveryHealthPort = {
  available: () => undefined,
  degraded: () => undefined,
};

export class EventDeliveryHealthTracker implements EventDeliveryHealthPort {
  private current: Readonly<{
    reason?: 'TRANSPORT_FAILURE' | 'PERSISTENCE_FAILURE';
    state: 'AVAILABLE' | 'DEGRADED';
  }> = { state: 'AVAILABLE' };

  available(): void {
    this.current = { state: 'AVAILABLE' };
  }

  degraded(reason: 'TRANSPORT_FAILURE' | 'PERSISTENCE_FAILURE'): void {
    this.current = { reason, state: 'DEGRADED' };
  }

  status(): typeof this.current {
    return this.current;
  }
}

export const noOpEventTelemetry: EventDeliveryTelemetryPort = {
  backlog: () => undefined,
  claim: () => undefined,
  deadLetter: () => undefined,
  duplicate: () => undefined,
  failure: () => undefined,
  observePublish: () => undefined,
  published: () => undefined,
  replay: () => undefined,
};
