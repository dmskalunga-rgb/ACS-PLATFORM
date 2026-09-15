import type { FusionResult } from '@acs/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalJson,
  CognitiveFusionFailure,
  sha256,
  type FusionReceiptRepository,
} from './cognitive-cyber-fusion-m0.js';
import { PostgresCognitiveCyberFusionM0Repository } from './postgres-cognitive-cyber-fusion-m0.js';

const uuid = (suffix: number) => `30000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const result = {
  status: 'COMPLETED',
  failure_code: null,
  classification: 'INTERNAL',
  assertions: [],
  hypotheses: [],
  cross_domain_assertions: [],
  evidence_gaps: [],
  recommended_investigation_actions: [],
  response_candidates: [],
} as unknown as FusionResult;

const refusedResult = {
  ...result,
  status: 'REFUSED',
  failure_code: 'INSUFFICIENT_CONFIDENCE',
} as unknown as FusionResult;

type QueryResult = { readonly rowCount: number; readonly rows: readonly unknown[] };
type FakeClient = {
  readonly query: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
};

function client(results: readonly QueryResult[]): FakeClient {
  const pending = [...results];
  return {
    query: vi.fn(() => Promise.resolve(pending.shift() ?? { rowCount: 1, rows: [] })),
    release: vi.fn(),
  };
}

function repositoryWith(...clients: FakeClient[]) {
  const repository = new PostgresCognitiveCyberFusionM0Repository('postgresql://unused');
  const pending = [...clients];
  Object.assign(repository, {
    pool: {
      connect: vi.fn(() => Promise.resolve(pending.shift())),
      end: vi.fn(() => Promise.resolve()),
    },
  });
  return repository;
}

function input(
  produce: Parameters<FusionReceiptRepository['execute']>[0]['produce'] = vi.fn(() =>
    Promise.resolve(result),
  ),
) {
  return {
    tenantId: uuid(1),
    contextToken: uuid(2),
    actorUserId: uuid(3),
    idempotencyKey: uuid(4),
    requestHash: 'a'.repeat(64),
    fusionRequestId: uuid(5),
    fusionResultId: uuid(6),
    reasoningMode: 'REFERENCE_VALIDATION' as const,
    reasoningPurpose: 'EVIDENCE_REFERENCE_VALIDATION' as const,
    evidenceReferenceCount: 1,
    contextSnapshotPresent: false,
    requestId: uuid(7),
    correlationId: uuid(8),
    expiresAt: new Date(Date.now() + 60_000),
    produce,
  };
}

function statements(fake: FakeClient): string[] {
  return fake.query.mock.calls.map(([sql]) => String(sql).replace(/\s+/gu, ' ').trim());
}

function queryCalls(fake: FakeClient): readonly (readonly unknown[])[] {
  return fake.query.mock.calls as readonly (readonly unknown[])[];
}

function parameters(call: readonly unknown[] | undefined): readonly unknown[] {
  const value = call?.[1];
  return Array.isArray(value) ? (value as unknown[]) : [];
}

describe('Postgres Cognitive Fusion M0 bounded receipt', () => {
  it('persists a refused result with denied audit and failed event but no completion event', async () => {
    const execution = client([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 1, rows: [] },
      {
        rowCount: 1,
        rows: [
          {
            request_hash: 'a'.repeat(64),
            status: 'IN_PROGRESS',
            fusion_request_id: uuid(5),
            fusion_result_id: uuid(6),
            request_id: uuid(7),
            correlation_id: uuid(8),
            result_hash: null,
            failure_code: null,
            completed_at: null,
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const outcome = await repositoryWith(execution).execute(
      input(vi.fn(() => Promise.resolve(refusedResult))),
    );

    expect(outcome).toEqual({ result: refusedResult, replay: false });
    const auditCall = queryCalls(execution).find((call) =>
      String(call[0]).includes('platform.audit_logs'),
    );
    expect(parameters(auditCall)).toEqual(
      expect.arrayContaining(['DENIED', 'INSUFFICIENT_CONFIDENCE']),
    );
    const eventCalls = queryCalls(execution).filter((call) =>
      String(call[0]).includes('platform.domain_events'),
    );
    expect(eventCalls.map((call) => parameters(call)[0])).toEqual([
      'cyberdefense.fusion.requested',
      'cyberdefense.fusion.failed',
    ]);
    expect(parameters(eventCalls[1])[5]).toMatchObject({
      failure_code: 'INSUFFICIENT_CONFIDENCE',
      dependency_class: 'NONE',
    });
    expect(statements(execution)).toContain('COMMIT');
  });

  it('returns exact completed replay without duplicate audit or outbox writes', async () => {
    const completedAt = '2026-09-09T00:00:00.000Z';
    const replayClient = client([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 0, rows: [] },
      {
        rowCount: 1,
        rows: [
          {
            request_hash: 'a'.repeat(64),
            status: 'COMPLETED',
            fusion_request_id: uuid(5),
            fusion_result_id: uuid(6),
            request_id: uuid(7),
            correlation_id: uuid(8),
            result_hash: sha256(canonicalJson(result)),
            failure_code: null,
            completed_at: completedAt,
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      },
      { rowCount: 0, rows: [] },
    ]);
    const produce = vi.fn(() => Promise.resolve(result));
    const outcome = await repositoryWith(replayClient).execute(input(produce));

    expect(outcome).toEqual({ result, replay: true });
    expect(produce).toHaveBeenCalledWith(completedAt, uuid(5), uuid(6), uuid(7), uuid(8));
    expect(statements(replayClient).some((sql) => sql.includes('platform.audit_logs'))).toBe(false);
    expect(statements(replayClient).some((sql) => sql.includes('platform.domain_events'))).toBe(
      false,
    );
  });

  it('replays a persisted failure without duplicate denied audit or failed event', async () => {
    const failedRow = {
      request_hash: 'a'.repeat(64),
      status: 'FAILED',
      fusion_request_id: uuid(5),
      fusion_result_id: null,
      request_id: uuid(7),
      correlation_id: uuid(8),
      result_hash: null,
      failure_code: 'REFERENCE_OWNER_UNAVAILABLE',
      completed_at: '2026-09-09T00:00:00.000Z',
      expires_at: new Date(Date.now() + 60_000),
    };
    const execution = client([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [failedRow] },
      { rowCount: 0, rows: [] },
    ]);
    const failureReplay = client([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [failedRow] },
      { rowCount: 0, rows: [] },
    ]);

    await expect(repositoryWith(execution, failureReplay).execute(input())).rejects.toMatchObject({
      code: 'REFERENCE_OWNER_UNAVAILABLE',
    });
    expect(statements(failureReplay).some((sql) => sql.includes('platform.audit_logs'))).toBe(
      false,
    );
    expect(statements(failureReplay).some((sql) => sql.includes('platform.domain_events'))).toBe(
      false,
    );
  });

  it('fails closed when a completed receipt result hash no longer matches', async () => {
    const completedAt = '2026-09-09T00:00:00.000Z';
    const execution = client([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 0, rows: [] },
      {
        rowCount: 1,
        rows: [
          {
            request_hash: 'a'.repeat(64),
            status: 'COMPLETED',
            fusion_request_id: uuid(5),
            fusion_result_id: uuid(6),
            request_id: uuid(7),
            correlation_id: uuid(8),
            result_hash: 'b'.repeat(64),
            failure_code: null,
            completed_at: completedAt,
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      },
      { rowCount: 0, rows: [] },
    ]);
    const failureAudit = client([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 0, rows: [] },
      {
        rowCount: 1,
        rows: [
          {
            request_hash: 'a'.repeat(64),
            status: 'COMPLETED',
            fusion_request_id: uuid(5),
            fusion_result_id: uuid(6),
            request_id: uuid(7),
            correlation_id: uuid(8),
            result_hash: 'b'.repeat(64),
            failure_code: null,
            completed_at: completedAt,
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);

    await expect(repositoryWith(execution, failureAudit).execute(input())).rejects.toMatchObject({
      code: 'PROVENANCE_TAMPERED',
    });
    expect(statements(execution)).toContain('ROLLBACK');
  });

  it('rolls back every success effect and persists one bounded failure on injection', async () => {
    const execution = client([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 1, rows: [] },
      {
        rowCount: 1,
        rows: [
          {
            request_hash: 'a'.repeat(64),
            status: 'IN_PROGRESS',
            fusion_request_id: uuid(5),
            fusion_result_id: uuid(6),
            request_id: uuid(7),
            correlation_id: uuid(8),
            result_hash: null,
            failure_code: null,
            completed_at: null,
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const persistedFailure = client([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{}] },
      { rowCount: 1, rows: [] },
      {
        rowCount: 1,
        rows: [
          {
            request_hash: 'a'.repeat(64),
            status: 'FAILED',
            fusion_request_id: uuid(5),
            fusion_result_id: null,
            request_id: uuid(7),
            correlation_id: uuid(8),
            result_hash: null,
            failure_code: 'DEPENDENCY_UNAVAILABLE',
            completed_at: '2026-09-09T00:00:00.000Z',
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const repository = new PostgresCognitiveCyberFusionM0Repository(
      'postgresql://unused',
      (phase) => {
        if (phase === 'after-audit') throw new Error('injected');
      },
    );
    const pending = [execution, persistedFailure];
    Object.assign(repository, {
      pool: {
        connect: vi.fn(() => Promise.resolve(pending.shift())),
        end: vi.fn(() => Promise.resolve()),
      },
    });

    await expect(repository.execute(input())).rejects.toBeInstanceOf(CognitiveFusionFailure);
    expect(statements(execution)).toContain('ROLLBACK');
    expect(statements(execution)).not.toContain('COMMIT');
    expect(
      statements(persistedFailure).filter((sql) => sql.includes('platform.audit_logs')),
    ).toHaveLength(1);
    expect(
      statements(persistedFailure).filter((sql) => sql.includes('platform.domain_events')),
    ).toHaveLength(1);
    expect(statements(persistedFailure)).toContain('COMMIT');
  });
});
