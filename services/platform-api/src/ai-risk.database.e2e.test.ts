import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAiRiskRepository } from './postgres-ai-risk.js';

const adminUrl = process.env.DATABASE_URL;
const issuerUrl = process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL;
const riskUrl = process.env.ACS_AIGOV_M0B_DATABASE_URL;
if (!adminUrl || !issuerUrl || !riskUrl)
  throw new Error('Disposable AIGOV M0B database qualification URLs are required.');

const tenantId = '00000000-0000-4000-8000-000000000011';
const otherTenantId = '00000000-0000-4000-8000-000000000022';
const userId = '10000000-0000-4000-8000-000000000011';
const membershipId = '30000000-0000-4000-8000-000000000011';
const evidenceId = 'e3000000-0000-4000-8000-000000000011';
let admin: pg.Client;
let issuer: pg.Client;
let repository: PostgresAiRiskRepository;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: adminUrl });
  issuer = new pg.Client({ connectionString: issuerUrl });
  repository = new PostgresAiRiskRepository(riskUrl);
  await Promise.all([admin.connect(), issuer.connect()]);
});

afterAll(async () => {
  await repository.close();
  await Promise.all([admin.end(), issuer.end()]);
});

async function context(action: string, tenant = tenantId) {
  const issued = await issuer.query<{ context_token: string }>(
    'SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,$3)',
    [tenant === tenantId ? 'oidc|alice' : 'oidc|charlie', tenant, action],
  );
  const contextToken = issued.rows[0]?.context_token;
  if (!contextToken) throw new Error(`Canonical context unavailable for ${action}`);
  return {
    tenantId: tenant,
    userId: tenant === tenantId ? userId : '30000000-0000-4000-8000-000000000033',
    membershipId: tenant === tenantId ? membershipId : '30000000-0000-4000-8000-000000000044',
    contextToken,
    requestId: randomUUID(),
    correlationId: randomUUID(),
  };
}

const riskCommand = () => ({
  risk_code: `AIR-${randomUUID().slice(0, 8).toUpperCase()}`,
  title: 'Governed AI risk',
  description: 'Real database qualification',
  primary_category: 'AIR-T01' as const,
  owner_user_id: userId,
  inventory: { kind: 'MODEL' as const, id: 'a1100000-0000-4000-8000-000000000011' },
  evidence_reference: evidenceId,
});

describe.sequential('AIGOV M0B real PostgreSQL qualification', () => {
  let riskId: string;
  let version = 1;
  let assessmentId: string;
  let firstTenantIdempotencyKey: string;

  it('creates, replays and records atomic audit/outbox without M0A command access', async () => {
    const key = randomUUID();
    firstTenantIdempotencyKey = key;
    const input = {
      ...(await context('aigov.risk.create')),
      command: riskCommand(),
      riskId: randomUUID(),
      idempotencyKey: key,
      requestHash: 'a'.repeat(64),
    };
    const created = await repository.create(input);
    riskId = created.data.risk_id;
    expect(created).toMatchObject({ replay: false, data: { status: 'IDENTIFIED', version: 1 } });
    expect(await repository.create({ ...input, ...(await context('aigov.risk.create')) })).toEqual({
      data: created.data,
      replay: true,
    });
    await expect(
      repository.create({
        ...input,
        ...(await context('aigov.risk.create')),
        requestHash: 'b'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const counts = await admin.query<{ audits: number; events: number; commands: number }>(
      `SELECT (SELECT count(*)::int FROM platform.audit_logs
        WHERE resource=$1) audits,
        (SELECT count(*)::int FROM platform.domain_events
        WHERE payload->>'risk_id'=$2) events,
        (SELECT count(*)::int FROM ai_governance.risk_command_results
        WHERE idempotency_key=$3) commands`,
      [`aigov:risk:${riskId}`, riskId, key],
    );
    expect(counts.rows[0]).toEqual({ audits: 1, events: 1, commands: 1 });
  });

  it('does not disclose internal idempotency results to a risk-read context', async () => {
    const reader = new pg.Client({ connectionString: riskUrl });
    await reader.connect();
    try {
      const actor = await context('aigov.risk.read');
      await reader.query('BEGIN');
      await reader.query('SELECT platform.activate_tenant_context($1::uuid,$2)', [
        actor.contextToken,
        'aigov.risk.read',
      ]);
      const results = await reader.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM ai_governance.risk_command_results',
      );
      expect(results.rows[0]?.count).toBe(0);
    } finally {
      await reader.query('ROLLBACK');
      await reader.end();
    }
  });

  it('scopes an identical idempotency key independently to another tenant', async () => {
    const foreign = await repository.create({
      ...(await context('aigov.risk.create', otherTenantId)),
      command: {
        ...riskCommand(),
        owner_user_id: '30000000-0000-4000-8000-000000000033',
        inventory: null,
        evidence_reference: 'e3000000-0000-4000-8000-000000000022',
      },
      riskId: randomUUID(),
      idempotencyKey: firstTenantIdempotencyKey,
      requestHash: '9'.repeat(64),
    });
    expect(foreign.replay).toBe(false);
    expect(foreign.data.risk_id).not.toBe(riskId);
    expect(
      await repository.read({
        ...(await context('aigov.risk.read')),
        riskId: foreign.data.risk_id,
      }),
    ).toBeNull();
  });

  it('rejects cross-tenant reads and substituted evidence references', async () => {
    expect(
      await repository.read({ ...(await context('aigov.risk.read', otherTenantId)), riskId }),
    ).toBeNull();
    await expect(
      repository.create({
        ...(await context('aigov.risk.create')),
        riskId: randomUUID(),
        command: { ...riskCommand(), evidence_reference: 'e3000000-0000-4000-8000-000000000022' },
        idempotencyKey: randomUUID(),
        requestHash: 'c'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('calculates documented scores without operational rating bands and preserves history', async () => {
    const assessed = await repository.assess({
      ...(await context('aigov.risk.assess')),
      riskId,
      eventId: randomUUID(),
      idempotencyKey: randomUUID(),
      requestHash: 'd'.repeat(64),
      command: {
        expected_version: version,
        likelihood: 2,
        impact: 3,
        exposure: 4,
        detectability: 3,
        autonomy: 2,
        blast_radius: 1,
        control_strength: 0.5,
        previous_assessment_id: null,
        reason_reference: 'reason:initial',
        trigger_reference: 'trigger:initial',
        evidence_reference: evidenceId,
      },
    });
    assessmentId = assessed.data.event_id;
    version = assessed.data.risk_version;
    expect(assessed.data).toMatchObject({
      inherent_score: 15,
      residual_score: 7.5,
      scoring_formula_reference: 'ACS-AI-GOV-001:v1.0:formula',
    });
    const row = await admin.query<{ previous_assessment_id: string | null }>(
      'SELECT * FROM ai_governance.risk_assessments WHERE assessment_id=$1',
      [assessmentId],
    );
    expect(row.rows[0]).not.toHaveProperty('rating_band');
    expect(row.rows[0]?.previous_assessment_id).toBeNull();
  });

  it('allows only one competing optimistic update', async () => {
    const command = {
      expected_version: version,
      title: 'Concurrent update',
      description: 'One writer must win',
      reason_reference: 'reason:concurrency',
      evidence_reference: evidenceId,
    };
    const attempts = await Promise.allSettled(
      [1, 2].map(async (index) =>
        repository.update({
          ...(await context('aigov.risk.update')),
          riskId,
          command,
          idempotencyKey: randomUUID(),
          requestHash: String(index).repeat(64),
        }),
      ),
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(
      (attempts.find((attempt) => attempt.status === 'rejected') as PromiseRejectedResult).reason,
    ).toMatchObject({ code: 'STALE_VERSION' });
    version += 1;
  });

  it('records proposed treatment, residual review and reassessment trigger', async () => {
    const treated = await repository.treat({
      ...(await context('aigov.risk.treat')),
      riskId,
      eventId: randomUUID(),
      idempotencyKey: randomUUID(),
      requestHash: 'e'.repeat(64),
      command: {
        expected_version: version,
        treatment_type: 'ACCEPT',
        rationale_reference: 'rationale:proposal-only',
        planned_actions_reference: 'actions:none',
        evidence_reference: evidenceId,
      },
    });
    version = treated.data.risk_version;
    const proposed = await admin.query<{ status: string }>(
      'SELECT status FROM ai_governance.risk_treatments WHERE treatment_id=$1',
      [treated.data.event_id],
    );
    expect(proposed.rows[0]?.status).toBe('PROPOSED');
    const reviewed = await repository.review({
      ...(await context('aigov.risk.review')),
      riskId,
      eventId: randomUUID(),
      idempotencyKey: randomUUID(),
      requestHash: 'f'.repeat(64),
      command: {
        expected_version: version,
        assessment_id: assessmentId,
        reason_reference: 'reason:review',
        evidence_reference: evidenceId,
      },
    });
    version = reviewed.data.risk_version;
    const monitored = await repository.monitor({
      ...(await context('aigov.risk.monitor')),
      riskId,
      eventId: randomUUID(),
      idempotencyKey: randomUUID(),
      requestHash: '1'.repeat(64),
      command: {
        expected_version: version,
        trigger_kind: 'NEW_EVIDENCE',
        reassessment_required: true,
        reason_reference: 'reason:new-evidence',
        evidence_reference: evidenceId,
      },
    });
    version = monitored.data.risk_version;
    expect(await repository.read({ ...(await context('aigov.risk.read')), riskId })).toMatchObject({
      status: 'REASSESSMENT_REQUIRED',
      version,
    });
  });

  it('reassesses with exact decimal half-up rounding and an immutable predecessor', async () => {
    const reassessed = await repository.assess({
      ...(await context('aigov.risk.assess')),
      riskId,
      eventId: randomUUID(),
      idempotencyKey: randomUUID(),
      requestHash: '3'.repeat(64),
      command: {
        expected_version: version,
        likelihood: 1,
        impact: 1,
        exposure: 1,
        detectability: 1,
        autonomy: 1,
        blast_radius: 1,
        control_strength: 0.425,
        previous_assessment_id: assessmentId,
        reason_reference: 'reason:reassessment',
        trigger_reference: 'trigger:new-evidence',
        evidence_reference: evidenceId,
      },
    });
    expect(reassessed.data).toMatchObject({ inherent_score: 1, residual_score: 0.58 });
    const history = await admin.query<{
      previous_assessment_id: string | null;
      residual_score: string;
    }>(
      `SELECT previous_assessment_id,residual_score::text FROM ai_governance.risk_assessments
       WHERE assessment_id=$1`,
      [reassessed.data.event_id],
    );
    expect(history.rows[0]).toEqual({
      previous_assessment_id: assessmentId,
      residual_score: '0.58',
    });
    version = reassessed.data.risk_version;
  });

  it('rolls back risk, audit and outbox together on injected failure', async () => {
    const broken = new PostgresAiRiskRepository(riskUrl, (phase) => {
      if (phase === 'after-audit') throw new Error('test-only injected audit boundary failure');
    });
    const candidate = randomUUID();
    try {
      await expect(
        broken.create({
          ...(await context('aigov.risk.create')),
          riskId: candidate,
          command: riskCommand(),
          idempotencyKey: randomUUID(),
          requestHash: '2'.repeat(64),
        }),
      ).rejects.toThrow('test-only injected');
      const counts = await admin.query<{ risks: number; audits: number; events: number }>(
        `SELECT (SELECT count(*)::int FROM ai_governance.risks WHERE risk_id=$1) risks,
          (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$2) audits,
          (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'risk_id'=$3) events`,
        [candidate, `aigov:risk:${candidate}`, candidate],
      );
      expect(counts.rows[0]).toEqual({ risks: 0, audits: 0, events: 0 });
    } finally {
      await broken.close();
    }
  });
});
