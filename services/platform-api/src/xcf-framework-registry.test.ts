import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  XCF_M1_PERMISSIONS,
  XcfFrameworkRegistryService,
  XcfM1Failure,
} from './xcf-framework-registry.js';

const governanceTenantId = '00000000-0000-4000-8000-000000000011';
const publisherId = '10000000-0000-4000-8000-000000000001';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const metadata = () => ({ requestId: randomUUID(), correlationId: randomUUID() });

function setup() {
  const authorize = vi.fn().mockResolvedValue({ allowed: true, reason: 'TEST' });
  const repository = {
    createPublisher: vi.fn(),
    registerSource: vi.fn(),
    readSource: vi.fn(),
    readSourceIngestionPolicy: vi.fn().mockImplementation(({ sourceId }: { sourceId: string }) =>
      Promise.resolve({
        sourceId,
        publisherId,
        publisherTrustStatus: 'TRUSTED',
        status: 'ACTIVE',
        allowedUriPrefixes: ['https://example.test/'],
        sourceFormat: 'JSON',
        signaturePolicy: 'DETACHED_ED25519',
        trustedKeyReference: 'key:nist:1',
        hashAlgorithm: 'SHA-256',
        licenseIdentity: 'PUBLIC-DOMAIN',
        licenseVersion: '1.0',
        licenseState: 'ACTIVE',
        licenseAllowedUse: 'ACS_INTERNAL',
        licenseActivationCompatible: true,
        reviewDueAt: new Date('2030-01-01T00:00:00Z'),
      }),
    ),
    recordIngestionFailure: vi.fn(),
    ingestRelease: vi.fn(),
    approveRelease: vi.fn(),
    transitionSource: vi.fn(),
    transitionRelease: vi.fn(),
  };
  const acquisition = { acquire: vi.fn() };
  const keyResolver = {
    resolve: vi.fn().mockResolvedValue({
      reference: 'key:nist:1',
      publisherId,
      algorithm: 'ED25519',
      publicKeyPem,
      status: 'TRUSTED',
    }),
  };
  const attestation = { verify: vi.fn().mockResolvedValue({ verified: true }) };
  const service = new XcfFrameworkRegistryService(
    { configured: true, authenticate: vi.fn().mockResolvedValue({ subject: 'issuer|subject' }) },
    { authorize },
    {
      resolveMembership: vi.fn().mockResolvedValue({
        userId: '10000000-0000-4000-8000-000000000101',
        tenantId: governanceTenantId,
        tenantSlug: 'governance',
        tenantDisplayName: 'Governance',
      }),
      isActionAuthorized: vi.fn().mockResolvedValue(true),
      issueContext: vi.fn().mockResolvedValue({
        userId: '10000000-0000-4000-8000-000000000101',
        tenantId: governanceTenantId,
        tenantSlug: 'governance',
        tenantDisplayName: 'Governance',
        contextToken: '10000000-0000-4000-8000-000000000201',
      }),
      readAndAudit: vi.fn().mockResolvedValue({
        userId: '10000000-0000-4000-8000-000000000101',
        tenantId: governanceTenantId,
        tenantSlug: 'governance',
        tenantDisplayName: 'Governance',
      }),
    },
    {
      listActiveMembershipsBySubject: vi.fn().mockResolvedValue([
        {
          userId: '10000000-0000-4000-8000-000000000101',
          tenantId: governanceTenantId,
          membershipId: '10000000-0000-4000-8000-000000000301',
          tenantSlug: 'governance',
          tenantDisplayName: 'Governance',
        },
      ]),
    },
    repository,
    acquisition,
    keyResolver,
    attestation,
    { recordDenied: vi.fn() },
    governanceTenantId,
    1024 * 1024,
  );
  return { service, repository, authorize, attestation, acquisition, keyResolver };
}

function release(sourceId = randomUUID(), artifactOverride: Record<string, unknown> = {}) {
  const artifact = Buffer.from(
    JSON.stringify({
      schema_version: '1.0',
      publisher_id: publisherId,
      source_id: sourceId,
      release_version: '2.0',
      license: { identity: 'PUBLIC-DOMAIN', version: '1.0' },
      objects: [{ external_id: 'control-1', object_type: 'CONTROL', payload: { title: 'Govern' } }],
      ...artifactOverride,
    }),
  );
  return {
    artifact,
    command: {
      source_id: sourceId,
      release_version: '2.0',
      released_at: '2026-09-01T00:00:00Z',
      artifact_uri: 'https://example.test/csf.json',
      signature_algorithm: 'ED25519' as const,
      signature_base64: sign(null, artifact, privateKey).toString('base64'),
      validation_policy_version: '1.0.0',
    },
  };
}

function acquire(acquisition: ReturnType<typeof setup>['acquisition'], artifact: Buffer) {
  acquisition.acquire.mockResolvedValue({
    bytes: artifact,
    mediaType: 'application/json',
    finalUri: 'https://example.test/csf.json',
    retrievedAt: new Date('2026-09-02T00:00:00Z'),
  });
}

describe('XCF M1 Framework Registry service', () => {
  it('uses only the server-configured governance tenant', async () => {
    const { service, authorize, repository } = setup();
    repository.createPublisher.mockResolvedValue({ data: {}, replay: false });
    await service.createPublisher(
      'Bearer opaque',
      { publisher_key: 'nist', legal_name: 'NIST', trust_status: 'TRUSTED' },
      randomUUID(),
      metadata(),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        action: XCF_M1_PERMISSIONS.publisherAdminister,
        tenant_id: governanceTenantId,
      }),
    );
    expect(repository.createPublisher).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: governanceTenantId }),
    );
  });

  it('computes the canonical hash and quarantines a mismatched expected hash', async () => {
    const { service, repository, acquisition } = setup();
    repository.ingestRelease.mockResolvedValue({ data: { status: 'QUARANTINED' }, replay: false });
    const input = release();
    acquire(acquisition, input.artifact);
    await service.ingestRelease(
      'Bearer opaque',
      { ...input.command, expected_sha256: '0'.repeat(64) },
      randomUUID(),
      metadata(),
    );
    expect(repository.ingestRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactSha256: createHash('sha256').update(input.artifact).digest('hex'),
        quarantineReason: 'HASH_MISMATCH',
      }),
    );
  });

  it('independently verifies signatures and quarantines a mismatch', async () => {
    const { service, repository, acquisition } = setup();
    repository.ingestRelease.mockResolvedValue({ data: { status: 'QUARANTINED' }, replay: false });
    const input = release();
    acquire(acquisition, Buffer.from('{}'));
    await service.ingestRelease('Bearer opaque', input.command, randomUUID(), metadata());
    expect(repository.ingestRelease).toHaveBeenCalledWith(
      expect.objectContaining({ quarantineReason: 'SIGNATURE_INVALID' }),
    );
  });

  it('preserves a valid cryptographic result when later schema validation quarantines the artifact', async () => {
    const { service, repository, acquisition } = setup();
    repository.ingestRelease.mockResolvedValue({ data: { status: 'QUARANTINED' }, replay: false });
    const input = release(randomUUID(), { schema_version: '0.9' });
    acquire(acquisition, input.artifact);
    await service.ingestRelease('Bearer opaque', input.command, randomUUID(), metadata());
    expect(repository.ingestRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        signatureResult: 'VALID',
        quarantineReason: 'SCHEMA_INVALID',
      }),
    );
  });

  it('passes only server-derived bytes, objects, hash, signature and license decisions', async () => {
    const { service, repository, acquisition } = setup();
    repository.ingestRelease.mockResolvedValue({ data: {}, replay: false });
    const input = release();
    acquire(acquisition, input.artifact);
    await service.ingestRelease('Bearer opaque', input.command, randomUUID(), metadata());
    expect(repository.ingestRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactBytes: input.artifact,
        artifactSha256: createHash('sha256').update(input.artifact).digest('hex'),
        signatureResult: 'VALID',
        licenseIdentity: 'PUBLIC-DOMAIN',
        licenseVersion: '1.0',
        objects: [expect.objectContaining({ external_id: 'control-1', object_type: 'CONTROL' })],
      }),
    );
    const call = repository.ingestRelease.mock.calls.at(0) as unknown as
      [{ command: object }] | undefined;
    expect(call?.[0].command).not.toHaveProperty('signature_base64');
    expect(call?.[0].command).not.toHaveProperty('objects');
  });

  it('records a bounded failed attempt when acquisition times out', async () => {
    const { service, repository, acquisition } = setup();
    acquisition.acquire.mockRejectedValue(new XcfM1Failure('ACQUISITION_TIMEOUT'));
    const input = release();
    await expect(
      service.ingestRelease('Bearer opaque', input.command, randomUUID(), metadata()),
    ).rejects.toMatchObject({ code: 'ACQUISITION_TIMEOUT' });
    expect(repository.recordIngestionFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ACQUISITION_TIMEOUT' }),
    );
    expect(repository.ingestRelease).not.toHaveBeenCalled();
  });

  it('rejects untrusted, revoked, and review-expired sources before artifact acquisition', async () => {
    for (const policyOverride of [
      { publisherTrustStatus: 'REVOKED' as const },
      { status: 'REVOKED' as const },
      { reviewDueAt: new Date('2020-01-01T00:00:00Z') },
    ]) {
      const { service, repository, acquisition } = setup();
      repository.readSourceIngestionPolicy.mockResolvedValue({
        sourceId: randomUUID(),
        publisherId,
        publisherTrustStatus: 'TRUSTED',
        status: 'ACTIVE',
        allowedUriPrefixes: ['https://example.test/'],
        sourceFormat: 'JSON',
        signaturePolicy: 'DETACHED_ED25519',
        trustedKeyReference: 'key:nist:1',
        hashAlgorithm: 'SHA-256',
        licenseIdentity: 'PUBLIC-DOMAIN',
        licenseVersion: '1.0',
        licenseState: 'ACTIVE',
        licenseAllowedUse: 'ACS_INTERNAL',
        licenseActivationCompatible: true,
        reviewDueAt: new Date('2030-01-01T00:00:00Z'),
        ...policyOverride,
      });
      const input = release();
      await expect(
        service.ingestRelease('Bearer opaque', input.command, randomUUID(), metadata()),
      ).rejects.toMatchObject({ code: 'SOURCE_NOT_TRUSTED' });
      expect(acquisition.acquire).not.toHaveBeenCalled();
      expect(repository.ingestRelease).not.toHaveBeenCalled();
    }
  });

  it('fails closed when AuthorizationPort is unavailable', async () => {
    const { service, repository, authorize } = setup();
    authorize.mockRejectedValue(new Error('authorization unavailable'));
    await expect(
      service.createPublisher(
        'Bearer opaque',
        { publisher_key: 'nist', legal_name: 'NIST', trust_status: 'TRUSTED' },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toThrow('authorization unavailable');
    expect(repository.createPublisher).not.toHaveBeenCalled();
  });

  it('binds protected activation to canonical attestation and MPA target', async () => {
    const { service, repository, attestation, authorize } = setup();
    repository.transitionRelease.mockImplementation(
      async (input: { verifyAttestation: () => Promise<boolean> }) => {
        expect(await input.verifyAttestation()).toBe(true);
        return { data: {}, replay: false };
      },
    );
    const authorizationId = randomUUID();
    await service.transitionRelease(
      'Bearer opaque',
      randomUUID(),
      'ACTIVATE',
      {
        expected_version: 2,
        reason_reference: 'change:42',
        authorization_id: authorizationId,
        authorization_expected_version: 3,
        attestation_reference: 'attestation:42',
      },
      randomUUID(),
      metadata(),
    );
    expect(attestation.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationId,
        operation: XCF_M1_PERMISSIONS.releaseActivate,
        tenantId: governanceTenantId,
      }),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.mpa.consume',
        resource: 'platform:multi-person-authorization',
      }),
    );
  });

  it('requires MPA for activation/revocation but not emergency suspension', async () => {
    const { service, repository, attestation } = setup();
    repository.transitionSource.mockResolvedValue({ data: {}, replay: false });
    await expect(
      service.transitionSource(
        'Bearer opaque',
        randomUUID(),
        'ACTIVATE',
        { expected_version: 1, reason_reference: 'change:42' },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toBeInstanceOf(XcfM1Failure);
    await expect(
      service.transitionSource(
        'Bearer opaque',
        randomUUID(),
        'REVOKE',
        { expected_version: 1, reason_reference: 'change:43' },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toBeInstanceOf(XcfM1Failure);
    await service.transitionSource(
      'Bearer opaque',
      randomUUID(),
      'SUSPEND',
      { expected_version: 1, reason_reference: 'incident:42' },
      randomUUID(),
      metadata(),
    );
    expect(repository.transitionSource).toHaveBeenCalledTimes(1);
    expect(attestation.verify).not.toHaveBeenCalled();
  });
});
