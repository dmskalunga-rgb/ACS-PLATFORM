import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import {
  PostgresMultiPersonAuthorizationRepository,
  withMultiPersonAuthorizationConsumption,
  type PostgresMpaTransaction,
} from './postgres-multi-person-authorization.js';

const envelope = {
  authorization_id: '10000000-0000-4000-8000-000000000001',
  tenant_id: '20000000-0000-4000-8000-000000000002',
  requester_user_id: '30000000-0000-4000-8000-000000000003',
  operation: 'cyberdefense.evidence.export' as const,
  target_reference_hash: 'a'.repeat(64),
  policy_id: 'cyberdefense.evidence.export.standard' as const,
  policy_version: '1.0.0' as const,
  state: 'APPROVED' as const,
  version: '2',
  approval_count: 1,
  required_approval_count: 1,
  expires_at: new Date(Date.now() + 60_000),
};

function input(client: pg.PoolClient, protectedOperation: () => Promise<{ ok: boolean }>) {
  return {
    transaction: { kind: 'canonical-postgres-transaction' as const, client },
    contextToken: '40000000-0000-4000-8000-000000000004',
    tenantId: envelope.tenant_id,
    authorizationId: envelope.authorization_id,
    expectedVersion: 2,
    operation: envelope.operation,
    targetReferenceHash: envelope.target_reference_hash,
    policyId: envelope.policy_id,
    policyVersion: envelope.policy_version,
    actorUserId: '50000000-0000-4000-8000-000000000005',
    idempotencyKey: '60000000-0000-4000-8000-000000000006',
    requestHash: 'b'.repeat(64),
    requestId: '70000000-0000-4000-8000-000000000007',
    correlationId: '80000000-0000-4000-8000-000000000008',
    attestationReferenceHash: 'c'.repeat(64),
    async verifyAttestation() {
      await Promise.resolve();
      return true;
    },
    async protectedOperation(_transaction: PostgresMpaTransaction) {
      void _transaction;
      return protectedOperation();
    },
  };
}

describe('withMultiPersonAuthorizationConsumption', () => {
  it('couples consumption, protected mutation, audit, outbox, and command receipt', async () => {
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        await Promise.resolve();
        queries.push(sql);
        if (sql.includes('activate_tenant_context') || sql.includes('pg_advisory_xact_lock'))
          return { rowCount: 1, rows: [{}] };
        if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] };
        if (sql.includes('platform.materialize_mpa_expiry'))
          return { rowCount: 1, rows: [envelope] };
        if (sql.includes('INSERT INTO platform.mpa_consumptions'))
          return {
            rowCount: 1,
            rows: [{ consumption_id: '90000000-0000-4000-8000-000000000009' }],
          };
        return { rowCount: 1, rows: [] };
      },
    } as unknown as pg.PoolClient;
    const protectedOperation = vi.fn(async () => {
      await Promise.resolve();
      return { ok: true };
    });
    await expect(
      withMultiPersonAuthorizationConsumption(input(client, protectedOperation)),
    ).resolves.toEqual({ status: 'CONSUMED', result: { ok: true } });
    expect(protectedOperation).toHaveBeenCalledOnce();
    expect(queries.some((sql) => sql.includes("state='CONSUMED'"))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO platform.audit_logs'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO platform.domain_events'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO platform.mpa_command_results'))).toBe(
      true,
    );
  });

  it('does not append state/audit/outbox/result after a protected-operation failure', async () => {
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        await Promise.resolve();
        queries.push(sql);
        if (sql.includes('activate_tenant_context') || sql.includes('pg_advisory_xact_lock'))
          return { rowCount: 1, rows: [{}] };
        if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] };
        if (sql.includes('platform.materialize_mpa_expiry'))
          return { rowCount: 1, rows: [envelope] };
        if (sql.includes('INSERT INTO platform.mpa_consumptions'))
          return {
            rowCount: 1,
            rows: [{ consumption_id: '90000000-0000-4000-8000-000000000009' }],
          };
        return { rowCount: 1, rows: [] };
      },
    } as unknown as pg.PoolClient;
    await expect(
      withMultiPersonAuthorizationConsumption(
        input(client, async () => {
          await Promise.resolve();
          throw new Error('protected failure');
        }),
      ),
    ).rejects.toThrow('protected failure');
    expect(queries.some((sql) => sql.includes("state='CONSUMED'"))).toBe(false);
    expect(queries.some((sql) => sql.includes('INSERT INTO platform.audit_logs'))).toBe(false);
    expect(queries.some((sql) => sql.includes('INSERT INTO platform.domain_events'))).toBe(false);
  });

  it('fails closed before mutation when attestation is not verified', async () => {
    const query = vi.fn(async (sql: string) => {
      await Promise.resolve();
      if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] };
      if (sql.includes('platform.materialize_mpa_expiry')) return { rowCount: 1, rows: [envelope] };
      return { rowCount: 1, rows: [{}] };
    });
    const client = { query } as unknown as pg.PoolClient;
    await expect(
      withMultiPersonAuthorizationConsumption({
        ...input(client, async () => {
          await Promise.resolve();
          return { ok: true };
        }),
        async verifyAttestation() {
          await Promise.resolve();
          return false;
        },
      }),
    ).rejects.toMatchObject({ code: 'ATTESTATION_DENIED' });
    expect(
      query.mock.calls.some(([sql]) => sql.includes('INSERT INTO platform.mpa_consumptions')),
    ).toBe(false);
  });

  it('returns the persisted result for an exact idempotent retry without repeating mutation', async () => {
    const protectedOperation = vi.fn(async () => {
      await Promise.resolve();
      return { ok: false };
    });
    const client = {
      async query(sql: string) {
        await Promise.resolve();
        if (sql.includes('activate_tenant_context') || sql.includes('pg_advisory_xact_lock'))
          return { rowCount: 1, rows: [{}] };
        if (sql.includes('SELECT request_hash'))
          return {
            rowCount: 1,
            rows: [{ request_hash: 'b'.repeat(64), result: { protected_result: { ok: true } } }],
          };
        throw new Error('unexpected mutation during idempotent replay');
      },
    } as unknown as pg.PoolClient;
    await expect(
      withMultiPersonAuthorizationConsumption(input(client, protectedOperation)),
    ).resolves.toEqual({ status: 'CONSUMED', result: { ok: true } });
    expect(protectedOperation).not.toHaveBeenCalled();
  });

  it('denies divergent reuse of a consumption idempotency key', async () => {
    const client = {
      async query(sql: string) {
        await Promise.resolve();
        if (sql.includes('activate_tenant_context') || sql.includes('pg_advisory_xact_lock'))
          return { rowCount: 1, rows: [{}] };
        if (sql.includes('SELECT request_hash'))
          return {
            rowCount: 1,
            rows: [{ request_hash: 'd'.repeat(64), result: { protected_result: { ok: true } } }],
          };
        throw new Error('unexpected mutation during divergent replay');
      },
    } as unknown as pg.PoolClient;
    await expect(
      withMultiPersonAuthorizationConsumption(
        input(client, async () => {
          await Promise.resolve();
          return { ok: true };
        }),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it.each([
    ['stale version', { version: '3' }],
    ['wrong operation', { operation: 'cyberdefense.evidence.destroy' }],
    ['wrong target', { target_reference_hash: 'f'.repeat(64) }],
    ['rejected envelope', { state: 'REJECTED' }],
    ['revoked envelope', { state: 'REVOKED' }],
    ['consumed envelope replay', { state: 'CONSUMED' }],
  ] as const)('denies consumption with %s', async (_name, override) => {
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        await Promise.resolve();
        queries.push(sql);
        if (sql.includes('activate_tenant_context') || sql.includes('pg_advisory_xact_lock'))
          return { rowCount: 1, rows: [{}] };
        if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] };
        if (sql.includes('platform.materialize_mpa_expiry'))
          return { rowCount: 1, rows: [{ ...envelope, ...override }] };
        throw new Error('invalid envelope reached mutation');
      },
    } as unknown as pg.PoolClient;
    await expect(
      withMultiPersonAuthorizationConsumption(
        input(client, async () => {
          await Promise.resolve();
          return { ok: true };
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(queries.some((sql) => sql.includes('INSERT INTO platform.mpa_consumptions'))).toBe(
      false,
    );
  });

  it('returns EXPIRED without invoking the protected operation after materialization', async () => {
    const protectedOperation = vi.fn(async () => {
      await Promise.resolve();
      return { ok: true };
    });
    const client = {
      async query(sql: string) {
        await Promise.resolve();
        if (sql.includes('activate_tenant_context') || sql.includes('pg_advisory_xact_lock'))
          return { rowCount: 1, rows: [{}] };
        if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] };
        if (sql.includes('platform.materialize_mpa_expiry'))
          return {
            rowCount: 1,
            rows: [{ ...envelope, state: 'EXPIRED', version: '3' }],
          };
        throw new Error('expired envelope reached protected mutation');
      },
    } as unknown as pg.PoolClient;

    await expect(
      withMultiPersonAuthorizationConsumption(input(client, protectedOperation)),
    ).resolves.toEqual({ status: 'EXPIRED' });
    expect(protectedOperation).not.toHaveBeenCalled();
  });

  it('serializes concurrent consumption so exactly one operation succeeds', async () => {
    let current: Omit<typeof envelope, 'state'> & { state: string } = envelope;
    let lock = Promise.resolve();
    const makeClient = () => {
      let acquired = false;
      let releaseLock: (() => void) | undefined;
      return {
        async query(sql: string) {
          if (sql.includes('activate_tenant_context') || sql.includes('pg_advisory_xact_lock'))
            return { rowCount: 1, rows: [{}] };
          if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] };
          if (sql.includes('platform.materialize_mpa_expiry')) {
            const prior = lock;
            lock = new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
            await prior;
            acquired = true;
            return { rowCount: 1, rows: [current] };
          }
          if (sql.includes('INSERT INTO platform.mpa_consumptions'))
            return {
              rowCount: 1,
              rows: [{ consumption_id: '90000000-0000-4000-8000-000000000009' }],
            };
          if (sql.includes("state='CONSUMED'")) current = { ...current, state: 'CONSUMED' };
          return { rowCount: 1, rows: [] };
        },
        release() {
          if (acquired) releaseLock?.();
        },
      };
    };
    const run = async () => {
      const fake = makeClient();
      try {
        return await withMultiPersonAuthorizationConsumption(
          input(fake as unknown as pg.PoolClient, async () => {
            await Promise.resolve();
            return { ok: true };
          }),
        );
      } finally {
        fake.release();
      }
    };
    const outcomes = await Promise.allSettled([run(), run()]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
  });

  it('leaves transaction commit to the consumer and permits rollback after outbox failure', async () => {
    const statements: string[] = [];
    let committed = false;
    const client = {
      async query(sql: string) {
        await Promise.resolve();
        statements.push(sql);
        if (sql.includes('activate_tenant_context') || sql.includes('pg_advisory_xact_lock'))
          return { rowCount: 1, rows: [{}] };
        if (sql.includes('SELECT request_hash')) return { rowCount: 0, rows: [] };
        if (sql.includes('platform.materialize_mpa_expiry'))
          return { rowCount: 1, rows: [envelope] };
        if (sql.includes('INSERT INTO platform.mpa_consumptions'))
          return {
            rowCount: 1,
            rows: [{ consumption_id: '90000000-0000-4000-8000-000000000009' }],
          };
        if (sql.includes('INSERT INTO platform.domain_events'))
          throw new Error('outbox unavailable');
        return { rowCount: 1, rows: [] };
      },
    } as unknown as pg.PoolClient;
    try {
      await withMultiPersonAuthorizationConsumption(
        input(client, async () => {
          await Promise.resolve();
          return { ok: true };
        }),
      );
      committed = true;
    } catch (error) {
      expect(error).toEqual(new Error('outbox unavailable'));
    }
    expect(committed).toBe(false);
    expect(statements.some((sql) => sql.includes('INSERT INTO platform.audit_logs'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO platform.domain_events'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO platform.mpa_command_results'))).toBe(
      false,
    );
  });
});

const postgresSuite =
  process.env.DATABASE_URL && process.env.ACS_MPA_DATABASE_URL ? describe : describe.skip;

postgresSuite('PostgresMultiPersonAuthorizationRepository integration', () => {
  it('uses a server-validated membership binding without direct membership visibility', async () => {
    const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const capability = new pg.Pool({ connectionString: process.env.ACS_MPA_DATABASE_URL });
    const repository = new PostgresMultiPersonAuthorizationRepository(
      process.env.ACS_MPA_DATABASE_URL as string,
    );
    const issueContext = async (subject: string, action: string) => {
      const result = await admin.query<{ context_token: string }>(
        'SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,$3)',
        [subject, '00000000-0000-4000-8000-000000000011', action],
      );
      return result.rows[0]!.context_token;
    };
    try {
      const privilege = await capability.query<{
        current_user: string;
        command_results_select: boolean;
        memberships_select: boolean;
      }>(
        `SELECT current_user,
          has_table_privilege(current_user,'platform.mpa_command_results','SELECT') AS command_results_select,
          has_table_privilege(current_user,'platform.memberships','SELECT') AS memberships_select`,
      );
      expect(privilege.rows[0]).toMatchObject({
        current_user: 'acs_platform_mpa_login_test',
        command_results_select: true,
        memberships_select: false,
      });
      const requested = await repository.request({
        actorUserId: '10000000-0000-4000-8000-000000000011',
        actorMembershipId: '30000000-0000-4000-8000-000000000011',
        contextToken: await issueContext('oidc|alice', 'platform.mpa.request'),
        tenantId: '00000000-0000-4000-8000-000000000011',
        binding: {
          operation: 'cyberdefense.evidence.export',
          targetReferenceHash: 'a'.repeat(64),
          policyId: 'cyberdefense.evidence.export.restricted_security',
          policyVersion: '1.0.0',
        },
        idempotencyKey: randomUUID(),
        requestHash: 'b'.repeat(64),
        requestId: randomUUID(),
        correlationId: randomUUID(),
      });
      expect(requested.authorization.state).toBe('REQUESTED');

      const bobContext = await issueContext(
        '["https://issuer.acs.test","alice"]',
        'platform.mpa.approve',
      );
      const preparation = await repository.approvalPreparation({
        actorUserId: '40000000-0000-4000-8000-000000000044',
        actorMembershipId: '30000000-0000-4000-8000-000000000055',
        contextToken: bobContext,
        tenantId: '00000000-0000-4000-8000-000000000011',
        authorizationId: requested.authorization.authorizationId,
        requestId: randomUUID(),
        correlationId: randomUUID(),
      });
      expect(preparation.binding?.authorityClass).toBe('cyberdefense.evidence.export_authority');

      const approved = await repository.decide({
        actorUserId: '40000000-0000-4000-8000-000000000044',
        actorMembershipId: '30000000-0000-4000-8000-000000000055',
        contextToken: await issueContext(
          '["https://issuer.acs.test","alice"]',
          'platform.mpa.approve',
        ),
        tenantId: '00000000-0000-4000-8000-000000000011',
        authorizationId: requested.authorization.authorizationId,
        expectedVersion: 1,
        decision: 'APPROVE',
        attestationReferenceHash: 'c'.repeat(64),
        idempotencyKey: randomUUID(),
        requestHash: 'd'.repeat(64),
        requestId: randomUUID(),
        correlationId: randomUUID(),
      });
      expect(approved.authorization.state).toBe('PARTIALLY_APPROVED');
      const evidence = await admin.query<{ audit_count: string; event_count: string }>(
        `SELECT
          (SELECT count(*) FROM platform.audit_logs WHERE resource=$1)::text AS audit_count,
          (SELECT count(*) FROM platform.domain_events WHERE payload->>'authorization_id'=$2)::text AS event_count`,
        [
          `platform:mpa:${requested.authorization.authorizationId}`,
          requested.authorization.authorizationId,
        ],
      );
      expect(Number(evidence.rows[0]!.audit_count)).toBe(2);
      expect(Number(evidence.rows[0]!.event_count)).toBe(2);

      const expiringAuthorizationId = randomUUID();
      await admin.query(
        `INSERT INTO platform.mpa_authorization_envelopes(
          authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,
          target_reference_hash,policy_id,policy_version,state,approval_count,
          required_approval_count,version,expires_at,created_at,updated_at
        ) VALUES(
          $1,'00000000-0000-4000-8000-000000000011',
          '10000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',
          'cyberdefense.evidence.export',$2,'cyberdefense.evidence.export.standard','1.0.0',
          'APPROVED',1,1,2,clock_timestamp()-interval '1 minute',
          clock_timestamp()-interval '16 minutes',clock_timestamp()-interval '1 minute'
        )`,
        [expiringAuthorizationId, 'e'.repeat(64)],
      );
      const readExpired = async () =>
        repository.read({
          actorUserId: '10000000-0000-4000-8000-000000000011',
          contextToken: await issueContext('oidc|alice', 'platform.mpa.read'),
          tenantId: '00000000-0000-4000-8000-000000000011',
          authorizationId: expiringAuthorizationId,
          requestId: randomUUID(),
          correlationId: randomUUID(),
        });
      const concurrentExpiry = await Promise.all([readExpired(), readExpired()]);
      expect(concurrentExpiry).toEqual([
        expect.objectContaining({ state: 'EXPIRED', version: 3 }),
        expect.objectContaining({ state: 'EXPIRED', version: 3 }),
      ]);
      const expiryEvidence = await admin.query<{
        audit_count: string;
        event_count: string;
        consumption_count: string;
      }>(
        `SELECT
          (SELECT count(*) FROM platform.audit_logs
            WHERE resource=$1 AND action='platform.mpa.expire')::text AS audit_count,
          (SELECT count(*) FROM platform.domain_events
            WHERE event_type='authorization.approval.expired'
              AND payload->>'authorization_id'=$2)::text AS event_count,
          (SELECT count(*) FROM platform.mpa_consumptions
            WHERE authorization_id=$3)::text AS consumption_count`,
        [
          `platform:mpa:${expiringAuthorizationId}`,
          expiringAuthorizationId,
          expiringAuthorizationId,
        ],
      );
      expect(expiryEvidence.rows[0]).toMatchObject({
        audit_count: '1',
        event_count: '1',
        consumption_count: '0',
      });

      const consumer = await capability.connect();
      const protectedOperation = vi.fn(async () => {
        await Promise.resolve();
        return { ok: true };
      });
      try {
        await consumer.query('BEGIN');
        const expiredConsumption = await withMultiPersonAuthorizationConsumption({
          ...input(consumer, protectedOperation),
          contextToken: await issueContext('oidc|alice', 'platform.mpa.consume'),
          actorUserId: '10000000-0000-4000-8000-000000000011',
          tenantId: '00000000-0000-4000-8000-000000000011',
          authorizationId: expiringAuthorizationId,
          expectedVersion: 3,
          targetReferenceHash: 'e'.repeat(64),
          policyId: 'cyberdefense.evidence.export.standard',
        });
        expect(expiredConsumption.status).toBe('EXPIRED');
        await consumer.query('COMMIT');
      } catch (error) {
        await consumer.query('ROLLBACK');
        throw error;
      } finally {
        consumer.release();
      }
      expect(protectedOperation).not.toHaveBeenCalled();
    } finally {
      await Promise.all([capability.end(), repository.close(), admin.end()]);
    }
  });
});
