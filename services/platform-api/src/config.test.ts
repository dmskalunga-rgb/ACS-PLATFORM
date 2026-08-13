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
});
