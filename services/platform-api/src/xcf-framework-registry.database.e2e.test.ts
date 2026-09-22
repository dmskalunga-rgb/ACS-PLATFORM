import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresXcfFrameworkRegistryRepository } from './postgres-xcf-framework-registry.js';
import {
  XcfM1Failure,
  xcfM1TargetReferenceHash,
  type XcfM1Actor,
  type XcfM1Metadata,
} from './xcf-framework-registry.js';

const { Client } = pg;
const adminUrl = process.env.DATABASE_URL;
const issuerUrl = process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL;
const registryUrl = process.env.ACS_XCF_M1_DATABASE_URL;

if (!adminUrl || !issuerUrl || !registryUrl)
  throw new Error('Disposable XCF M1 database qualification URLs are required.');

const tenantId = '00000000-0000-4000-8000-000000000011';
const alice = {
  subject: 'oidc|alice',
  userId: '10000000-0000-4000-8000-000000000011',
  membershipId: '30000000-0000-4000-8000-000000000011',
};
const reviewer = {
  subject: 'oidc|mpa-approver-2',
  userId: '70000000-0000-4000-8000-000000000077',
  membershipId: '80000000-0000-4000-8000-000000000077',
};

let admin: pg.Client;
let issuer: pg.Client;
let repository: PostgresXcfFrameworkRegistryRepository;
let publisherId: string;
let sourceId: string;
let releaseId: string;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  issuer = new Client({ connectionString: issuerUrl });
  repository = new PostgresXcfFrameworkRegistryRepository(registryUrl);
  await Promise.all([admin.connect(), issuer.connect()]);
});

afterAll(async () => {
  await repository.close();
  await Promise.all([admin.end(), issuer.end()]);
});

function metadata(): XcfM1Metadata {
  return { requestId: randomUUID(), correlationId: randomUUID() };
}

async function actor(
  action: string,
  identity: typeof alice | typeof reviewer = alice,
): Promise<XcfM1Actor> {
  const issued = await issuer.query<{ context_token: string }>(
    'SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,$3)',
    [identity.subject, tenantId, action],
  );
  const contextToken = issued.rows[0]?.context_token;
  if (!contextToken) throw new Error(`Canonical Platform Context was not issued for ${action}.`);
  return { tenantId, ...identity, contextToken };
}

async function approvedAuthorization(input: {
  operation: string;
  targetReferenceHash: string;
  policyId: string;
}) {
  const authorizationId = randomUUID();
  await admin.query(
    `INSERT INTO platform.mpa_authorization_envelopes(
      authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,
      target_reference_hash,policy_id,policy_version,state,approval_count,
      required_approval_count,version,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,'1.0.0','APPROVED',2,2,3,
       clock_timestamp()+interval '15 minutes')`,
    [
      authorizationId,
      tenantId,
      alice.userId,
      alice.membershipId,
      input.operation,
      input.targetReferenceHash,
      input.policyId,
    ],
  );
  return authorizationId;
}

async function createApprovedRelease(releaseVersion: string) {
  const approvedReleaseId = randomUUID();
  const artifactId = randomUUID();
  const artifactBytes = Buffer.from(JSON.stringify({ releaseVersion }), 'utf8');
  const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
  await repository.ingestRelease({
    ...(await actor('xcf.framework_release.ingest')),
    ...metadata(),
    releaseId: approvedReleaseId,
    artifactId,
    command: {
      source_id: sourceId,
      release_version: releaseVersion,
      released_at: '2026-09-01T00:00:00.000Z',
      retrieved_at: new Date().toISOString(),
      artifact_uri: `https://csrc.nist.gov/xcf/${sourceId}/${releaseVersion}.json`,
      artifact_media_type: 'application/json',
      expected_sha256: artifactSha256,
      signature_algorithm: 'ED25519',
      validation_policy_version: '1.0.0',
      evidence_reference: `xcap005:evidence:${approvedReleaseId}`,
    },
    artifactBytes,
    artifactSha256,
    signatureResult: 'VALID',
    objects: [],
    licenseIdentity: 'NIST-PD',
    licenseVersion: '1.0',
    idempotencyKey: randomUUID(),
    requestHash: createHash('sha256').update(`ingest:${approvedReleaseId}`).digest('hex'),
  });
  const approved = await repository.approveRelease({
    ...(await actor('xcf.framework_release.approve', reviewer)),
    ...metadata(),
    releaseId: approvedReleaseId,
    command: { expected_version: 1, reason_reference: `review:${approvedReleaseId}` },
    idempotencyKey: randomUUID(),
    requestHash: createHash('sha256').update(`approve:${approvedReleaseId}`).digest('hex'),
  });
  return { releaseId: approvedReleaseId, version: approved.data.version };
}

describe.sequential('ACS-XCF M1 real PostgreSQL database-backed acceptance', () => {
  it('creates and deterministically replays one tenant-bound publisher command', async () => {
    publisherId = randomUUID();
    const command = {
      publisher_key: `nist-${publisherId.slice(0, 8)}`,
      legal_name: 'National Institute of Standards and Technology',
      trust_status: 'TRUSTED' as const,
    };
    const idempotencyKey = randomUUID();
    const request = {
      ...(await actor('xcf.publisher.administer')),
      ...metadata(),
      publisherId,
      command,
      idempotencyKey,
      requestHash: 'a'.repeat(64),
    };
    const created = await repository.createPublisher(request);
    const replayed = await repository.createPublisher({
      ...request,
      ...(await actor('xcf.publisher.administer')),
      ...metadata(),
    });

    expect(created).toMatchObject({ replay: false, data: { publisher_id: publisherId } });
    expect(replayed).toEqual({ data: created.data, replay: true });
    await expect(
      repository.createPublisher({
        ...request,
        ...(await actor('xcf.publisher.administer')),
        ...metadata(),
        requestHash: 'b'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(XcfM1Failure);
  });

  it('registers a non-active source and activates it only through canonical MPA consumption', async () => {
    sourceId = randomUUID();
    const registered = await repository.registerSource({
      ...(await actor('xcf.framework_source.register')),
      ...metadata(),
      sourceId,
      frameworkId: randomUUID(),
      command: {
        publisher_id: publisherId,
        framework_key: `nist-csf-${sourceId.slice(0, 8)}`,
        framework_name: 'NIST Cybersecurity Framework',
        canonical_uri: `https://csrc.nist.gov/xcf/${sourceId}`,
        allowed_uri_prefixes: ['https://csrc.nist.gov/'],
        source_format: 'JSON',
        authentication_method: 'HTTPS',
        signature_policy: 'DETACHED_ED25519',
        trusted_key_reference: 'key:nist:csf',
        hash_algorithm: 'SHA-256',
        license: 'NIST-PD',
        license_version: '1.0',
        license_state: 'ACTIVE',
        license_allowed_use: 'ACS_INTERNAL',
        license_activation_compatible: true,
        redistribution_constraints: 'governed-test-only',
        review_due_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
      idempotencyKey: randomUUID(),
      requestHash: 'c'.repeat(64),
    });
    expect(registered.data.status).toBe('VALIDATED');

    const operation = 'xcf.framework_source.activate';
    const targetReferenceHash = xcfM1TargetReferenceHash(
      tenantId,
      sourceId,
      operation,
      registered.data.version,
    );
    const authorizationId = await approvedAuthorization({
      operation,
      targetReferenceHash,
      policyId: 'xcf.framework_source.activate.standard',
    });
    const activated = await repository.transitionSource({
      ...(await actor('platform.mpa.consume')),
      ...metadata(),
      sourceId,
      transition: 'ACTIVATE',
      command: {
        expected_version: registered.data.version,
        reason_reference: 'governance:source-activation',
        authorization_id: authorizationId,
        authorization_expected_version: 3,
        attestation_reference: 'attestation:xcf-m1:source',
      },
      idempotencyKey: randomUUID(),
      requestHash: 'd'.repeat(64),
      targetReferenceHash,
      verifyAttestation: () => Promise.resolve(true),
    });
    expect(activated.data).toMatchObject({ source_id: sourceId, status: 'ACTIVE', version: 2 });
    const consumed = await admin.query<{ state: string; consumptions: number }>(
      `SELECT e.state,(SELECT count(*)::int FROM platform.mpa_consumptions c
       WHERE c.authorization_id=e.authorization_id) consumptions
       FROM platform.mpa_authorization_envelopes e WHERE e.authorization_id=$1`,
      [authorizationId],
    );
    expect(consumed.rows).toEqual([{ state: 'CONSUMED', consumptions: 1 }]);
  });

  it('quarantines integrity failure without parsing objects or emitting an activation event', async () => {
    const quarantinedReleaseId = randomUUID();
    const artifactBytes = Buffer.from('{"untrusted":true}', 'utf8');
    const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
    const command = {
      source_id: sourceId,
      release_version: `quarantine-${quarantinedReleaseId.slice(0, 8)}`,
      released_at: '2024-02-26T00:00:00.000Z',
      retrieved_at: new Date().toISOString(),
      artifact_uri: `https://csrc.nist.gov/xcf/${sourceId}/quarantine.json`,
      artifact_media_type: 'application/json',
      expected_sha256: artifactSha256,
      signature_algorithm: 'ED25519' as const,
      validation_policy_version: '1.0.0',
      evidence_reference: 'xcap005:evidence:quarantine',
    };
    await expect(
      repository.ingestRelease({
        ...(await actor('xcf.framework_release.ingest')),
        ...metadata(),
        releaseId: randomUUID(),
        artifactId: randomUUID(),
        command: {
          ...command,
          artifact_uri: `https://csrc.nist.gov.attacker.example/${sourceId}/quarantine.json`,
        },
        artifactBytes,
        artifactSha256,
        signatureResult: 'INVALID',
        objects: [
          {
            external_id: 'MALICIOUS-OBJECT',
            object_type: 'UNTRUSTED',
            canonical_payload_sha256: '9'.repeat(64),
          },
        ],
        licenseIdentity: null,
        licenseVersion: null,
        quarantineReason: 'SIGNATURE_INVALID',
        idempotencyKey: randomUUID(),
        requestHash: '9'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_TRUSTED' });
    const receipt = await repository.ingestRelease({
      ...(await actor('xcf.framework_release.ingest')),
      ...metadata(),
      releaseId: quarantinedReleaseId,
      artifactId: randomUUID(),
      command,
      artifactBytes,
      artifactSha256,
      signatureResult: 'INVALID',
      objects: [
        {
          external_id: 'MALICIOUS-OBJECT',
          object_type: 'UNTRUSTED',
          canonical_payload_sha256: '9'.repeat(64),
        },
      ],
      licenseIdentity: null,
      licenseVersion: null,
      quarantineReason: 'SIGNATURE_INVALID',
      idempotencyKey: randomUUID(),
      requestHash: '4'.repeat(64),
    });
    expect(receipt.data).toMatchObject({ status: 'QUARANTINED', object_count: 0 });
    const proof = await admin.query<{
      objects: number;
      deniedAudits: number;
      quarantineEvents: number;
      activationEvents: number;
    }>(
      `SELECT
       (SELECT count(*)::int FROM xcf.framework_objects WHERE release_id=$1) objects,
       (SELECT count(*)::int FROM platform.audit_logs
        WHERE resource='xcf:'||$1::text AND outcome='DENIED') "deniedAudits",
       (SELECT count(*)::int FROM platform.domain_events
        WHERE payload->>'target_id'=$1::text AND event_type='xcf.framework_release.quarantined') "quarantineEvents",
       (SELECT count(*)::int FROM platform.domain_events
        WHERE payload->>'target_id'=$1::text AND event_type='xcf.framework_release.activated') "activationEvents"`,
      [quarantinedReleaseId],
    );
    expect(proof.rows[0]).toEqual({
      objects: 0,
      deniedAudits: 1,
      quarantineEvents: 1,
      activationEvents: 0,
    });
  });

  it('ingests immutable provenance, enforces independent approval, and activates one release', async () => {
    releaseId = randomUUID();
    const artifactId = randomUUID();
    const idempotencyKey = randomUUID();
    const artifactBytes = Buffer.from('{"framework":"NIST-CSF-2.0"}', 'utf8');
    const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
    const releaseCommand = {
      source_id: sourceId,
      release_version: '2.0',
      released_at: '2024-02-26T00:00:00.000Z',
      retrieved_at: new Date().toISOString(),
      artifact_uri: `https://csrc.nist.gov/xcf/${sourceId}/2.0.json`,
      artifact_media_type: 'application/json',
      expected_sha256: artifactSha256,
      signature_algorithm: 'ED25519' as const,
      validation_policy_version: '1.0.0',
      evidence_reference: 'xcap005:evidence:test',
    };
    const ingested = await repository.ingestRelease({
      ...(await actor('xcf.framework_release.ingest')),
      ...metadata(),
      releaseId,
      artifactId,
      command: releaseCommand,
      artifactBytes,
      artifactSha256,
      signatureResult: 'VALID',
      objects: [
        {
          external_id: 'GV.OC-01',
          object_type: 'SUBCATEGORY',
          canonical_payload_sha256: 'e'.repeat(64),
        },
      ],
      licenseIdentity: 'NIST-PD',
      licenseVersion: '1.0',
      idempotencyKey,
      requestHash: 'e'.repeat(64),
    });
    expect(ingested.data).toMatchObject({ status: 'INGESTED', object_count: 1 });
    const replayed = await repository.ingestRelease({
      ...(await actor('xcf.framework_release.ingest')),
      ...metadata(),
      releaseId,
      artifactId,
      command: releaseCommand,
      artifactBytes,
      artifactSha256,
      signatureResult: 'VALID',
      objects: [
        {
          external_id: 'GV.OC-01',
          object_type: 'SUBCATEGORY',
          canonical_payload_sha256: 'e'.repeat(64),
        },
      ],
      licenseIdentity: 'NIST-PD',
      licenseVersion: '1.0',
      idempotencyKey,
      requestHash: 'e'.repeat(64),
    });
    expect(replayed).toEqual({ data: ingested.data, replay: true });

    const approved = await repository.approveRelease({
      ...(await actor('xcf.framework_release.approve', reviewer)),
      ...metadata(),
      releaseId,
      command: { expected_version: 1, reason_reference: 'review:independent' },
      idempotencyKey: randomUUID(),
      requestHash: 'f'.repeat(64),
    });
    expect(approved.data).toMatchObject({ status: 'APPROVED', version: 2 });

    const operation = 'xcf.framework_release.activate';
    const targetReferenceHash = xcfM1TargetReferenceHash(
      tenantId,
      releaseId,
      operation,
      approved.data.version,
    );
    const authorizationId = await approvedAuthorization({
      operation,
      targetReferenceHash,
      policyId: 'xcf.framework_release.activate.standard',
    });
    const activated = await repository.transitionRelease({
      ...(await actor('platform.mpa.consume')),
      ...metadata(),
      releaseId,
      transition: 'ACTIVATE',
      command: {
        expected_version: approved.data.version,
        reason_reference: 'governance:release-activation',
        authorization_id: authorizationId,
        authorization_expected_version: 3,
        attestation_reference: 'attestation:xcf-m1:release',
      },
      idempotencyKey: randomUUID(),
      requestHash: '1'.repeat(64),
      targetReferenceHash,
      verifyAttestation: () => Promise.resolve(true),
    });
    expect(activated.data).toMatchObject({ release_id: releaseId, status: 'ACTIVE', version: 3 });

    const proof = await admin.query<{
      artifacts: number;
      objects: number;
      allowedAudits: number;
      lifecycleEvents: number;
    }>(
      `SELECT
       (SELECT count(*)::int FROM xcf.source_artifacts
        WHERE source_id=$1 AND artifact_id=(
          SELECT artifact_id FROM xcf.framework_releases WHERE release_id=$2
        )) artifacts,
       (SELECT count(*)::int FROM xcf.framework_objects WHERE release_id=$2) objects,
       (SELECT count(*)::int FROM platform.audit_logs WHERE resource='xcf:'||$2::text AND outcome='ALLOWED') "allowedAudits",
       (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'target_id'=$2::text) "lifecycleEvents"`,
      [sourceId, releaseId],
    );
    expect(proof.rows[0]).toEqual({
      artifacts: 1,
      objects: 1,
      allowedAudits: 3,
      lifecycleEvents: 3,
    });
  });

  it('serializes concurrent exact replay into one canonical publisher result', async () => {
    const idempotencyKey = randomUUID();
    const concurrentPublisherId = randomUUID();
    const base = {
      tenantId,
      userId: alice.userId,
      membershipId: alice.membershipId,
      subject: alice.subject,
      publisherId: concurrentPublisherId,
      command: {
        publisher_key: `concurrent-${concurrentPublisherId.slice(0, 8)}`,
        legal_name: 'Concurrent publisher',
        trust_status: 'TRUSTED' as const,
      },
      idempotencyKey,
      requestHash: '2'.repeat(64),
    };
    const attempts = await Promise.all([
      repository.createPublisher({
        ...base,
        ...(await actor('xcf.publisher.administer')),
        ...metadata(),
      }),
      repository.createPublisher({
        ...base,
        ...(await actor('xcf.publisher.administer')),
        ...metadata(),
      }),
    ]);
    expect(attempts.map(({ replay }) => replay).sort()).toEqual([false, true]);
    const rows = await admin.query<{ count: number }>(
      'SELECT count(*)::int count FROM xcf.publishers WHERE publisher_id=$1',
      [concurrentPublisherId],
    );
    expect(rows.rows[0]?.count).toBe(1);
  });

  it('revalidates license state at activation and rolls MPA consumption back on denial', async () => {
    const candidate = await createApprovedRelease(`license-${randomUUID().slice(0, 8)}`);
    const operation = 'xcf.framework_release.activate';
    const targetReferenceHash = xcfM1TargetReferenceHash(
      tenantId,
      candidate.releaseId,
      operation,
      candidate.version,
    );
    const authorizationId = await approvedAuthorization({
      operation,
      targetReferenceHash,
      policyId: 'xcf.framework_release.activate.standard',
    });
    await admin.query(
      "UPDATE xcf.framework_sources SET license_state='REVOKED' WHERE source_id=$1",
      [sourceId],
    );
    try {
      await expect(
        repository.transitionRelease({
          ...(await actor('platform.mpa.consume')),
          ...metadata(),
          releaseId: candidate.releaseId,
          transition: 'ACTIVATE',
          command: {
            expected_version: candidate.version,
            reason_reference: 'governance:license-revalidation',
            authorization_id: authorizationId,
            authorization_expected_version: 3,
            attestation_reference: 'attestation:xcf-m1:license',
          },
          idempotencyKey: randomUUID(),
          requestHash: createHash('sha256').update(candidate.releaseId).digest('hex'),
          targetReferenceHash,
          verifyAttestation: () => Promise.resolve(true),
        }),
      ).rejects.toMatchObject({ code: 'LICENSE_INVALID' });
    } finally {
      await admin.query(
        "UPDATE xcf.framework_sources SET license_state='ACTIVE' WHERE source_id=$1",
        [sourceId],
      );
    }
    const proof = await admin.query<{
      releaseStatus: string;
      envelopeState: string;
      consumptions: number;
    }>(
      `SELECT
       (SELECT status FROM xcf.framework_releases WHERE release_id=$1) "releaseStatus",
       (SELECT state FROM platform.mpa_authorization_envelopes WHERE authorization_id=$2) "envelopeState",
       (SELECT count(*)::int FROM platform.mpa_consumptions WHERE authorization_id=$2) consumptions`,
      [candidate.releaseId, authorizationId],
    );
    expect(proof.rows[0]).toEqual({
      releaseStatus: 'APPROVED',
      envelopeState: 'APPROVED',
      consumptions: 0,
    });
  });

  it('preserves the prior active release when activation fails before commit', async () => {
    const candidate = await createApprovedRelease(`atomic-${randomUUID().slice(0, 8)}`);
    const operation = 'xcf.framework_release.activate';
    const targetReferenceHash = xcfM1TargetReferenceHash(
      tenantId,
      candidate.releaseId,
      operation,
      candidate.version,
    );
    const authorizationId = await approvedAuthorization({
      operation,
      targetReferenceHash,
      policyId: 'xcf.framework_release.activate.standard',
    });
    const failing = new PostgresXcfFrameworkRegistryRepository(registryUrl, (phase) => {
      if (phase === 'before-commit') throw new Error('test-only activation commit failure');
    });
    await expect(
      failing.transitionRelease({
        ...(await actor('platform.mpa.consume')),
        ...metadata(),
        releaseId: candidate.releaseId,
        transition: 'ACTIVATE',
        command: {
          expected_version: candidate.version,
          reason_reference: 'governance:atomic-activation',
          authorization_id: authorizationId,
          authorization_expected_version: 3,
          attestation_reference: 'attestation:xcf-m1:atomic',
        },
        idempotencyKey: randomUUID(),
        requestHash: createHash('sha256').update(`activate:${candidate.releaseId}`).digest('hex'),
        targetReferenceHash,
        verifyAttestation: () => Promise.resolve(true),
      }),
    ).rejects.toThrow('test-only activation commit failure');
    await failing.close();
    const proof = await admin.query<{
      candidateStatus: string;
      priorStatus: string;
      envelopeState: string;
      consumptions: number;
    }>(
      `SELECT
       (SELECT status FROM xcf.framework_releases WHERE release_id=$1) "candidateStatus",
       (SELECT status FROM xcf.framework_releases WHERE release_id=$2) "priorStatus",
       (SELECT state FROM platform.mpa_authorization_envelopes WHERE authorization_id=$3) "envelopeState",
       (SELECT count(*)::int FROM platform.mpa_consumptions WHERE authorization_id=$3) consumptions`,
      [candidate.releaseId, releaseId, authorizationId],
    );
    expect(proof.rows[0]).toEqual({
      candidateStatus: 'APPROVED',
      priorStatus: 'ACTIVE',
      envelopeState: 'APPROVED',
      consumptions: 0,
    });
  });

  it('rolls back quarantined artifact, audit, outbox and receipt persistence together', async () => {
    const failedReleaseId = randomUUID();
    const artifactId = randomUUID();
    const idempotencyKey = randomUUID();
    const bytes = Buffer.from('{"invalid":true}', 'utf8');
    const sha = createHash('sha256').update(bytes).digest('hex');
    const failing = new PostgresXcfFrameworkRegistryRepository(registryUrl, (phase) => {
      if (phase === 'after-domain-write')
        throw new Error('test-only quarantine persistence failure');
    });
    await expect(
      failing.ingestRelease({
        ...(await actor('xcf.framework_release.ingest')),
        ...metadata(),
        releaseId: failedReleaseId,
        artifactId,
        command: {
          source_id: sourceId,
          release_version: `quarantine-failure-${failedReleaseId.slice(0, 8)}`,
          released_at: '2026-09-01T00:00:00.000Z',
          retrieved_at: new Date().toISOString(),
          artifact_uri: `https://csrc.nist.gov/xcf/${sourceId}/invalid.json`,
          artifact_media_type: 'application/json',
          expected_sha256: sha,
          signature_algorithm: 'ED25519',
          validation_policy_version: '1.0.0',
        },
        artifactBytes: bytes,
        artifactSha256: sha,
        signatureResult: 'INVALID',
        objects: [],
        licenseIdentity: null,
        licenseVersion: null,
        quarantineReason: 'SIGNATURE_INVALID',
        idempotencyKey,
        requestHash: createHash('sha256').update(failedReleaseId).digest('hex'),
      }),
    ).rejects.toThrow('test-only quarantine persistence failure');
    await failing.close();
    const proof = await admin.query<{
      artifacts: number;
      releases: number;
      commands: number;
      audits: number;
      events: number;
    }>(
      `SELECT
       (SELECT count(*)::int FROM xcf.source_artifacts WHERE artifact_id=$1) artifacts,
       (SELECT count(*)::int FROM xcf.framework_releases WHERE release_id=$2) releases,
       (SELECT count(*)::int FROM xcf.command_results WHERE idempotency_key=$3) commands,
       (SELECT count(*)::int FROM platform.audit_logs WHERE resource='xcf:'||$2::text) audits,
       (SELECT count(*)::int FROM platform.domain_events WHERE causation_id=$3) events`,
      [artifactId, failedReleaseId, idempotencyKey],
    );
    expect(proof.rows[0]).toEqual({ artifacts: 0, releases: 0, commands: 0, audits: 0, events: 0 });
  });

  it('supersedes immutable release history and records governed revocation', async () => {
    const nextReleaseId = randomUUID();
    const bytes = Buffer.from('{"framework":"NIST-CSF-2.1"}', 'utf8');
    const sha = createHash('sha256').update(bytes).digest('hex');
    await repository.ingestRelease({
      ...(await actor('xcf.framework_release.ingest')),
      ...metadata(),
      releaseId: nextReleaseId,
      artifactId: randomUUID(),
      command: {
        source_id: sourceId,
        release_version: '2.1',
        released_at: '2026-09-01T00:00:00.000Z',
        retrieved_at: new Date().toISOString(),
        artifact_uri: `https://csrc.nist.gov/xcf/${sourceId}/2.1.json`,
        artifact_media_type: 'application/json',
        expected_sha256: sha,
        signature_algorithm: 'ED25519',
        validation_policy_version: '1.0.0',
        evidence_reference: 'xcap005:evidence:test-next',
      },
      artifactBytes: bytes,
      artifactSha256: sha,
      signatureResult: 'VALID',
      objects: [],
      licenseIdentity: 'NIST-PD',
      licenseVersion: '1.0',
      idempotencyKey: randomUUID(),
      requestHash: '5'.repeat(64),
    });
    const approved = await repository.approveRelease({
      ...(await actor('xcf.framework_release.approve', reviewer)),
      ...metadata(),
      releaseId: nextReleaseId,
      command: { expected_version: 1, reason_reference: 'review:independent-next' },
      idempotencyKey: randomUUID(),
      requestHash: '6'.repeat(64),
    });
    const activateOperation = 'xcf.framework_release.activate';
    const activateTarget = xcfM1TargetReferenceHash(
      tenantId,
      nextReleaseId,
      activateOperation,
      approved.data.version,
    );
    const activateAuthorization = await approvedAuthorization({
      operation: activateOperation,
      targetReferenceHash: activateTarget,
      policyId: 'xcf.framework_release.activate.standard',
    });
    const active = await repository.transitionRelease({
      ...(await actor('platform.mpa.consume')),
      ...metadata(),
      releaseId: nextReleaseId,
      transition: 'ACTIVATE',
      command: {
        expected_version: approved.data.version,
        reason_reference: 'governance:supersede',
        authorization_id: activateAuthorization,
        authorization_expected_version: 3,
        attestation_reference: 'attestation:xcf-m1:supersede',
      },
      idempotencyKey: randomUUID(),
      requestHash: '7'.repeat(64),
      targetReferenceHash: activateTarget,
      verifyAttestation: () => Promise.resolve(true),
    });
    expect(active.data.status).toBe('ACTIVE');
    const supersession = await admin.query<{ priorStatus: string; links: number }>(
      `SELECT
       (SELECT status FROM xcf.framework_releases WHERE release_id=$1) "priorStatus",
       (SELECT count(*)::int FROM xcf.release_supersessions
        WHERE prior_release_id=$1 AND new_release_id=$2) links`,
      [releaseId, nextReleaseId],
    );
    expect(supersession.rows[0]).toEqual({ priorStatus: 'SUPERSEDED', links: 1 });

    const revokeOperation = 'xcf.framework_release.revoke';
    const revokeTarget = xcfM1TargetReferenceHash(
      tenantId,
      nextReleaseId,
      revokeOperation,
      active.data.version,
    );
    const revokeAuthorization = await approvedAuthorization({
      operation: revokeOperation,
      targetReferenceHash: revokeTarget,
      policyId: 'xcf.framework_release.revoke.standard',
    });
    const revoked = await repository.transitionRelease({
      ...(await actor('platform.mpa.consume')),
      ...metadata(),
      releaseId: nextReleaseId,
      transition: 'REVOKE',
      command: {
        expected_version: active.data.version,
        reason_reference: 'governance:revocation',
        authorization_id: revokeAuthorization,
        authorization_expected_version: 3,
        attestation_reference: 'attestation:xcf-m1:revoke',
      },
      idempotencyKey: randomUUID(),
      requestHash: '8'.repeat(64),
      targetReferenceHash: revokeTarget,
      verifyAttestation: () => Promise.resolve(true),
    });
    expect(revoked.data.status).toBe('REVOKED');
    const history = await admin.query<{ revocations: number; artifacts: number }>(
      `SELECT
       (SELECT count(*)::int FROM xcf.revocations
        WHERE target_type='FRAMEWORK_RELEASE' AND target_id=$1) revocations,
       (SELECT count(*)::int FROM xcf.source_artifacts a
        JOIN xcf.framework_releases r USING(governance_tenant_id,artifact_id)
        WHERE r.release_id=$1) artifacts`,
      [nextReleaseId],
    );
    expect(history.rows[0]).toEqual({ revocations: 1, artifacts: 1 });
  });

  it.each(['after-audit', 'after-outbox'] as const)(
    'rolls back domain state, audit, outbox, and idempotency on %s failure',
    async (failurePhase) => {
      const publisherId = randomUUID();
      const idempotencyKey = randomUUID();
      const failing = new PostgresXcfFrameworkRegistryRepository(registryUrl, (phase) => {
        if (phase === failurePhase) throw new Error('test-only XCF M1 failure injection');
      });
      await expect(
        failing.createPublisher({
          ...(await actor('xcf.publisher.administer')),
          ...metadata(),
          publisherId,
          command: {
            publisher_key: `failure-${publisherId.slice(0, 8)}`,
            legal_name: 'Failure injection publisher',
            trust_status: 'TRUSTED',
          },
          idempotencyKey,
          requestHash: '3'.repeat(64),
        }),
      ).rejects.toThrow('test-only XCF M1 failure injection');
      await failing.close();
      const proof = await admin.query<{
        publishers: number;
        commands: number;
        audits: number;
        events: number;
      }>(
        `SELECT
       (SELECT count(*)::int FROM xcf.publishers WHERE publisher_id=$1) publishers,
       (SELECT count(*)::int FROM xcf.command_results WHERE idempotency_key=$2) commands,
       (SELECT count(*)::int FROM platform.audit_logs WHERE resource='xcf:'||$1::text) audits,
       (SELECT count(*)::int FROM platform.domain_events WHERE causation_id=$2) events`,
        [publisherId, idempotencyKey],
      );
      expect(proof.rows[0]).toEqual({ publishers: 0, commands: 0, audits: 0, events: 0 });
    },
  );

  it('fails closed without false success when PostgreSQL is unavailable', async () => {
    const unavailable = new PostgresXcfFrameworkRegistryRepository(
      'postgresql://acs_xcf_m1_registry_login_test:acs_phase1_test_only@127.0.0.1:1/acs_foundation',
    );
    const started = Date.now();
    await expect(
      unavailable.createPublisher({
        tenantId,
        userId: alice.userId,
        membershipId: alice.membershipId,
        subject: alice.subject,
        contextToken: randomUUID(),
        ...metadata(),
        publisherId: randomUUID(),
        command: {
          publisher_key: `unavailable-${randomUUID().slice(0, 8)}`,
          legal_name: 'Unavailable database proof',
          trust_status: 'TRUSTED',
        },
        idempotencyKey: randomUUID(),
        requestHash: '0'.repeat(64),
      }),
    ).rejects.toBeDefined();
    expect(Date.now() - started).toBeLessThan(5_000);
    await unavailable.close();
  });
});
