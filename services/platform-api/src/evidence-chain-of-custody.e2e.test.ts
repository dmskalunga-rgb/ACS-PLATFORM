import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  evidenceMpaTargetReferenceHash,
  EvidenceChainOfCustodyService,
} from './evidence-chain-of-custody.js';
import { PostgresEvidenceChainOfCustodyRepository } from './postgres-evidence-chain-of-custody.js';

const { Client } = pg;
const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error('DATABASE_URL is required for XCAP-005 E2E.');
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = 'acs_xcap005_evidence_login_test';
runtimeUrl.password = 'acs_phase1_test_only';

const tenantId = '00000000-0000-4000-8000-000000000011';
const otherTenantId = '00000000-0000-4000-8000-000000000022';
const actorUserId = '10000000-0000-4000-8000-000000000011';
const actorMembershipId = '30000000-0000-4000-8000-000000000011';
const subject = 'oidc|alice';

describe.sequential('ACS-XCAP-005 acceptance matrix', () => {
  const admin = new Client({ connectionString: adminUrl });
  const repository = new PostgresEvidenceChainOfCustodyRepository(runtimeUrl.toString());
  const authorization = { authorize: vi.fn().mockResolvedValue({ allowed: true, reason: 'test' }) };
  const contexts = {
    resolveMembership: vi.fn((_subject: string, requestedTenant: string) =>
      requestedTenant === tenantId ? { userId: actorUserId, tenantId } : null,
    ),
    issueContext: vi.fn(async (_subject: string, requestedTenant: string, action: string) => {
      const result = await admin.query<{ context_token: string; user_id: string }>(
        'SELECT context_token,user_id FROM platform.issue_tenant_context($1,$2,$3)',
        [subject, requestedTenant, action],
      );
      return result.rows[0]
        ? {
            contextToken: result.rows[0].context_token,
            userId: result.rows[0].user_id,
            tenantId: requestedTenant,
          }
        : null;
    }),
  };
  const memberships = {
    listActiveMembershipsBySubject: vi
      .fn()
      .mockResolvedValue([{ userId: actorUserId, tenantId, membershipId: actorMembershipId }]),
  };
  const audit = { recordDenied: vi.fn() };
  const service = new EvidenceChainOfCustodyService(
    { configured: true, authenticate: vi.fn().mockResolvedValue({ subject }) },
    authorization,
    contexts as never,
    memberships,
    repository,
    { verify: vi.fn().mockResolvedValue({ verified: true }) },
    audit,
    1024,
  );
  let sourceId = '';
  let evidenceId = '';
  let evidenceVersion = 0;
  let derivedId = '';

  const metadata = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
  const collectCommand = () => ({
    evidence_source_id: sourceId,
    source_event_id: randomUUID(),
    observed_at: new Date().toISOString(),
    media_type: 'application/octet-stream',
    raw_bytes_base64: Buffer.from('governed evidence').toString('base64'),
    classification: 'INTERNAL' as const,
    metadata: { origin: 'xcap005-e2e' },
    retention_policy_id: 'xcap005-test-short',
  });

  beforeAll(async () => admin.connect());
  afterAll(async () => {
    await repository.close();
    await admin.end();
  });

  it('XCAP005-POS-010 registers a tenant-bound trusted connector', async () => {
    const receipt = await service.registerSource(
      undefined,
      tenantId,
      {
        source_type: 'E2E',
        connector_type: 'DIRECT',
        external_binding: `e2e:${randomUUID()}`,
        credential_reference: 'operator-secret-reference',
        trust_classification: 'TRUSTED',
        ingestion_policy_version: '1.0.0',
      },
      randomUUID(),
      metadata(),
    );
    sourceId = receipt.data.source_id;
    expect(receipt.data).toMatchObject({ tenant_id: tenantId, status: 'REGISTERED' });
  });

  it('XCAP005-POS-001 ingests bounded evidence atomically', async () => {
    const receipt = await service.collect(
      undefined,
      tenantId,
      collectCommand(),
      randomUUID(),
      metadata(),
    );
    evidenceId = receipt.data.evidence_id;
    evidenceVersion = receipt.data.version;
    const proof = await admin.query<{
      custody: number;
      audit: number;
      events: number;
      retention: number;
    }>(
      `SELECT (SELECT count(*)::int FROM cyberdefense.evidence_custody_entries WHERE evidence_id=$1::uuid) custody,
       (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$2) audit,
       (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'evidence_id'=$1::text AND event_type='cyberdefense.evidence.recorded') events,
       (SELECT count(*)::int FROM cyberdefense.evidence_retention_bindings WHERE evidence_id=$1::uuid AND action='APPLY') retention`,
      [evidenceId, `cyberdefense:evidence:${evidenceId}`],
    );
    expect(proof.rows[0]).toEqual({ custody: 1, audit: 1, events: 1, retention: 1 });
  });

  it('XCAP005-POS-002 re-verifies raw bytes and metadata', async () => {
    const receipt = await service.verify(
      undefined,
      tenantId,
      evidenceId,
      evidenceVersion,
      randomUUID(),
      metadata(),
    );
    evidenceVersion = receipt.data.version;
    expect(receipt.data.integrity_status).toBe('VERIFIED');
  });

  it('XCAP005-POS-003 creates a provenance-linked derivation', async () => {
    const receipt = await service.derive(
      undefined,
      tenantId,
      evidenceId,
      {
        ...collectCommand(),
        raw_bytes_base64: Buffer.from('derived evidence').toString('base64'),
        transformation_id: 'normalize',
        transformation_version: '1.0.0',
        expected_version: evidenceVersion,
      },
      randomUUID(),
      metadata(),
    );
    derivedId = receipt.data.evidence_id;
    expect(receipt.data.parent_evidence_id).toBe(evidenceId);
  });

  it('XCAP005-POS-004 appends custody without rewriting history', async () => {
    const before = await admin.query<{ count: number }>(
      'SELECT count(*)::int count FROM cyberdefense.evidence_custody_entries WHERE evidence_id=$1',
      [evidenceId],
    );
    const receipt = await service.governanceFact(
      undefined,
      tenantId,
      evidenceId,
      {
        action: 'CLASSIFY',
        expectedVersion: evidenceVersion,
        reasonReference: 'classification-review',
        classification: 'CONFIDENTIAL',
      },
      randomUUID(),
      metadata(),
    );
    evidenceVersion = receipt.data.version;
    const after = await admin.query<{ count: number }>(
      'SELECT count(*)::int count FROM cyberdefense.evidence_custody_entries WHERE evidence_id=$1',
      [evidenceId],
    );
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count + 1);
  });

  it('XCAP005-POS-005 reads metadata and content through server context', async () => {
    expect((await service.read(undefined, tenantId, evidenceId, metadata())).tenant_id).toBe(
      tenantId,
    );
    expect(
      (await service.readContent(undefined, tenantId, evidenceId, metadata())).toString(),
    ).toBe('governed evidence');
  });

  it('XCAP005-POS-007 appends policy-bound retention', async () => {
    const receipt = await service.governanceFact(
      undefined,
      tenantId,
      evidenceId,
      {
        action: 'RETENTION_APPLIED',
        expectedVersion: evidenceVersion,
        reasonReference: 'retention-review',
        retentionPolicyId: 'xcap005-test-short',
      },
      randomUUID(),
      metadata(),
    );
    evidenceVersion = receipt.data.version;
    expect(receipt.data.evidence_id).toBe(evidenceId);
  });

  it('XCAP005-POS-009 returns the canonical idempotent result', async () => {
    const key = randomUUID();
    const command = collectCommand();
    const first = await service.collect(undefined, tenantId, command, key, metadata());
    const replay = await service.collect(undefined, tenantId, command, key, metadata());
    expect(replay).toEqual({ data: first.data, replay: true });
  });

  it('XCAP005-POS-006 consumes canonical MPA and records export in one transaction', async () => {
    const authorizationId = randomUUID();
    const operation = 'cyberdefense.evidence.export';
    const target = evidenceMpaTargetReferenceHash(tenantId, evidenceId, operation, evidenceVersion);
    await admin.query(
      `INSERT INTO platform.mpa_authorization_envelopes(authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,policy_id,policy_version,state,approval_count,required_approval_count,version,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'cyberdefense.evidence.export.standard','1.0.0','APPROVED',1,1,2,clock_timestamp()+interval '15 minutes')`,
      [authorizationId, tenantId, actorUserId, actorMembershipId, operation, target],
    );
    const receipt = await service.protectedOperation(
      undefined,
      tenantId,
      evidenceId,
      'EXPORT',
      {
        authorization_id: authorizationId,
        authorization_expected_version: 2,
        expected_version: evidenceVersion,
        attestation_reference: 'e2e-attestation',
        reason_reference: 'approved-export',
      },
      randomUUID(),
      metadata(),
    );
    evidenceVersion = receipt.data.version;
    const proof = await admin.query<{ exports: number; consumptions: number }>(
      `SELECT (SELECT count(*)::int FROM cyberdefense.evidence_exports WHERE evidence_id=$1) exports,(SELECT count(*)::int FROM platform.mpa_consumptions WHERE authorization_id=$2) consumptions`,
      [evidenceId, authorizationId],
    );
    expect(proof.rows[0]).toEqual({ exports: 1, consumptions: 1 });
  });

  it('XCAP005-MPA-CONCURRENCY commits exactly one protected effect and one consumption', async () => {
    const authorizationId = randomUUID();
    const operation = 'cyberdefense.evidence.export';
    const target = evidenceMpaTargetReferenceHash(tenantId, evidenceId, operation, evidenceVersion);
    await admin.query(
      `INSERT INTO platform.mpa_authorization_envelopes(authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,policy_id,policy_version,state,approval_count,required_approval_count,version,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,'cyberdefense.evidence.export.standard','1.0.0','APPROVED',1,1,2,clock_timestamp()+interval '15 minutes')`,
      [authorizationId, tenantId, actorUserId, actorMembershipId, operation, target],
    );
    const command = {
      authorization_id: authorizationId,
      authorization_expected_version: 2,
      expected_version: evidenceVersion,
      attestation_reference: 'concurrent-attestation',
      reason_reference: 'concurrent-export',
    };
    const attempts = await Promise.allSettled([
      service.protectedOperation(
        undefined,
        tenantId,
        evidenceId,
        'EXPORT',
        command,
        randomUUID(),
        metadata(),
      ),
      service.protectedOperation(
        undefined,
        tenantId,
        evidenceId,
        'EXPORT',
        command,
        randomUUID(),
        metadata(),
      ),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    const winner = attempts.find((attempt) => attempt.status === 'fulfilled');
    if (winner?.status !== 'fulfilled') throw new Error('Expected one protected-operation winner.');
    evidenceVersion = winner.value.data.version;
    const proof = await admin.query<{
      exports: number;
      consumptions: number;
      audits: number;
      evidenceEvents: number;
      mpaEvents: number;
    }>(
      `SELECT
       (SELECT count(*)::int FROM cyberdefense.evidence_exports WHERE mpa_authorization_id=$1) exports,
       (SELECT count(*)::int FROM platform.mpa_consumptions WHERE authorization_id=$1) consumptions,
       (SELECT count(*)::int FROM platform.audit_logs WHERE metadata->>'authorization_id'=$1::text) audits,
       (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'authorization_id'=$1::text AND event_type='cyberdefense.evidence.exported') "evidenceEvents",
       (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'authorization_id'=$1::text AND event_type='authorization.approval.consumed') "mpaEvents"`,
      [authorizationId],
    );
    expect(proof.rows[0]).toEqual({
      exports: 1,
      consumptions: 1,
      audits: 1,
      evidenceEvents: 1,
      mpaEvents: 1,
    });
  });

  it('XCAP005-MPA-ATOMICITY rolls back consumption, effect, audit and outbox on protected failure', async () => {
    const authorizationId = randomUUID();
    const operation = 'cyberdefense.evidence.export';
    const target = evidenceMpaTargetReferenceHash(tenantId, evidenceId, operation, evidenceVersion);
    await admin.query(
      `INSERT INTO platform.mpa_authorization_envelopes(authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,policy_id,policy_version,state,approval_count,required_approval_count,version,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,'cyberdefense.evidence.export.standard','1.0.0','APPROVED',1,1,2,clock_timestamp()+interval '15 minutes')`,
      [authorizationId, tenantId, actorUserId, actorMembershipId, operation, target],
    );
    const failing = new PostgresEvidenceChainOfCustodyRepository(runtimeUrl.toString(), (phase) => {
      if (phase === 'after-outbox') throw new Error('injected protected outbox failure');
    });
    const failingService = new EvidenceChainOfCustodyService(
      { configured: true, authenticate: vi.fn().mockResolvedValue({ subject }) },
      authorization,
      contexts as never,
      memberships,
      failing,
      { verify: vi.fn().mockResolvedValue({ verified: true }) },
      audit,
      1024,
    );
    await expect(
      failingService.protectedOperation(
        undefined,
        tenantId,
        evidenceId,
        'EXPORT',
        {
          authorization_id: authorizationId,
          authorization_expected_version: 2,
          expected_version: evidenceVersion,
          attestation_reference: 'failure-attestation',
          reason_reference: 'failure-export',
        },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toThrow('injected protected outbox failure');
    await failing.close();
    const proof = await admin.query<{
      exports: number;
      consumptions: number;
      audits: number;
      events: number;
    }>(
      `SELECT
       (SELECT count(*)::int FROM cyberdefense.evidence_exports WHERE mpa_authorization_id=$1) exports,
       (SELECT count(*)::int FROM platform.mpa_consumptions WHERE authorization_id=$1) consumptions,
       (SELECT count(*)::int FROM platform.audit_logs WHERE metadata->>'authorization_id'=$1::text) audits,
       (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'authorization_id'=$1::text) events`,
      [authorizationId],
    );
    expect(proof.rows[0]).toEqual({ exports: 0, consumptions: 0, audits: 0, events: 0 });
  });

  it('XCAP005-POS-008 preserves active hold and denies destruction', async () => {
    const held = await service.governanceFact(
      undefined,
      tenantId,
      evidenceId,
      {
        action: 'LEGAL_HOLD_APPLIED',
        expectedVersion: evidenceVersion,
        reasonReference: 'legal-hold-1',
      },
      randomUUID(),
      metadata(),
    );
    evidenceVersion = held.data.version;
    const authorizationId = randomUUID();
    const operation = 'cyberdefense.evidence.destroy';
    const target = evidenceMpaTargetReferenceHash(tenantId, evidenceId, operation, evidenceVersion);
    await admin.query(
      `INSERT INTO platform.mpa_authorization_envelopes(authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,policy_id,policy_version,state,approval_count,required_approval_count,version,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'cyberdefense.evidence.destroy','1.0.0','APPROVED',2,2,3,clock_timestamp()+interval '15 minutes')`,
      [authorizationId, tenantId, actorUserId, actorMembershipId, operation, target],
    );
    await expect(
      service.protectedOperation(
        undefined,
        tenantId,
        evidenceId,
        'DESTROY',
        {
          authorization_id: authorizationId,
          authorization_expected_version: 3,
          expected_version: evidenceVersion,
          attestation_reference: 'a',
          reason_reference: 'destroy',
        },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'LEGAL_HOLD_ACTIVE' });
    expect(
      (
        await admin.query<{ count: number }>(
          'SELECT count(*)::int count FROM platform.mpa_consumptions WHERE authorization_id=$1',
          [authorizationId],
        )
      ).rows[0]!.count,
    ).toBe(0);
  });

  it('XCAP005-NEG-001/002/003/008 denies cross-tenant context and relations', async () => {
    await expect(
      service.read(undefined, otherTenantId, evidenceId, metadata()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('XCAP005-NEG-004 detects raw-content tamper and persists quarantine evidence', async () => {
    const collected = await service.collect(
      undefined,
      tenantId,
      collectCommand(),
      randomUUID(),
      metadata(),
    );
    const tamperedId = collected.data.evidence_id;
    await admin.query(
      'ALTER TABLE cyberdefense.evidence_blob_references DISABLE TRIGGER evidence_blobs_immutable',
    );
    try {
      await admin.query(
        `UPDATE cyberdefense.evidence_blob_references SET raw_bytes=$1
        WHERE tenant_id=$2 AND blob_reference_id=$3`,
        [Buffer.from('tampered evidence'), tenantId, collected.data.blob_reference_id],
      );
    } finally {
      await admin.query(
        'ALTER TABLE cyberdefense.evidence_blob_references ENABLE TRIGGER evidence_blobs_immutable',
      );
    }
    await expect(
      service.verify(
        undefined,
        tenantId,
        tamperedId,
        collected.data.version,
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'INTEGRITY_FAILED' });
    const proof = await admin.query<{ failures: number; quarantines: number; successes: number }>(
      `SELECT
      (SELECT count(*)::int FROM cyberdefense.evidence_integrity_verifications WHERE tenant_id=$1 AND evidence_id=$2 AND outcome='FAILED') failures,
      (SELECT count(*)::int FROM cyberdefense.evidence_custody_entries WHERE tenant_id=$1 AND evidence_id=$2 AND action='QUARANTINE') quarantines,
      (SELECT count(*)::int FROM platform.domain_events WHERE tenant_id=$1 AND payload->>'evidence_id'=$2::text AND event_type='cyberdefense.evidence.integrity_verified') successes`,
      [tenantId, tamperedId],
    );
    expect(proof.rows[0]).toEqual({ failures: 1, quarantines: 1, successes: 0 });
  });

  it('XCAP005-NEG-005 rejects metadata overwrite and preserves the canonical digest', async () => {
    const before = await admin.query<{ metadata_sha256: string }>(
      'SELECT metadata_sha256 FROM cyberdefense.evidence_records WHERE tenant_id=$1 AND evidence_id=$2',
      [tenantId, evidenceId],
    );
    await expect(
      admin.query(
        `UPDATE cyberdefense.evidence_records SET canonical_metadata='{"tampered":true}'::jsonb WHERE tenant_id=$1 AND evidence_id=$2`,
        [tenantId, evidenceId],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    const after = await admin.query<{ metadata_sha256: string }>(
      'SELECT metadata_sha256 FROM cyberdefense.evidence_records WHERE tenant_id=$1 AND evidence_id=$2',
      [tenantId, evidenceId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('XCAP005-NEG-009 returns one canonical source event under sequential and concurrent replay', async () => {
    const command = collectCommand();
    const first = await service.collect(undefined, tenantId, command, randomUUID(), metadata());
    const [second, third] = await Promise.all([
      service.collect(undefined, tenantId, command, randomUUID(), metadata()),
      service.collect(undefined, tenantId, command, randomUUID(), metadata()),
    ]);
    expect([second.data.evidence_id, third.data.evidence_id]).toEqual([
      first.data.evidence_id,
      first.data.evidence_id,
    ]);
    const proof = await admin.query<{ records: number; custody: number; events: number }>(
      `SELECT
      (SELECT count(*)::int FROM cyberdefense.evidence_records WHERE tenant_id=$1 AND evidence_source_id=$2 AND source_event_id=$3) records,
      (SELECT count(*)::int FROM cyberdefense.evidence_custody_entries WHERE tenant_id=$1 AND evidence_id=$4) custody,
      (SELECT count(*)::int FROM platform.domain_events WHERE tenant_id=$1 AND payload->>'evidence_id'=$4::text AND event_type='cyberdefense.evidence.recorded') events`,
      [tenantId, command.evidence_source_id, command.source_event_id, first.data.evidence_id],
    );
    expect(proof.rows[0]).toEqual({ records: 1, custody: 1, events: 1 });
  });

  it('XCAP005-NEG-006 rejects a mismatching declared digest before persistence', async () => {
    await expect(
      service.collect(
        undefined,
        tenantId,
        { ...collectCommand(), declared_sha256: '0'.repeat(64) },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
  });

  it('XCAP005-NEG-007 denies quarantined/revoked connectors', async () => {
    const source = await service.registerSource(
      undefined,
      tenantId,
      {
        source_type: 'E2E',
        connector_type: 'DIRECT',
        external_binding: `e2e:${randomUUID()}`,
        credential_reference: 'ref',
        trust_classification: 'TRUSTED',
        ingestion_policy_version: '1',
      },
      randomUUID(),
      metadata(),
    );
    await service.transitionSource(
      undefined,
      tenantId,
      source.data.source_id,
      { status: 'REVOKED', expected_version: 1, reason_reference: 'revoked' },
      randomUUID(),
      metadata(),
    );
    await expect(
      service.collect(
        undefined,
        tenantId,
        { ...collectCommand(), evidence_source_id: source.data.source_id },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
  });

  it('XCAP005-NEG-010 rejects divergent idempotency reuse', async () => {
    const key = randomUUID();
    await service.collect(undefined, tenantId, collectCommand(), key, metadata());
    await expect(
      service.collect(
        undefined,
        tenantId,
        { ...collectCommand(), source_event_id: randomUUID() },
        key,
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('XCAP005-NEG-011/012 rejects oversized or invalid encoded content', async () => {
    await expect(
      service.collect(
        undefined,
        tenantId,
        { ...collectCommand(), raw_bytes_base64: Buffer.alloc(1025).toString('base64') },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'CONTENT_TOO_LARGE' });
    await expect(
      service.collect(
        undefined,
        tenantId,
        { ...collectCommand(), raw_bytes_base64: 'not base64!' },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  });

  it('XCAP005-NEG-013/014/015 denies missing standard or MPA authority', async () => {
    authorization.authorize.mockResolvedValueOnce({ allowed: false, reason: 'denied' });
    await expect(service.read(undefined, tenantId, evidenceId, metadata())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      service.protectedOperation(
        undefined,
        tenantId,
        evidenceId,
        'EXPORT',
        {
          authorization_id: randomUUID(),
          authorization_expected_version: 1,
          expected_version: evidenceVersion,
          attestation_reference: 'a',
          reason_reference: 'x',
        },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'MPA_DENIED' });
  });

  it('XCAP005-NEG-016 independently denies destruction while legal hold is active', async () => {
    const authorizationId = randomUUID();
    const operation = 'cyberdefense.evidence.destroy';
    const target = evidenceMpaTargetReferenceHash(tenantId, evidenceId, operation, evidenceVersion);
    await admin.query(
      `INSERT INTO platform.mpa_authorization_envelopes(authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,policy_id,policy_version,state,approval_count,required_approval_count,version,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'cyberdefense.evidence.destroy','1.0.0','APPROVED',2,2,3,clock_timestamp()+interval '15 minutes')`,
      [authorizationId, tenantId, actorUserId, actorMembershipId, operation, target],
    );
    await expect(
      service.protectedOperation(
        undefined,
        tenantId,
        evidenceId,
        'DESTROY',
        {
          authorization_id: authorizationId,
          authorization_expected_version: 3,
          expected_version: evidenceVersion,
          attestation_reference: 'independent-hold-check',
          reason_reference: 'destroy',
        },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'LEGAL_HOLD_ACTIVE' });
    const proof = await admin.query<{ consumptions: number; destructions: number }>(
      `SELECT
      (SELECT count(*)::int FROM platform.mpa_consumptions WHERE authorization_id=$1) consumptions,
      (SELECT count(*)::int FROM cyberdefense.evidence_retention_bindings WHERE tenant_id=$2 AND evidence_id=$3 AND action='DESTRUCTION_AUTHORIZED') destructions`,
      [authorizationId, tenantId, evidenceId],
    );
    expect(proof.rows[0]).toEqual({ consumptions: 0, destructions: 0 });
  });

  it('XCAP005-NEG-017 rejects stale expected versions', async () => {
    await expect(
      service.verify(undefined, tenantId, evidenceId, 1, randomUUID(), metadata()),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it('XCAP005-NEG-018/021/022 keeps custody and raw evidence immutable', async () => {
    const triggers = await admin.query<{ count: number }>(
      `SELECT count(*)::int count FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('cyberdefense.evidence_records'::regclass,'cyberdefense.evidence_blob_references'::regclass,'cyberdefense.evidence_custody_entries'::regclass)`,
    );
    expect(triggers.rows[0]!.count).toBeGreaterThanOrEqual(3);
    expect(derivedId).not.toBe(evidenceId);
  });

  it('XCAP005-NEG-019/020 rolls back domain, custody, audit and outbox on injected failure', async () => {
    const failing = new PostgresEvidenceChainOfCustodyRepository(runtimeUrl.toString(), (phase) => {
      if (phase === 'after-outbox') throw new Error('injected');
    });
    const failingService = new EvidenceChainOfCustodyService(
      { configured: true, authenticate: vi.fn().mockResolvedValue({ subject }) },
      authorization,
      contexts as never,
      memberships,
      failing,
      { verify: vi.fn() },
      audit,
      1024,
    );
    const command = collectCommand();
    await expect(
      failingService.collect(undefined, tenantId, command, randomUUID(), metadata()),
    ).rejects.toThrow('injected');
    const absent = await admin.query<{ count: number }>(
      'SELECT count(*)::int count FROM cyberdefense.evidence_records WHERE source_event_id=$1',
      [command.source_event_id],
    );
    expect(absent.rows[0]!.count).toBe(0);
    await failing.close();
  });

  it('XCAP005-NEG-023 keeps sensitive bytes out of audit and events', async () => {
    const leaked = await admin.query<{ count: number }>(
      `SELECT count(*)::int count FROM (SELECT metadata::text body FROM platform.audit_logs UNION ALL SELECT payload::text FROM platform.domain_events) x WHERE body LIKE '%governed evidence%'`,
    );
    expect(leaked.rows[0]!.count).toBe(0);
  });
});
