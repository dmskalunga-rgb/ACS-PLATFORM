import { describe, expect, it, vi } from 'vitest';
import {
  AuthenticatedApiClient,
  AuthenticatedApiClientError,
  classifyApiStatus,
} from './authenticated-api-client.js';

describe('AuthenticatedApiClient', () => {
  it('attaches a bearer only to the same-origin membership request', async () => {
    const fetchImplementation = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    const client = new AuthenticatedApiClient({
      apiBaseUrl: '/api',
      fetchImplementation,
      getAccessToken: () => Promise.resolve('opaque-token'),
      origin: 'http://localhost:5173',
    });
    await client.request('/api/v1/platform/memberships');
    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [target, init] = fetchImplementation.mock.calls[0] as unknown as [URL, RequestInit];
    expect(target.href).toBe('http://localhost:5173/api/api/v1/platform/memberships');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer opaque-token');
  });

  it('fails closed when an API base targets another origin', async () => {
    const client = new AuthenticatedApiClient({
      apiBaseUrl: 'https://other.example/api',
      fetchImplementation: vi.fn(),
      getAccessToken: () => Promise.resolve('opaque-token'),
      origin: 'http://localhost:5173',
    });
    await expect(client.request('/api/v1/platform/memberships')).rejects.toMatchObject({
      kind: 'not-found',
    });
  });

  it.each([
    [401, 'authentication-required'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
    [500, 'server-error'],
    [503, 'unavailable'],
  ] as const)('classifies HTTP %s safely', (status, kind) => {
    expect(classifyApiStatus(status)).toBe(kind);
  });

  it('does not make a request without an access token', async () => {
    const fetchImplementation = vi.fn();
    const client = new AuthenticatedApiClient({
      apiBaseUrl: '/api',
      fetchImplementation,
      getAccessToken: () => Promise.resolve(undefined),
      origin: 'http://localhost:5173',
    });
    await expect(client.request('/api/v1/platform/memberships')).rejects.toBeInstanceOf(
      AuthenticatedApiClientError,
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
