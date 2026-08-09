import { describe, expect, it } from 'vitest';
import { loadConfiguration } from './config.js';

describe('FOUNDATION configuration', () => {
  it('loads safe defaults without requiring plaintext secrets', () => {
    const configuration = loadConfiguration({});
    expect(configuration.environment).toBe('development');
    expect(configuration.databaseUrl).toBeUndefined();
  });

  it('rejects invalid environment values', () => {
    expect(() => loadConfiguration({ ACS_ENV: 'unknown' })).toThrow();
  });
});
