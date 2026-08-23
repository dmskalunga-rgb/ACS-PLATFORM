import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresUsageMeteringRepository } from './postgres-usage-metering.js';
import { stableHash } from './usage-metering.js';

const databaseUrl = process.env.DATABASE_URL;
const usageUrl = process.env.ACS_USAGE_METERING_DATABASE_URL;
const issuerUrl = process.env.ACS_MACHINE_CONTEXT_ISSUER_DATABASE_URL;
const enabled = Boolean(databaseUrl && usageUrl && issuerUrl);

describe.runIf(enabled)('PostgreSQL Usage/Metering machine repository', () => {
  let repository: PostgresUsageMeteringRepository;
  let admin: pg.Pool;
  let entitlementId: string;
  beforeAll(async () => {
    repository = new PostgresUsageMeteringRepository(usageUrl!, issuerUrl!);
    admin = new pg.Pool({ connectionString: databaseUrl! });
    const result = await admin.query<{ id: string }>(
      "SELECT id FROM commercial.entitlements WHERE tenant_id='00000000-0000-4000-8000-000000000011' AND status='ACTIVE' LIMIT 1",
    );
    entitlementId = result.rows[0]!.id;
  });
  afterAll(async () => {
    await Promise.all([repository.close(), admin.end()]);
  });
  const humanContext = async (action: string) => {
    const context = await admin.query<{ context_token: string; user_id: string }>(
      `SELECT context_token,user_id FROM platform.issue_tenant_context(
        '["https://issuer.acs.test","alice"]',
        '00000000-0000-4000-8000-000000000011', $1
      )`,
      [action],
    );
    return {
      action,
      actorUserId: context.rows[0]!.user_id,
      contextToken: context.rows[0]!.context_token,
      tenantId: '00000000-0000-4000-8000-000000000011',
      correlationId: randomUUID(),
      requestId: randomUUID(),
    };
  };

  it('authenticates, accepts, deduplicates and rejects divergent source events', async () => {
    const sourceEventId = `targeted-${randomUUID()}`;
    const command = {
      entitlement_id: entitlementId,
      source_event_id: sourceEventId,
      measurement_type: 'api.request',
      value: 3,
      unit: 'request',
      event_time: new Date().toISOString(),
      schema_version: 1,
    };
    const firstIdentity = await repository.authenticateSource(
      '82000000-0000-4000-8000-000000000011',
      'ACS_USAGE_TEST_ONLY_SOURCE_A',
    );
    const first = await repository.ingest(firstIdentity, command, {
      correlationId: randomUUID(),
      requestId: randomUUID(),
    });
    expect(first.replay).toBe(false);
    const replayIdentity = await repository.authenticateSource(
      '82000000-0000-4000-8000-000000000011',
      'ACS_USAGE_TEST_ONLY_SOURCE_A',
    );
    const replay = await repository.ingest(replayIdentity, command, {
      correlationId: randomUUID(),
      requestId: randomUUID(),
    });
    expect(replay.replay).toBe(true);
    const divergentIdentity = await repository.authenticateSource(
      '82000000-0000-4000-8000-000000000011',
      'ACS_USAGE_TEST_ONLY_SOURCE_A',
    );
    await expect(
      repository.ingest(
        divergentIdentity,
        { ...command, value: 4 },
        { correlationId: randomUUID(), requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_EVENT_CONFLICT' });
    const counts = await admin.query<{ raw: string; audit: string; events: string }>(
      `SELECT
        (SELECT count(*) FROM commercial.raw_measurements WHERE source_event_id=$1)::text raw,
        (SELECT count(*) FROM platform.audit_logs WHERE metadata->>'source_id'='81000000-0000-4000-8000-000000000011' AND metadata->>'measurement_id' IS NOT NULL)::text audit,
        (SELECT count(*) FROM platform.domain_events WHERE event_type='commercial.usage.measurement.accepted' AND payload->>'source_id'='81000000-0000-4000-8000-000000000011')::text events`,
      [sourceEventId],
    );
    expect(Number(counts.rows[0]!.raw)).toBe(1);
  });

  it('keeps source lifecycle, rotation and correction transactions bounded', async () => {
    const registered = await repository.registerSource({
      ...(await humanContext('commercial.usage.source.manage')),
      name: `targeted-source-${randomUUID()}`,
      descriptor: 'TEST_ONLY targeted lifecycle source',
    });
    const sourceId = registered.data.id;
    const originalCredential = registered.credential;
    const rotated = await repository.rotateCredential({
      ...(await humanContext('commercial.usage.source.manage')),
      sourceId,
    });
    await expect(
      repository.authenticateSource(
        originalCredential.credential_id,
        originalCredential.credential,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await repository.authenticateSource(
      rotated.credential.credential_id,
      rotated.credential.credential,
    );
    await repository.transitionSource({
      ...(await humanContext('commercial.usage.source.manage')),
      sourceId,
      status: 'DISABLED',
    });
    await expect(
      repository.authenticateSource(
        rotated.credential.credential_id,
        rotated.credential.credential,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await repository.transitionSource({
      ...(await humanContext('commercial.usage.source.manage')),
      sourceId,
      status: 'ACTIVE',
    });
    await repository.authenticateSource(
      rotated.credential.credential_id,
      rotated.credential.credential,
    );
    await repository.transitionSource({
      ...(await humanContext('commercial.usage.source.manage')),
      sourceId,
      status: 'REVOKED',
    });
    await expect(
      repository.transitionSource({
        ...(await humanContext('commercial.usage.source.manage')),
        sourceId,
        status: 'ACTIVE',
      }),
    ).rejects.toMatchObject({ code: 'TERMINAL_SOURCE' });

    const correctionCommand = {
      measurement_id: '83000000-0000-4000-8000-000000000011',
      reason: 'TEST_ONLY targeted correction',
      compensating_value: -1,
      unit: 'request',
      expected_version: 1,
    };
    const idempotencyKey = randomUUID();
    const first = await repository.correct({
      ...(await humanContext('commercial.usage.correct')),
      ...correctionCommand,
      idempotencyKey,
      requestHash: stableHash(correctionCommand),
    });
    expect(first.replay).toBe(false);
    const replay = await repository.correct({
      ...(await humanContext('commercial.usage.correct')),
      ...correctionCommand,
      idempotencyKey,
      requestHash: stableHash(correctionCommand),
    });
    expect(replay.replay).toBe(true);
  });
});
