import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAiInventoryRepository } from './postgres-ai-inventory.js';

const adminUrl = process.env.DATABASE_URL;
const issuerUrl = process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL;
const inventoryUrl = process.env.ACS_AIGOV_M0A_DATABASE_URL;
if (!adminUrl || !issuerUrl || !inventoryUrl)
  throw new Error('Disposable AIGOV M0A database qualification URLs are required.');

const tenantId = '00000000-0000-4000-8000-000000000011';
const otherTenantId = '00000000-0000-4000-8000-000000000022';
const userId = '10000000-0000-4000-8000-000000000011';
const membershipId = '30000000-0000-4000-8000-000000000011';
const { Client } = pg;
let admin: pg.Client;
let issuer: pg.Client;
let runtime: pg.Client;
let repository: PostgresAiInventoryRepository;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  issuer = new Client({ connectionString: issuerUrl });
  runtime = new Client({ connectionString: inventoryUrl });
  repository = new PostgresAiInventoryRepository(inventoryUrl);
  await Promise.all([admin.connect(), issuer.connect(), runtime.connect()]);
});

afterAll(async () => {
  await repository.close();
  await Promise.all([admin.end(), issuer.end(), runtime.end()]);
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

const command = {
  system_key: `aigov-${randomUUID().slice(0, 8)}`,
  name: 'Governed AI System',
  purpose: 'Inventory qualification only',
  owner_reference: 'owner:risk',
  classification: 'CONFIDENTIAL' as const,
  evidence_reference: 'e3000000-0000-4000-8000-000000000011',
};

describe.sequential('AIGOV M0A real PostgreSQL qualification', () => {
  let systemId: string;
  let systemIdempotencyKey: string;
  let modelId: string;
  let datasetId: string;
  let promptId: string;

  it('registers and replays a tenant-bound AI System with atomic audit and outbox', async () => {
    const idempotencyKey = randomUUID();
    systemIdempotencyKey = idempotencyKey;
    const input = {
      ...(await context('aigov.ai_system.create')),
      kind: 'AI_SYSTEM' as const,
      command,
      assetId: randomUUID(),
      idempotencyKey,
      requestHash: 'a'.repeat(64),
    };
    const created = await repository.createAsset(input);
    systemId = created.data.asset_id;
    expect(created).toMatchObject({ replay: false, data: { kind: 'AI_SYSTEM', version: 1 } });
    expect(
      await repository.createAsset({ ...input, ...(await context('aigov.ai_system.create')) }),
    ).toEqual({ data: created.data, replay: true });
    await expect(
      repository.createAsset({
        ...input,
        ...(await context('aigov.ai_system.create')),
        requestHash: 'b'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const records = await admin.query<{ audits: number; events: number; commands: number }>(
      `SELECT
       (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$1) audits,
       (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'target_id'=$2) events,
       (SELECT count(*)::int FROM ai_governance.command_results WHERE idempotency_key=$3) commands`,
      [`aigov:${systemId}`, systemId, idempotencyKey],
    );
    expect(records.rows[0]).toEqual({ audits: 1, events: 1, commands: 1 });
  });

  it('registers Model, Dataset and Prompt under the system', async () => {
    const assets = [
      {
        kind: 'MODEL' as const,
        action: 'aigov.model.create',
        command: {
          system_id: systemId,
          model_key: `model-${randomUUID().slice(0, 8)}`,
          name: 'Model',
          provider_reference: 'provider:governed',
          classification: 'INTERNAL' as const,
          evidence_reference: command.evidence_reference,
        },
      },
      {
        kind: 'DATASET' as const,
        action: 'aigov.dataset.create',
        command: {
          system_id: systemId,
          dataset_key: `dataset-${randomUUID().slice(0, 8)}`,
          name: 'Dataset',
          classification: 'INTERNAL' as const,
          evidence_reference: command.evidence_reference,
        },
      },
      {
        kind: 'PROMPT' as const,
        action: 'aigov.prompt.create',
        command: {
          system_id: systemId,
          prompt_key: `prompt-${randomUUID().slice(0, 8)}`,
          name: 'Prompt',
          classification: 'INTERNAL' as const,
          evidence_reference: command.evidence_reference,
        },
      },
    ];
    for (const asset of assets) {
      const created = await repository.createAsset({
        ...(await context(asset.action)),
        ...asset,
        assetId: randomUUID(),
        idempotencyKey: randomUUID(),
        requestHash: randomUUID().replaceAll('-', '').padEnd(64, 'a'),
      });
      expect(created.data.system_id).toBe(systemId);
      if (asset.kind === 'MODEL') modelId = created.data.asset_id;
      if (asset.kind === 'DATASET') datasetId = created.data.asset_id;
      if (asset.kind === 'PROMPT') promptId = created.data.asset_id;
    }
  });

  it('scopes the same idempotency key and asset key independently by tenant', async () => {
    const other = await repository.createAsset({
      ...(await context('aigov.ai_system.create', otherTenantId)),
      kind: 'AI_SYSTEM',
      assetId: randomUUID(),
      command: { ...command, evidence_reference: 'e3000000-0000-4000-8000-000000000022' },
      idempotencyKey: systemIdempotencyKey,
      requestHash: 'a'.repeat(64),
    });
    expect(other).toMatchObject({ replay: false, data: { kind: 'AI_SYSTEM' } });
    expect(other.data.asset_id).not.toBe(systemId);
    expect(
      await repository.readAsset({
        ...(await context('aigov.inventory.read')),
        kind: 'AI_SYSTEM',
        assetId: other.data.asset_id,
      }),
    ).toBeNull();
  });

  it('registers immutable Model, Dataset and Prompt versions by hash and reference', async () => {
    const versions = [
      {
        kind: 'MODEL_VERSION' as const,
        action: 'aigov.model_version.register',
        command: {
          model_id: modelId,
          version_label: '1.0.0',
          artifact_sha256: 'a'.repeat(64),
          artifact_reference: 'artifact:model',
          source_reference: 'source:governed',
          provider_reference: 'provider:governed',
          provenance_reference: command.evidence_reference,
          evidence_reference: command.evidence_reference,
        },
      },
      {
        kind: 'DATASET_VERSION' as const,
        action: 'aigov.dataset_version.register',
        command: {
          dataset_id: datasetId,
          version_label: '1.0.0',
          content_sha256: 'b'.repeat(64),
          content_reference: 'artifact:dataset',
          provenance_reference: command.evidence_reference,
          permitted_uses: ['qualification'],
          residency_policy_reference: 'policy:residency',
          retention_policy_reference: 'policy:retention',
          evidence_reference: command.evidence_reference,
        },
      },
      {
        kind: 'PROMPT_VERSION' as const,
        action: 'aigov.prompt_version.register',
        command: {
          prompt_id: promptId,
          version_label: '1.0.0',
          content_sha256: 'c'.repeat(64),
          content_reference: 'artifact:prompt',
          change_reason: 'Initial governed version',
          evidence_reference: command.evidence_reference,
        },
      },
    ];
    for (const version of versions) {
      const created = await repository.createVersion({
        ...(await context(version.action)),
        ...version,
        versionId: randomUUID(),
        idempotencyKey: randomUUID(),
        requestHash: 'c'.repeat(64),
      });
      expect(created.data).toMatchObject({ kind: version.kind, status: 'REGISTERED' });
      const table =
        version.kind === 'MODEL_VERSION'
          ? 'model_versions'
          : version.kind === 'DATASET_VERSION'
            ? 'dataset_versions'
            : 'prompt_versions';
      const idColumn =
        version.kind === 'MODEL_VERSION'
          ? 'model_version_id'
          : version.kind === 'DATASET_VERSION'
            ? 'dataset_version_id'
            : 'prompt_version_id';
      const mutation = `UPDATE ai_governance.${table} SET version_label='tampered' WHERE ${idColumn}=$1`;
      await expect(runtime.query(mutation, [created.data.version_id])).rejects.toMatchObject({
        code: '42501',
      });
      await expect(admin.query(mutation, [created.data.version_id])).rejects.toMatchObject({
        code: '55000',
      });
    }
  });

  it('maps duplicate asset and version identities to a canonical conflict', async () => {
    await expect(
      repository.createAsset({
        ...(await context('aigov.ai_system.create')),
        kind: 'AI_SYSTEM',
        command,
        assetId: randomUUID(),
        idempotencyKey: randomUUID(),
        requestHash: '4'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
    await expect(
      repository.createVersion({
        ...(await context('aigov.model_version.register')),
        kind: 'MODEL_VERSION',
        versionId: randomUUID(),
        command: {
          model_id: modelId,
          version_label: '1.0.0',
          artifact_sha256: 'd'.repeat(64),
          artifact_reference: 'artifact:model:duplicate',
          source_reference: 'source:governed',
          provider_reference: 'provider:governed',
          provenance_reference: command.evidence_reference,
          evidence_reference: command.evidence_reference,
        },
        idempotencyKey: randomUUID(),
        requestHash: '5'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
  });

  it('enforces optimistic concurrency and cross-tenant read denial', async () => {
    const update = {
      expected_version: 1,
      name: 'Governed AI System Updated',
      reason_reference: 'change:reviewed',
      evidence_reference: command.evidence_reference,
    };
    const request = {
      ...(await context('aigov.ai_system.update')),
      kind: 'AI_SYSTEM' as const,
      assetId: systemId,
      command: update,
      idempotencyKey: randomUUID(),
      requestHash: 'd'.repeat(64),
    };
    expect((await repository.updateAsset(request)).data.version).toBe(2);
    await expect(
      repository.updateAsset({
        ...request,
        ...(await context('aigov.ai_system.update')),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
    expect(
      await repository.readAsset({
        ...(await context('aigov.inventory.read', otherTenantId)),
        kind: 'AI_SYSTEM',
        assetId: systemId,
      }),
    ).toBeNull();
  });

  it('rejects cross-tenant evidence on update without changing the asset', async () => {
    await expect(
      repository.updateAsset({
        ...(await context('aigov.ai_system.update')),
        kind: 'AI_SYSTEM',
        assetId: systemId,
        command: {
          expected_version: 2,
          name: 'Must Not Persist',
          reason_reference: 'change:denied',
          evidence_reference: 'e3000000-0000-4000-8000-000000000022',
        },
        idempotencyKey: randomUUID(),
        requestHash: '9'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    expect(
      await repository.readAsset({
        ...(await context('aigov.inventory.read')),
        kind: 'AI_SYSTEM',
        assetId: systemId,
      }),
    ).toMatchObject({
      version: 2,
      name: 'Governed AI System Updated',
    });
  });

  it('allows exactly one of two concurrent expected-version mutations', async () => {
    const mutate = async (name: string) =>
      repository.updateAsset({
        ...(await context('aigov.ai_system.update')),
        kind: 'AI_SYSTEM',
        assetId: systemId,
        command: {
          expected_version: 2,
          name,
          reason_reference: 'change:concurrent',
          evidence_reference: command.evidence_reference,
        },
        idempotencyKey: randomUUID(),
        requestHash: name === 'Concurrent A' ? '1'.repeat(64) : '2'.repeat(64),
      });
    const results = await Promise.allSettled([mutate('Concurrent A'), mutate('Concurrent B')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'STALE_VERSION' } });
    expect(
      await repository.readAsset({
        ...(await context('aigov.inventory.read')),
        kind: 'AI_SYSTEM',
        assetId: systemId,
      }),
    ).toMatchObject({ version: 3 });
  });

  it('rejects missing and cross-tenant XCAP-005 evidence references', async () => {
    for (const evidenceReference of [randomUUID(), 'e3000000-0000-4000-8000-000000000022']) {
      await expect(
        repository.createAsset({
          ...(await context('aigov.ai_system.create')),
          kind: 'AI_SYSTEM',
          command: {
            ...command,
            system_key: `bad-${randomUUID().slice(0, 8)}`,
            evidence_reference: evidenceReference,
          },
          assetId: randomUUID(),
          idempotencyKey: randomUUID(),
          requestHash: 'f'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    }
  });

  it('fails closed for missing or cross-tenant context and invalid parents', async () => {
    const input = {
      ...(await context('aigov.ai_system.create')),
      kind: 'AI_SYSTEM' as const,
      command: { ...command, system_key: `deny-${randomUUID().slice(0, 8)}` },
      assetId: randomUUID(),
      idempotencyKey: randomUUID(),
      requestHash: '7'.repeat(64),
    };
    await expect(
      repository.createAsset({ ...input, contextToken: randomUUID() }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      repository.createAsset({
        ...input,
        contextToken: (await context('aigov.ai_system.create', otherTenantId)).contextToken,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      repository.createAsset({
        ...input,
        ...(await context('aigov.ai_system.create')),
        userId: '30000000-0000-4000-8000-000000000033',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      repository.createAsset({
        ...(await context('aigov.model.create')),
        kind: 'MODEL',
        assetId: randomUUID(),
        command: {
          system_id: randomUUID(),
          model_key: `orphan-${randomUUID().slice(0, 8)}`,
          name: 'Orphan Model',
          provider_reference: 'provider:governed',
          classification: 'INTERNAL',
          evidence_reference: command.evidence_reference,
        },
        idempotencyKey: randomUUID(),
        requestHash: '8'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('rolls back domain, audit, outbox and idempotency on injected failure', async () => {
    for (const failurePhase of [
      'after-domain-write',
      'after-audit',
      'after-outbox',
      'after-idempotency',
      'before-commit',
    ] as const) {
      const failing = new PostgresAiInventoryRepository(inventoryUrl, (phase) => {
        if (phase === failurePhase) throw new Error(`AIGOV_M0A_INJECTED_${failurePhase}`);
      });
      const assetId = randomUUID();
      const idempotencyKey = randomUUID();
      try {
        await expect(
          failing.createAsset({
            ...(await context('aigov.ai_system.create')),
            kind: 'AI_SYSTEM',
            command: { ...command, system_key: `fail-${assetId.slice(0, 8)}` },
            assetId,
            idempotencyKey,
            requestHash: 'e'.repeat(64),
          }),
        ).rejects.toThrow(`AIGOV_M0A_INJECTED_${failurePhase}`);
        const result = await admin.query<{
          domain: number;
          audits: number;
          events: number;
          commands: number;
        }>(
          `SELECT (SELECT count(*)::int FROM ai_governance.ai_systems WHERE system_id=$1) domain,
          (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$2) audits,
          (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'target_id'=$3) events,
          (SELECT count(*)::int FROM ai_governance.command_results WHERE idempotency_key=$4) commands`,
          [assetId, `aigov:${assetId}`, assetId, idempotencyKey],
        );
        expect(result.rows[0]).toEqual({ domain: 0, audits: 0, events: 0, commands: 0 });
      } finally {
        await failing.close();
      }
    }
  });
});
