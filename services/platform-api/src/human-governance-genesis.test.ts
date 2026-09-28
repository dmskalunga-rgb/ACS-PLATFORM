import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalSignedGenesisManifest,
  HUMAN_GOVERNANCE_ROOT_ALGORITHM,
  HUMAN_GOVERNANCE_ROOT_PURPOSE,
  humanGenesisManifestHash,
  HumanGenesisAuthorizationVerifier,
  type HumanGenesisManifest,
  type HumanGovernancePublicRoot,
} from './human-governance-genesis.js';

const tenant = '00000000-0000-4000-8000-000000000011';
const executor = '10000000-0000-4000-8000-000000000001';
const instant = new Date('2026-09-27T12:00:00.000Z');

function fixture() {
  // An ephemeral test key is generated in memory; no private key is stored in the repository.
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const publicKeyFingerprint = createHash('sha256')
    .update(pair.publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
  const root: HumanGovernancePublicRoot = {
    trustRootId: 'ACS-HGR-001',
    purpose: HUMAN_GOVERNANCE_ROOT_PURPOSE,
    algorithm: HUMAN_GOVERNANCE_ROOT_ALGORITHM,
    publicKeyPem,
    publicKeyFingerprint,
    version: 1,
    status: 'ACTIVE',
    notBefore: '2026-09-01T00:00:00.000Z',
    notAfter: '2027-09-01T00:00:00.000Z',
    revokedAt: null,
  };
  const base: HumanGenesisManifest = {
    genesis_id: '20000000-0000-4000-8000-000000000001',
    manifest_version: '1.0.0',
    purpose: HUMAN_GOVERNANCE_ROOT_PURPOSE,
    tenant_id: tenant,
    trust_root_id: root.trustRootId,
    authorized_executor_identity: executor,
    candidates: [1, 2, 3].map((number) => ({
      principal_id: `30000000-0000-4000-8000-00000000000${number}`,
      person_id: `40000000-0000-4000-8000-00000000000${number}`,
      evidence_reference: `50000000-0000-4000-8000-00000000000${number}`,
    })),
    issued_at: '2026-09-27T10:00:00.000Z',
    not_before: '2026-09-27T11:00:00.000Z',
    expires_at: '2026-09-27T13:00:00.000Z',
    nonce: '60000000-0000-4000-8000-000000000001',
    manifest_hash: '',
  };
  const manifest = { ...base, manifest_hash: humanGenesisManifestHash(base) };
  const signer = createSign('sha256');
  signer.update(canonicalSignedGenesisManifest(manifest));
  signer.end();
  const signature = signer.sign(pair.privateKey).toString('base64');
  const verifier = new HumanGenesisAuthorizationVerifier({ resolve: () => Promise.resolve(root) });
  return { root, manifest, signature, verifier };
}

function candidate(manifest: HumanGenesisManifest, index: number) {
  const result = manifest.candidates[index];
  if (result === undefined) throw new Error('Invalid test fixture.');
  return result;
}

describe('human governance genesis authorization', () => {
  it('accepts only a signed, tenant/executor-bound three-person manifest', async () => {
    const { manifest, signature, verifier } = fixture();
    await expect(verifier.verify(manifest, signature, tenant, executor, instant)).resolves.toBe(
      manifest.manifest_hash,
    );
  });

  it.each([
    [
      'candidate substitution',
      (m: HumanGenesisManifest) => ({
        ...m,
        candidates: [
          { ...candidate(m, 0), person_id: candidate(m, 1).person_id },
          ...m.candidates.slice(1),
        ],
      }),
    ],
    [
      'evidence substitution',
      (m: HumanGenesisManifest) => ({
        ...m,
        candidates: [
          { ...candidate(m, 0), evidence_reference: candidate(m, 1).evidence_reference },
          ...m.candidates.slice(1),
        ],
      }),
    ],
    ['wrong purpose', (m: HumanGenesisManifest) => ({ ...m, purpose: 'OTHER' })],
    [
      'wrong tenant',
      (m: HumanGenesisManifest) => ({ ...m, tenant_id: '00000000-0000-4000-8000-000000000022' }),
    ],
    [
      'wrong executor',
      (m: HumanGenesisManifest) => ({
        ...m,
        authorized_executor_identity: '10000000-0000-4000-8000-000000000002',
      }),
    ],
  ])('rejects %s', async (_label, mutate) => {
    const { manifest, signature, verifier } = fixture();
    await expect(
      verifier.verify(
        mutate(manifest) as HumanGenesisManifest,
        signature,
        tenant,
        executor,
        instant,
      ),
    ).rejects.toThrow('unavailable');
  });

  it('rejects modified signatures and wrong public keys', async () => {
    const { root, manifest, signature } = fixture();
    const verifier = new HumanGenesisAuthorizationVerifier({
      resolve: () => Promise.resolve(root),
    });
    const modified = Buffer.from(signature, 'base64');
    modified.set([(modified.at(-1) ?? 0) ^ 1], modified.length - 1);
    await expect(
      verifier.verify(manifest, modified.toString('base64'), tenant, executor, instant),
    ).rejects.toThrow('unavailable');
    const other = fixture().root;
    await expect(
      new HumanGenesisAuthorizationVerifier({ resolve: () => Promise.resolve(other) }).verify(
        manifest,
        signature,
        tenant,
        executor,
        instant,
      ),
    ).rejects.toThrow('unavailable');
  });

  it('rejects wrong-purpose, revoked and expired roots', async () => {
    const { root, manifest, signature } = fixture();
    for (const replacement of [
      { ...root, purpose: 'OTHER' },
      { ...root, status: 'REVOKED' as const, revokedAt: instant.toISOString() },
      { ...root, notAfter: '2026-09-26T00:00:00.000Z' },
    ]) {
      await expect(
        new HumanGenesisAuthorizationVerifier({
          resolve: () => Promise.resolve(replacement),
        }).verify(manifest, signature, tenant, executor, instant),
      ).rejects.toThrow('unavailable');
    }
  });

  it('rejects expired and not-yet-valid manifests', async () => {
    const { manifest, signature, verifier } = fixture();
    await expect(
      verifier.verify(manifest, signature, tenant, executor, new Date('2026-09-27T13:00:00.000Z')),
    ).rejects.toThrow('unavailable');
    await expect(
      verifier.verify(manifest, signature, tenant, executor, new Date('2026-09-27T10:30:00.000Z')),
    ).rejects.toThrow('unavailable');
  });

  it('rejects unsigned extra manifest or candidate fields', async () => {
    const { manifest, signature, verifier } = fixture();
    await expect(
      verifier.verify(
        { ...manifest, extra_authority: 'YES' } as HumanGenesisManifest,
        signature,
        tenant,
        executor,
        instant,
      ),
    ).rejects.toThrow('unavailable');
    await expect(
      verifier.verify(
        {
          ...manifest,
          candidates: [
            { ...candidate(manifest, 0), extra_authority: 'YES' },
            ...manifest.candidates.slice(1),
          ],
        } as HumanGenesisManifest,
        signature,
        tenant,
        executor,
        instant,
      ),
    ).rejects.toThrow('unavailable');
  });

  it('rejects unsupported algorithms and root substitution', async () => {
    const { root, manifest, signature } = fixture();
    for (const replacement of [
      { ...root, algorithm: 'RS256' },
      { ...root, trustRootId: 'ACS-HGR-002' },
    ]) {
      await expect(
        new HumanGenesisAuthorizationVerifier({
          resolve: () => Promise.resolve(replacement),
        }).verify(manifest, signature, tenant, executor, instant),
      ).rejects.toThrow('unavailable');
    }
  });
});
