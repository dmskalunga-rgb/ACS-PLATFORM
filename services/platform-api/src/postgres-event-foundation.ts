import pg from 'pg';
import { eventEnvelopeSchema } from '@acs/contracts';
import type {
  ConsumerReceiptPort,
  OutboxRepositoryPort,
  ReplayRepositoryPort,
} from '@acs/event-foundation';
const { Pool } = pg;

export class EventFoundationPersistenceError extends Error {
  constructor(readonly code: string) {
    super('Event lifecycle persistence rejected the operation.');
    this.name = 'EventFoundationPersistenceError';
  }
}

export class PostgresEventFoundationRepository
  implements OutboxRepositoryPort, ConsumerReceiptPort, ReplayRepositoryPort
{
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string, maximumConnections = 5) {
    this.pool = new Pool({ connectionString: databaseUrl, max: maximumConnections });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async backlog(): Promise<{ oldestPendingSeconds: number; pending: number }> {
    const result = await this.pool.query<{
      oldest_pending_seconds: number;
      pending: string;
    }>('SELECT * FROM platform.event_delivery_backlog()');
    return {
      oldestPendingSeconds: Math.max(0, Number(result.rows[0]?.oldest_pending_seconds ?? 0)),
      pending: Math.max(0, Number(result.rows[0]?.pending ?? 0)),
    };
  }

  async claimBatch(input: {
    readonly batchSize: number;
    readonly leaseMilliseconds: number;
    readonly workerId: string;
  }) {
    const result = await this.pool.query<{
      aggregate_key: string | null;
      attempt_count: number;
      causation_id: string | null;
      claim_token: string;
      classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'BOARD_CONFIDENTIAL';
      correlation_id: string;
      event_id: string;
      event_type: string;
      occurred_at: Date;
      payload: Record<string, unknown>;
      producer: string;
      schema_version: string;
      tenant_id: string;
    }>('SELECT * FROM platform.claim_event_delivery_batch($1,$2,$3)', [
      input.workerId,
      input.batchSize,
      Math.ceil(input.leaseMilliseconds / 1_000),
    ]);
    return result.rows.map((row) => ({
      attemptCount: row.attempt_count,
      claimToken: row.claim_token,
      envelope: eventEnvelopeSchema.parse({
        event_id: row.event_id,
        event_type: row.event_type,
        schema_version: row.schema_version,
        tenant_id: row.tenant_id,
        timestamp: row.occurred_at.toISOString(),
        correlation_id: row.correlation_id,
        causation_id: row.causation_id,
        producer: row.producer,
        classification: row.classification,
        payload: row.payload,
      }),
    }));
  }

  async markPublished(input: {
    readonly brokerReference?: string;
    readonly claimToken: string;
    readonly eventId: string;
  }): Promise<void> {
    const result = await this.pool.query<{ marked: boolean }>(
      'SELECT platform.mark_event_published($1,$2,$3) AS marked',
      [input.eventId, input.claimToken, input.brokerReference ?? null],
    );
    if (result.rows[0]?.marked !== true) throw new EventFoundationPersistenceError('STALE_CLAIM');
  }

  async markFailed(input: {
    readonly claimToken: string;
    readonly errorCode: string;
    readonly eventId: string;
    readonly maxAttempts: number;
    readonly nextAttemptAt: string;
    readonly retryable: boolean;
  }): Promise<'RETRY_PENDING' | 'DEAD_LETTERED'> {
    const result = await this.pool.query<{ state: 'RETRY_PENDING' | 'DEAD_LETTERED' }>(
      'SELECT platform.mark_event_publish_failed($1,$2,$3,$4,$5,$6) AS state',
      [
        input.eventId,
        input.claimToken,
        input.errorCode,
        input.retryable,
        input.maxAttempts,
        input.nextAttemptAt,
      ],
    );
    const state = result.rows[0]?.state;
    if (state === undefined) throw new EventFoundationPersistenceError('STALE_CLAIM');
    return state;
  }

  async acquire(input: {
    readonly consumer: string;
    readonly eventId: string;
    readonly leaseMilliseconds: number;
    readonly retentionMilliseconds: number;
    readonly tenantId: string;
  }) {
    const result = await this.pool.query<{ claim_token: string | null; duplicate: boolean }>(
      'SELECT * FROM platform.acquire_consumer_receipt($1,$2,$3,$4,$5)',
      [
        input.consumer,
        input.tenantId,
        input.eventId,
        Math.ceil(input.leaseMilliseconds / 1_000),
        Math.ceil(input.retentionMilliseconds / 1_000),
      ],
    );
    const row = result.rows[0];
    if (row === undefined) throw new EventFoundationPersistenceError('RECEIPT_NOT_ACQUIRED');
    return row.claim_token === null
      ? { duplicate: row.duplicate }
      : { claimToken: row.claim_token, duplicate: row.duplicate };
  }

  async complete(input: {
    readonly claimToken: string;
    readonly consumer: string;
    readonly eventId: string;
    readonly tenantId: string;
  }): Promise<void> {
    await this.requireTrue('SELECT platform.complete_consumer_receipt($1,$2,$3,$4) AS changed', [
      input.consumer,
      input.tenantId,
      input.eventId,
      input.claimToken,
    ]);
  }

  async release(input: {
    readonly claimToken: string;
    readonly consumer: string;
    readonly eventId: string;
    readonly tenantId: string;
  }): Promise<void> {
    await this.requireTrue('SELECT platform.release_consumer_receipt($1,$2,$3,$4) AS changed', [
      input.consumer,
      input.tenantId,
      input.eventId,
      input.claimToken,
    ]);
  }

  async requestReplay(input: {
    readonly actorId: string;
    readonly correlationId: string;
    readonly eventId: string;
    readonly reason: string;
    readonly tenantId: string;
  }): Promise<void> {
    await this.requireTrue('SELECT platform.request_event_replay($1,$2,$3,$4,$5) AS changed', [
      input.eventId,
      input.tenantId,
      input.actorId,
      input.reason,
      input.correlationId,
    ]);
  }

  async cleanupPublished(input: {
    readonly batchSize: number;
    readonly correlationId: string;
    readonly retentionMilliseconds: number;
  }): Promise<number> {
    const result = await this.pool.query<{ removed: number }>(
      'SELECT platform.cleanup_published_events($1,$2,$3) AS removed',
      [Math.ceil(input.retentionMilliseconds / 1_000), input.batchSize, input.correlationId],
    );
    return result.rows[0]?.removed ?? 0;
  }

  async cleanupConsumerReceipts(input: {
    readonly batchSize: number;
    readonly correlationId: string;
  }): Promise<number> {
    const result = await this.pool.query<{ removed: number }>(
      'SELECT platform.cleanup_consumer_receipts($1,$2) AS removed',
      [input.batchSize, input.correlationId],
    );
    return result.rows[0]?.removed ?? 0;
  }

  private async requireTrue(query: string, parameters: readonly unknown[]): Promise<void> {
    const result = await this.pool.query<{ changed: boolean }>(query, [...parameters]);
    if (result.rows[0]?.changed !== true)
      throw new EventFoundationPersistenceError('STALE_OR_DENIED_OPERATION');
  }
}
