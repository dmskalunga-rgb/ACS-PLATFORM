import { randomUUID } from 'node:crypto';
import type { FusionResult } from '@acs/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CognitiveFusionFailure,
  type FusionReceiptRepository,
} from './cognitive-cyber-fusion-m0.js';
import { PostgresCognitiveCyberFusionM0Repository } from './postgres-cognitive-cyber-fusion-m0.js';

const { Client } = pg;
const adminUrl = process.env.DATABASE_URL;
const issuerUrl = process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL;
const fusionUrl = process.env.ACS_XCAP011_DATABASE_URL;

if (!adminUrl || !issuerUrl || !fusionUrl)
  throw new Error('Disposable XCAP-011 database qualification URLs are required.');

const tenantA = '00000000-0000-4000-8000-000000000011';
const tenantB = '00000000-0000-4000-8000-000000000022';
const alice = '10000000-0000-4000-8000-000000000011';
const charlie = '30000000-0000-4000-8000-000000000033';
const result = {
  status: 'COMPLETED',
  failure_code: null,
  classification: 'INTERNAL',
  assertions: [{}],
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
  assertions: [],
} as unknown as FusionResult;

let admin: pg.Client;
let issuer: pg.Client;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  issuer = new Client({ connectionString: issuerUrl });
  await Promise.all([admin.connect(), issuer.connect()]);
});

afterAll(async () => Promise.all([admin.end(), issuer.end()]));

async function context(subject: string, tenantId: string) {
  const issued = await issuer.query<{ context_token: string }>(
    `SELECT context_token
     FROM platform.issue_tenant_context($1,$2::uuid,'cyberdefense.fusion.request')`,
    [subject, tenantId],
  );
  const token = issued.rows[0]?.context_token;
  if (!token) throw new Error('Canonical Platform Context was not issued.');
  return token;
}

function input(
  tenantId: string,
  actorUserId: string,
  contextToken: string,
  idempotencyKey: string,
  requestHash: string,
  produce: Parameters<FusionReceiptRepository['execute']>[0]['produce'],
) {
  return {
    tenantId,
    contextToken,
    actorUserId,
    idempotencyKey,
    requestHash,
    fusionRequestId: randomUUID(),
    fusionResultId: randomUUID(),
    reasoningMode: 'REFERENCE_VALIDATION' as const,
    reasoningPurpose: 'EVIDENCE_REFERENCE_VALIDATION' as const,
    evidenceReferenceCount: 1,
    contextSnapshotPresent: false,
    requestId: randomUUID(),
    correlationId: randomUUID(),
    expiresAt: new Date(Date.now() + 300_000),
    produce,
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe.sequential('ACS-XCAP-011 M0 real PostgreSQL database-backed acceptance', () => {
  it('FI-008 atomically persists refusal receipt, denied audit and failed event without completion', async () => {
    const repository = new PostgresCognitiveCyberFusionM0Repository(fusionUrl);
    const key = randomUUID();
    const request = input(
      tenantA,
      alice,
      await context('oidc|alice', tenantA),
      key,
      '8'.repeat(64),
      () => Promise.resolve(refusedResult),
    );
    const outcome = await repository.execute(request);
    expect(outcome).toMatchObject({ replay: false, result: { status: 'REFUSED' } });

    const receipt = await admin.query<{ status: string; result_hash: string | null }>(
      `SELECT status,result_hash
       FROM cyberdefense.fusion_command_receipts
       WHERE tenant_id=$1 AND idempotency_key=$2`,
      [tenantA, key],
    );
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]?.status).toBe('COMPLETED');
    expect(receipt.rows[0]?.result_hash).toMatch(/^[0-9a-f]{64}$/u);
    const audit = await admin.query<{ outcome: string; failure_code: string | null }>(
      `SELECT outcome,metadata->>'failure_code' failure_code
       FROM platform.audit_logs
       WHERE tenant_id=$1 AND action='cyberdefense.fusion.request'
         AND metadata->>'fusion_request_id'=$2`,
      [tenantA, request.fusionRequestId],
    );
    expect(audit.rows).toEqual([{ outcome: 'DENIED', failure_code: 'INSUFFICIENT_CONFIDENCE' }]);
    const events = await admin.query<{ event_type: string; failure_code: string | null }>(
      `SELECT event_type,payload->>'failure_code' failure_code
       FROM platform.domain_events
       WHERE tenant_id=$1 AND causation_id=$2
       ORDER BY event_type`,
      [tenantA, key],
    );
    expect(events.rows).toEqual([
      {
        event_type: 'cyberdefense.fusion.failed',
        failure_code: 'INSUFFICIENT_CONFIDENCE',
      },
      { event_type: 'cyberdefense.fusion.requested', failure_code: null },
    ]);
    expect(
      events.rows.some(({ event_type }) => event_type === 'cyberdefense.fusion.completed'),
    ).toBe(false);
    await repository.close();
  });

  it('CONC-001 serializes exact concurrent replay to one canonical receipt', async () => {
    const repository = new PostgresCognitiveCyberFusionM0Repository(fusionUrl);
    const key = randomUUID();
    const entered = deferred();
    const release = deferred();
    const first = repository.execute(
      input(tenantA, alice, await context('oidc|alice', tenantA), key, 'a'.repeat(64), async () => {
        entered.release();
        await release.promise;
        return result;
      }),
    );
    await entered.promise;
    const second = repository.execute(
      input(tenantA, alice, await context('oidc|alice', tenantA), key, 'a'.repeat(64), () =>
        Promise.resolve(result),
      ),
    );
    release.release();
    const outcomes = await Promise.all([first, second]);
    expect(outcomes.map(({ replay }) => replay).sort()).toEqual([false, true]);
    const receipt = await admin.query<{ count: number }>(
      'SELECT count(*)::integer count FROM cyberdefense.fusion_command_receipts WHERE tenant_id=$1 AND idempotency_key=$2',
      [tenantA, key],
    );
    expect(receipt.rows[0]?.count).toBe(1);
    await repository.close();
  });

  it('CONC-002 gives one authority and one conflict for divergent concurrent reuse', async () => {
    const repository = new PostgresCognitiveCyberFusionM0Repository(fusionUrl);
    const key = randomUUID();
    const entered = deferred();
    const release = deferred();
    const first = repository.execute(
      input(tenantA, alice, await context('oidc|alice', tenantA), key, 'b'.repeat(64), async () => {
        entered.release();
        await release.promise;
        return result;
      }),
    );
    await entered.promise;
    const second = repository.execute(
      input(tenantA, alice, await context('oidc|alice', tenantA), key, 'c'.repeat(64), () =>
        Promise.resolve(result),
      ),
    );
    release.release();
    await expect(first).resolves.toMatchObject({ replay: false });
    await expect(second).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await repository.close();
  });

  it('CONC-003 permits genuinely overlapping equal keys in independent tenants', async () => {
    const repository = new PostgresCognitiveCyberFusionM0Repository(fusionUrl);
    const key = randomUUID();
    const bothEntered = deferred();
    const release = deferred();
    let entered = 0;
    const produce = async () => {
      entered += 1;
      if (entered === 2) bothEntered.release();
      await release.promise;
      return result;
    };
    const first = repository.execute(
      input(tenantA, alice, await context('oidc|alice', tenantA), key, 'd'.repeat(64), produce),
    );
    const second = repository.execute(
      input(tenantB, charlie, await context('oidc|charlie', tenantB), key, 'd'.repeat(64), produce),
    );
    await bothEntered.promise;
    release.release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ replay: false }),
      expect.objectContaining({ replay: false }),
    ]);
    const receipts = await admin.query<{ count: number }>(
      'SELECT count(*)::integer count FROM cyberdefense.fusion_command_receipts WHERE idempotency_key=$1',
      [key],
    );
    expect(receipts.rows[0]?.count).toBe(2);
    await repository.close();
  });

  it.each(['after-audit', 'after-completed-outbox'] as const)(
    'FI-012 rolls back success state, audit and outbox at %s before bounded failure persistence',
    async (failurePhase) => {
      const key = randomUUID();
      const request = input(
        tenantA,
        alice,
        await context('oidc|alice', tenantA),
        key,
        'e'.repeat(64),
        () => Promise.resolve(result),
      );
      const repository = new PostgresCognitiveCyberFusionM0Repository(fusionUrl, (phase) => {
        if (phase === failurePhase) throw new Error('test-only failure injection');
      });
      await expect(repository.execute(request)).rejects.toBeInstanceOf(CognitiveFusionFailure);
      const receipt = await admin.query<{ status: string }>(
        'SELECT status FROM cyberdefense.fusion_command_receipts WHERE tenant_id=$1 AND idempotency_key=$2',
        [tenantA, key],
      );
      expect(receipt.rows).toEqual([{ status: 'FAILED' }]);
      const allowedAudit = await admin.query<{ count: number }>(
        `SELECT count(*)::integer count FROM platform.audit_logs
         WHERE tenant_id=$1 AND action='cyberdefense.fusion.request' AND outcome='ALLOWED'
           AND metadata->>'fusion_request_id'=$2`,
        [tenantA, request.fusionRequestId],
      );
      const successEvents = await admin.query<{ count: number }>(
        `SELECT count(*)::integer count FROM platform.domain_events
         WHERE tenant_id=$1 AND causation_id=$2
           AND event_type IN ('cyberdefense.fusion.requested','cyberdefense.fusion.completed')`,
        [tenantA, key],
      );
      const failedEvents = await admin.query<{ count: number }>(
        `SELECT count(*)::integer count FROM platform.domain_events
         WHERE tenant_id=$1 AND causation_id=$2 AND event_type='cyberdefense.fusion.failed'`,
        [tenantA, key],
      );
      expect(allowedAudit.rows[0]?.count).toBe(0);
      expect(successEvents.rows[0]?.count).toBe(0);
      expect(failedEvents.rows[0]?.count).toBe(1);
      await repository.close();
    },
  );

  it('persists and deterministically replays one bounded failure', async () => {
    const repository = new PostgresCognitiveCyberFusionM0Repository(fusionUrl);
    const key = randomUUID();
    let produceCount = 0;
    const produce = () => {
      produceCount += 1;
      return Promise.reject(new CognitiveFusionFailure('REFERENCE_OWNER_UNAVAILABLE'));
    };
    await expect(
      repository.execute(
        input(tenantA, alice, await context('oidc|alice', tenantA), key, 'f'.repeat(64), produce),
      ),
    ).rejects.toMatchObject({ code: 'REFERENCE_OWNER_UNAVAILABLE' });
    await expect(
      repository.execute(
        input(tenantA, alice, await context('oidc|alice', tenantA), key, 'f'.repeat(64), produce),
      ),
    ).rejects.toMatchObject({ code: 'REFERENCE_OWNER_UNAVAILABLE' });
    expect(produceCount).toBe(1);
    await repository.close();
  });
});
