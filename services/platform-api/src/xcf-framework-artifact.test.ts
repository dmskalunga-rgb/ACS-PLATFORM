import { generateKeyPairSync, sign } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FetchXcfArtifactAcquisition,
  XcfFrameworkArtifactValidator,
  type XcfAcquiredArtifact,
  type XcfSourceIngestionPolicy,
  type XcfTrustedKey,
} from './xcf-framework-artifact.js';

const publisherId = '10000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000002';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const policy: XcfSourceIngestionPolicy = {
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
};

const trustedKey: XcfTrustedKey = {
  reference: 'key:nist:1',
  publisherId,
  algorithm: 'ED25519',
  publicKeyPem,
  status: 'TRUSTED',
};

function artifact(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      schema_version: '1.0',
      publisher_id: publisherId,
      source_id: sourceId,
      release_version: '2.0',
      license: { identity: 'PUBLIC-DOMAIN', version: '1.0' },
      objects: [{ external_id: 'GV.OC-01', object_type: 'CONTROL', payload: { title: 'Govern' } }],
      ...overrides,
    }),
  );
}

function command(bytes: Buffer, overrides: Record<string, unknown> = {}) {
  return {
    source_id: sourceId,
    release_version: '2.0',
    released_at: '2026-09-01T00:00:00Z',
    artifact_uri: 'https://example.test/csf.json',
    signature_algorithm: 'ED25519' as const,
    signature_base64: sign(null, bytes, privateKey).toString('base64'),
    validation_policy_version: '1.0.0',
    ...overrides,
  };
}

function acquired(bytes: Buffer, mediaType = 'application/json'): XcfAcquiredArtifact {
  return {
    bytes,
    mediaType,
    finalUri: 'https://example.test/csf.json',
    retrievedAt: new Date('2026-09-02T00:00:00Z'),
  };
}

function validator(key: XcfTrustedKey | null = trustedKey, maximum = 1024 * 1024) {
  return new XcfFrameworkArtifactValidator({ resolve: () => Promise.resolve(key) }, maximum);
}

describe('XCF M1 canonical artifact validation', () => {
  it('verifies signature and derives canonical objects from authoritative bytes', async () => {
    const bytes = artifact();
    const result = await validator().validate(policy, command(bytes), acquired(bytes));
    expect(result.quarantineReason).toBeUndefined();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]?.external_id).toBe('GV.OC-01');
    expect(result.objects[0]?.object_type).toBe('CONTROL');
    expect(result.objects[0]?.canonical_payload_sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it.each([
    ['unknown key', null, 'TRUSTED_KEY_UNKNOWN'],
    ['revoked key', { ...trustedKey, status: 'REVOKED' }, 'TRUSTED_KEY_UNTRUSTED'],
    ['publisher/key mismatch', { ...trustedKey, publisherId: sourceId }, 'PUBLISHER_KEY_MISMATCH'],
  ] as const)('fails closed for %s', async (_label, key, expected) => {
    const bytes = artifact();
    const result = await validator(key).validate(policy, command(bytes), acquired(bytes));
    expect(result.quarantineReason).toBe(expected);
    expect(result.objects).toHaveLength(0);
  });

  it('rejects unsupported or substituted signature algorithms', async () => {
    const bytes = artifact();
    const result = await validator().validate(
      policy,
      command(bytes, { signature_algorithm: 'RSA-SHA256' }),
      acquired(bytes),
    );
    expect(result.quarantineReason).toBe('SIGNATURE_ALGORITHM_UNSUPPORTED');
  });

  it('rejects malformed and mismatched signatures before parsing', async () => {
    const bytes = artifact();
    const malformed = await validator().validate(
      policy,
      command(bytes, { signature_base64: 'not-base64!' }),
      acquired(bytes),
    );
    const substituted = await validator().validate(
      policy,
      command(bytes),
      acquired(Buffer.from('{}')),
    );
    expect(malformed.quarantineReason).toBe('SIGNATURE_INVALID');
    expect(substituted.quarantineReason).toBe('SIGNATURE_INVALID');
  });

  it('rejects canonical hash substitution', async () => {
    const bytes = artifact();
    const result = await validator().validate(
      policy,
      command(bytes, { expected_sha256: '0'.repeat(64) }),
      acquired(bytes),
    );
    expect(result.quarantineReason).toBe('HASH_MISMATCH');
  });

  it.each([
    ['unexpected content type', artifact(), 'text/html', 'MEDIA_TYPE_UNSUPPORTED'],
    ['truncated JSON', Buffer.from('{"schema_version":'), 'application/json', 'PARSER_INVALID'],
    ['schema confusion', artifact({ schema_version: '0.9' }), 'application/json', 'SCHEMA_INVALID'],
    ['source spoofing', artifact({ source_id: publisherId }), 'application/json', 'SCHEMA_INVALID'],
  ] as const)('quarantines %s', async (_label, bytes, mediaType, expected) => {
    const result = await validator().validate(policy, command(bytes), acquired(bytes, mediaType));
    expect(result.quarantineReason).toBe(expected);
    expect(result.objects).toHaveLength(0);
  });

  it('rejects duplicate object identifiers and excessive nesting', async () => {
    const duplicate = artifact({
      objects: [
        { external_id: 'A', object_type: 'CONTROL', payload: {} },
        { external_id: 'A', object_type: 'CONTROL', payload: {} },
      ],
    });
    const deeplyNested = Buffer.from(
      `{"schema_version":"1.0","publisher_id":"${publisherId}","source_id":"${sourceId}","release_version":"2.0","license":{"identity":"PUBLIC-DOMAIN","version":"1.0"},"objects":[{"external_id":"A","object_type":"CONTROL","payload":${'['.repeat(20)}0${']'.repeat(20)}}]}`,
    );
    expect(
      (await validator().validate(policy, command(duplicate), acquired(duplicate)))
        .quarantineReason,
    ).toBe('SCHEMA_INVALID');
    expect(
      (await validator().validate(policy, command(deeplyNested), acquired(deeplyNested)))
        .quarantineReason,
    ).toBe('PARSER_INVALID');
  });

  it('bounds object-count exhaustion and keeps prototype-looking payload keys inert', async () => {
    const excessive = artifact({
      objects: Array.from({ length: 20_001 }, (_, index) => ({
        external_id: `CONTROL-${index}`,
        object_type: 'CONTROL',
        payload: {},
      })),
    });
    const excessiveResult = await validator(trustedKey, 4 * 1024 * 1024).validate(
      policy,
      command(excessive),
      acquired(excessive),
    );
    expect(excessiveResult.quarantineReason).toBe('SCHEMA_INVALID');

    const injection = Buffer.from(
      `{"schema_version":"1.0","publisher_id":"${publisherId}","source_id":"${sourceId}","release_version":"2.0","license":{"identity":"PUBLIC-DOMAIN","version":"1.0"},"objects":[{"external_id":"A","object_type":"CONTROL","payload":{"__proto__":{"polluted":true}}}]}`,
    );
    const injectionResult = await validator().validate(
      policy,
      command(injection),
      acquired(injection),
    );
    expect(injectionResult.quarantineReason).toBeUndefined();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(injectionResult.objects[0]?.canonical_payload_sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects decompression bombs and truncated compressed input', async () => {
    const expanded = artifact({ objects: [], padding: 'A'.repeat(10_000) });
    const compressed = gzipSync(expanded);
    const bomb = await validator(trustedKey, 1024).validate(
      policy,
      command(compressed),
      acquired(compressed, 'application/gzip'),
    );
    const truncatedBytes = compressed.subarray(0, Math.floor(compressed.length / 2));
    const truncated = await validator().validate(
      policy,
      command(truncatedBytes),
      acquired(truncatedBytes, 'application/gzip'),
    );
    expect(bomb.quarantineReason).toBe('DECOMPRESSION_LIMIT');
    expect(truncated.quarantineReason).toBe('DECOMPRESSION_LIMIT');
  });

  it('revalidates the governed license identity, version and active compatibility', async () => {
    const bytes = artifact();
    const changed = await validator().validate(
      { ...policy, licenseVersion: '2.0' },
      command(bytes),
      acquired(bytes),
    );
    const revoked = await validator().validate(
      { ...policy, licenseState: 'REVOKED' },
      command(bytes),
      acquired(bytes),
    );
    const incompatible = await validator().validate(
      { ...policy, licenseActivationCompatible: false },
      command(bytes),
      acquired(bytes),
    );
    expect(changed.quarantineReason).toBe('LICENSE_INVALID');
    expect(revoked.quarantineReason).toBe('LICENSE_INVALID');
    expect(incompatible.quarantineReason).toBe('LICENSE_INVALID');
  });
});

describe('XCF M1 bounded HTTPS acquisition', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects non-HTTPS, HTTP failure, partial downloads and oversized responses', async () => {
    const acquisition = new FetchXcfArtifactAcquisition(4, 100);
    await expect(acquisition.acquire('http://example.test/a')).rejects.toMatchObject({
      code: 'INVALID_CONTENT',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })));
    await expect(acquisition.acquire('https://example.test/a')).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('abc', { status: 200, headers: { 'content-length': '4' } }),
        ),
    );
    await expect(acquisition.acquire('https://example.test/a')).rejects.toMatchObject({
      code: 'PARTIAL_DOWNLOAD',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('abcde', { status: 200, headers: { 'content-length': '5' } }),
        ),
    );
    await expect(acquisition.acquire('https://example.test/a')).rejects.toMatchObject({
      code: 'CONTENT_TOO_LARGE',
    });
  });

  it('classifies an aborted acquisition as a bounded timeout', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));
    await expect(
      new FetchXcfArtifactAcquisition(1024, 10).acquire('https://example.test/a'),
    ).rejects.toMatchObject({ code: 'ACQUISITION_TIMEOUT' });
  });

  it('rejects a redirected final URI even when the response otherwise succeeds', async () => {
    const response = new Response('abc', {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-length': '3' },
    });
    Object.defineProperty(response, 'url', { value: 'https://redirected.example.test/a' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(
      new FetchXcfArtifactAcquisition(1024, 100).acquire('https://example.test/a'),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
  });
});
