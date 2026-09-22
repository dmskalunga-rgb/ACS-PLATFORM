import { describe, expect, it } from 'vitest';
import { loadConfiguration } from './config.js';

describe('FOUNDATION configuration', () => {
  it('loads safe defaults without requiring plaintext secrets', () => {
    const configuration = loadConfiguration({});
    expect(configuration.environment).toBe('development');
    expect(configuration.databaseUrl).toBeUndefined();
    expect(configuration.identityMode).toBe('development-header');
  });

  it('fails closed rather than enabling the development identity adapter in production', () => {
    expect(loadConfiguration({ ACS_ENV: 'production' }).identityMode).toBe('not-configured');
    expect(() =>
      loadConfiguration({ ACS_ENV: 'production', ACS_IDENTITY_MODE: 'development-header' }),
    ).toThrow(/prohibited/);
  });

  it('rejects invalid environment values', () => {
    expect(() => loadConfiguration({ ACS_ENV: 'unknown' })).toThrow();
  });

  it('requires complete HTTPS OIDC configuration outside tests', () => {
    expect(() => loadConfiguration({ ACS_ENV: 'production', ACS_IDENTITY_MODE: 'oidc' })).toThrow(
      /requires issuer/,
    );
    expect(() =>
      loadConfiguration({
        ACS_ENV: 'production',
        ACS_IDENTITY_MODE: 'oidc',
        ACS_OIDC_AUDIENCE: 'acs-api',
        ACS_OIDC_ISSUER: 'http://issuer.example',
        ACS_OIDC_JWKS_URI: 'http://issuer.example/jwks',
      }),
    ).toThrow(/HTTPS/);
  });

  it('loads an explicit provider-neutral OIDC contract', () => {
    const configuration = loadConfiguration({
      ACS_ENV: 'production',
      ACS_IDENTITY_MODE: 'oidc',
      ACS_OIDC_ALLOWED_ALGORITHMS: 'RS256,PS256',
      ACS_OIDC_AUDIENCE: 'acs-api',
      ACS_OIDC_ISSUER: 'https://issuer.example',
      ACS_OIDC_JWKS_URI: 'https://issuer.example/.well-known/jwks.json',
    });
    expect(configuration.identityMode).toBe('oidc');
    expect(configuration.oidc?.allowedAlgorithms).toEqual(['RS256', 'PS256']);
  });

  it('binds MPA only through its dedicated database URL', () => {
    const configuration = loadConfiguration({
      ACS_MPA_DATABASE_URL: 'postgresql://mpa.example/acs_test_mpa',
    });
    expect(configuration.mpaDatabaseUrl).toBe('postgresql://mpa.example/acs_test_mpa');
    expect(loadConfiguration({}).mpaDatabaseUrl).toBeUndefined();
  });

  it('fails closed unless the XCAP-005 database and bounded size are configured together', () => {
    expect(() =>
      loadConfiguration({ ACS_XCAP005_EVIDENCE_DATABASE_URL: 'postgresql://xcap005.example/acs' }),
    ).toThrow(/maximum evidence size/);
    const configuration = loadConfiguration({
      ACS_XCAP005_EVIDENCE_DATABASE_URL: 'postgresql://xcap005.example/acs',
      ACS_XCAP005_MAX_EVIDENCE_BYTES: '1048576',
    });
    expect(configuration.xcap005EvidenceDatabaseUrl).toBe('postgresql://xcap005.example/acs');
    expect(configuration.xcap005MaximumEvidenceBytes).toBe(1_048_576);
  });

  it('requires the XCAP-011 dedicated database binding and bounded receipt lifetime together', () => {
    expect(() =>
      loadConfiguration({ ACS_XCAP011_DATABASE_URL: 'postgresql://xcap011.example/acs' }),
    ).toThrow(/bounded receipt lifetime/);
    expect(() =>
      loadConfiguration({
        ACS_XCAP011_DATABASE_URL: 'postgresql://xcap011.example/acs',
        ACS_XCAP011_M0_RECEIPT_LIFETIME_SECONDS: '299',
      }),
    ).toThrow();
    const configuration = loadConfiguration({
      ACS_XCAP011_DATABASE_URL: 'postgresql://xcap011.example/acs',
      ACS_XCAP011_M0_RECEIPT_LIFETIME_SECONDS: '300',
    });
    expect(configuration.xcap011DatabaseUrl).toBe('postgresql://xcap011.example/acs');
    expect(configuration.xcap011ReceiptLifetimeSeconds).toBe(300);
  });

  it('fails closed unless every XCF M1 server-owned runtime binding is present', () => {
    expect(() =>
      loadConfiguration({ ACS_XCF_M1_DATABASE_URL: 'postgresql://xcf.example/acs' }),
    ).toThrow(/governance tenant/);
    expect(() =>
      loadConfiguration({
        ACS_XCF_M1_DATABASE_URL: 'postgresql://xcf.example/acs',
        ACS_XCF_GOVERNANCE_TENANT_ID: '00000000-0000-4000-8000-000000000011',
      }),
    ).toThrow(/maximum artifact size/);
    const trustedKeys = JSON.stringify([
      {
        reference: 'key:nist:1',
        publisherId: '10000000-0000-4000-8000-000000000001',
        algorithm: 'ED25519',
        publicKeyPem: '-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----',
        status: 'TRUSTED',
      },
    ]);
    expect(() =>
      loadConfiguration({
        ACS_XCF_M1_DATABASE_URL: 'postgresql://xcf.example/acs',
        ACS_XCF_GOVERNANCE_TENANT_ID: '00000000-0000-4000-8000-000000000011',
        ACS_XCF_M1_MAX_ARTIFACT_BYTES: '1048576',
      }),
    ).toThrow(/trusted-key/i);

    const configuration = loadConfiguration({
      ACS_XCF_M1_DATABASE_URL: 'postgresql://xcf.example/acs',
      ACS_XCF_GOVERNANCE_TENANT_ID: '00000000-0000-4000-8000-000000000011',
      ACS_XCF_M1_MAX_ARTIFACT_BYTES: '1048576',
      ACS_XCF_M1_TRUSTED_KEYS_JSON: trustedKeys,
    });
    expect(configuration.xcfM1DatabaseUrl).toBe('postgresql://xcf.example/acs');
    expect(configuration.xcfGovernanceTenantId).toBe('00000000-0000-4000-8000-000000000011');
    expect(configuration.xcfM1MaximumArtifactBytes).toBe(1_048_576);
    expect(configuration.xcfM1TrustedKeys).toHaveLength(1);
  });
});
