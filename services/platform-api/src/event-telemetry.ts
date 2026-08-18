import type { EventDeliveryTelemetryPort } from '@acs/event-foundation';
import type { createMetricsRegistry } from '@acs/observability';

type EventMetrics = Pick<
  ReturnType<typeof createMetricsRegistry>,
  | 'eventClaims'
  | 'eventOldestPendingAge'
  | 'eventOutcomes'
  | 'eventPendingDepth'
  | 'eventPublishDuration'
>;

export function createEventDeliveryTelemetry(metrics: EventMetrics): EventDeliveryTelemetryPort {
  return {
    backlog(pending, oldestSeconds) {
      metrics.eventPendingDepth.set(Math.max(0, pending));
      metrics.eventOldestPendingAge.set(Math.max(0, oldestSeconds));
    },
    claim(count) {
      if (count > 0) metrics.eventClaims.inc(count);
    },
    deadLetter() {
      metrics.eventOutcomes.inc({ outcome: 'dead_lettered' });
    },
    duplicate() {
      metrics.eventOutcomes.inc({ outcome: 'consumer_duplicate' });
    },
    failure(retryable) {
      metrics.eventOutcomes.inc({ outcome: retryable ? 'retryable_failure' : 'terminal_failure' });
    },
    observePublish(milliseconds) {
      metrics.eventPublishDuration.observe(Math.max(0, milliseconds) / 1_000);
    },
    published() {
      metrics.eventOutcomes.inc({ outcome: 'published' });
    },
    replay(outcome) {
      metrics.eventOutcomes.inc({ outcome: `replay_${outcome}` });
    },
  };
}
