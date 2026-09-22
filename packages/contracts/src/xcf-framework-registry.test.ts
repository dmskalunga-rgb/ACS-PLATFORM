import { describe, expect, it } from 'vitest';
import {
  xcfFrameworkReleaseIngestSchema,
  xcfFrameworkSourceCreateSchema,
  xcfProtectedTransitionSchema,
} from './xcf-framework-registry.js';

describe('XCF M1 Framework Registry contracts', () => {
  const source = {
    publisher_id: '10000000-0000-4000-8000-000000000001',
    framework_key: 'nist.csf',
    framework_name: 'NIST CSF',
    canonical_uri: 'https://example.test/nist/csf',
    allowed_uri_prefixes: ['https://example.test/nist/'],
    source_format: 'JSON',
    authentication_method: 'SIGNED',
    signature_policy: 'DETACHED_ED25519',
    trusted_key_reference: 'key:nist:1',
    hash_algorithm: 'SHA-256' as const,
    license: 'PUBLIC-DOMAIN',
    license_version: '1.0',
    license_state: 'ACTIVE',
    license_allowed_use: 'ACS_INTERNAL',
    license_activation_compatible: true,
    redistribution_constraints: 'NONE',
    review_due_at: '2027-01-01T00:00:00Z',
  };

  it('accepts a bounded HTTPS source contract', () => {
    expect(xcfFrameworkSourceCreateSchema.parse(source).framework_key).toBe('nist.csf');
  });

  it('rejects non-HTTPS source authority', () => {
    expect(() =>
      xcfFrameworkSourceCreateSchema.parse({ ...source, canonical_uri: 'file:///tmp/csf.json' }),
    ).toThrow();
  });

  it('accepts only detached signature material, never caller-declared verification results', () => {
    const parsed = xcfFrameworkReleaseIngestSchema.parse({
      source_id: source.publisher_id,
      release_version: '2.0',
      released_at: '2026-09-01T00:00:00Z',
      artifact_uri: 'https://example.test/nist/csf/2.0.json',
      signature_algorithm: 'ED25519',
      signature_base64: 'c2lnbmF0dXJl',
      validation_policy_version: '1.0.0',
    });
    expect(parsed.signature_algorithm).toBe('ED25519');
    expect(parsed).not.toHaveProperty('signature_result');
    expect(parsed).not.toHaveProperty('artifact_bytes_base64');
    expect(parsed).not.toHaveProperty('objects');
  });

  it('binds protected transitions to canonical MPA state', () => {
    expect(
      xcfProtectedTransitionSchema.parse({
        expected_version: 1,
        reason_reference: 'change:42',
        authorization_id: '10000000-0000-4000-8000-000000000002',
        authorization_expected_version: 3,
        attestation_reference: 'attestation:42',
      }).authorization_expected_version,
    ).toBe(3);
  });
});
