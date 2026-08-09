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
});
