import { eventEnvelopeSchema, type EventEnvelope } from '@acs/contracts';
import {
  noOpEventTelemetry,
  type ConsumerReceiptPort,
  type EventDeliveryTelemetryPort,
} from './types.js';

export class UnsupportedEventVersionError extends Error {
  constructor(readonly version: string) {
    super(`Unsupported event schema version: ${version}`);
    this.name = 'UnsupportedEventVersionError';
  }
}

export class IdempotentEventConsumer {
  constructor(
    private readonly receipts: ConsumerReceiptPort,
    private readonly configuration: {
      readonly consumer: string;
      readonly leaseMilliseconds: number;
      readonly retentionMilliseconds: number;
      readonly supportedMajorVersion: number;
    },
    private readonly telemetry: EventDeliveryTelemetryPort = noOpEventTelemetry,
  ) {}

  async consume(
    rawEvent: unknown,
    handler: (event: EventEnvelope) => Promise<void>,
  ): Promise<'PROCESSED' | 'DUPLICATE'> {
    const event = eventEnvelopeSchema.parse(rawEvent);
    if (Number(event.schema_version.split('.')[0]) !== this.configuration.supportedMajorVersion) {
      throw new UnsupportedEventVersionError(event.schema_version);
    }
    const acquired = await this.receipts.acquire({
      consumer: this.configuration.consumer,
      eventId: event.event_id,
      leaseMilliseconds: this.configuration.leaseMilliseconds,
      retentionMilliseconds: this.configuration.retentionMilliseconds,
      tenantId: event.tenant_id,
    });
    if (acquired.duplicate || acquired.claimToken === undefined) {
      this.telemetry.duplicate();
      return 'DUPLICATE';
    }
    try {
      await handler(event);
      await this.receipts.complete({
        claimToken: acquired.claimToken,
        consumer: this.configuration.consumer,
        eventId: event.event_id,
        tenantId: event.tenant_id,
      });
      return 'PROCESSED';
    } catch (error) {
      await this.receipts.release({
        claimToken: acquired.claimToken,
        consumer: this.configuration.consumer,
        eventId: event.event_id,
        tenantId: event.tenant_id,
      });
      throw error;
    }
  }
}
