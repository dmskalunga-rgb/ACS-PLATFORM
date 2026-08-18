import type { EventEnvelope } from '@acs/contracts';
import type { EventTransportPort, PublishResult } from './types.js';
import { RetryableTransportError, TerminalTransportError } from './publisher.js';

/** TEST_ONLY deterministic transport. It is not production infrastructure. */
export class TestOnlyInMemoryEventTransport implements EventTransportPort {
  readonly published: EventEnvelope[] = [];
  private readonly failures = new Map<string, 'retryable' | 'terminal'>();

  fail(eventId: string, kind: 'retryable' | 'terminal'): void {
    this.failures.set(eventId, kind);
  }

  publish(event: EventEnvelope, signal?: AbortSignal): Promise<PublishResult> {
    if (signal?.aborted === true)
      return Promise.reject(new RetryableTransportError('SHUTDOWN', 'Shutting down.'));
    const failure = this.failures.get(event.event_id);
    if (failure === 'retryable')
      return Promise.reject(
        new RetryableTransportError('TEST_TRANSIENT', 'Deterministic transient failure.'),
      );
    if (failure === 'terminal')
      return Promise.reject(
        new TerminalTransportError('TEST_TERMINAL', 'Deterministic terminal failure.'),
      );
    this.published.push(event);
    return Promise.resolve({ brokerReference: `test-only:${event.event_id}` });
  }
}
