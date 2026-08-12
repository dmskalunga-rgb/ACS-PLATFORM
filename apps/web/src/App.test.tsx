import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { resolveContextClientConfiguration } from './context-client-configuration.js';

afterEach(() => vi.unstubAllGlobals());

describe('FOUNDATION application shell', () => {
  it('removes development identity configuration from production', () => {
    expect(
      resolveContextClientConfiguration({
        developmentIdentitySubject: 'oidc|must-not-ship',
        isDevelopment: false,
        tenantId: '00000000-0000-4000-8000-000000000011',
      }),
    ).toEqual({});
  });
  it('renders a verified technical API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              component: 'FOUNDATION',
              service: 'acs-platform-api',
              status: 'ok',
              version: '0.0.0-foundation',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    render(<App contextConfiguration={{}} />);
    expect(screen.getByRole('heading', { name: 'Platform Foundation' })).toBeVisible();
    expect(await screen.findByText('acs-platform-api')).toBeVisible();
    expect(screen.getByText('PHASE 1')).toBeVisible();
    expect(screen.getByText(/NOT_CONFIGURED/)).toBeVisible();
  });

  it('shows disconnected state rather than fabricated data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    render(<App contextConfiguration={{}} />);
    expect(await screen.findByText(/Technical service disconnected/)).toBeVisible();
  });

  it('renders only a tenant context returned by the authenticated API', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000011';
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/health')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                component: 'FOUNDATION',
                service: 'acs-platform-api',
                status: 'ok',
                version: '0.0.0-foundation',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                user_id: '10000000-0000-4000-8000-000000000011',
                tenant: { id: tenantId, slug: 'tenant-a', display_name: 'Tenant A' },
                membership: { status: 'ACTIVE' },
                permissions: ['platform.context.read'],
              },
              meta: {
                request_id: '50000000-0000-4000-8000-000000000011',
                correlation_id: '60000000-0000-4000-8000-000000000011',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<App contextConfiguration={{ developmentIdentitySubject: 'oidc|alice', tenantId }} />);
    expect(await screen.findByText('Tenant A')).toBeVisible();
    expect(screen.getByText('platform.context.read')).toBeVisible();
    const contextCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
      ).endsWith('/api/v1/platform/context'),
    );
    expect(contextCall).toBeDefined();
    const headers = new Headers(contextCall?.[1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer dev:oidc|alice');
    expect(headers.get('x-acs-tenant-id')).toBe(tenantId);
  });

  it('uses a production bearer token only in memory and closes the session on logout', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000011';
    const onSignOut = vi.fn();
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        return Promise.resolve(
          new Response(
            JSON.stringify(
              url.endsWith('/health')
                ? {
                    component: 'FOUNDATION',
                    service: 'acs-platform-api',
                    status: 'ok',
                    version: '0.0.0-foundation',
                  }
                : {
                    data: {
                      user_id: '10000000-0000-4000-8000-000000000011',
                      tenant: { id: tenantId, slug: 'tenant-a', display_name: 'Tenant A' },
                      membership: { status: 'ACTIVE' },
                      permissions: ['platform.context.read'],
                    },
                    meta: {
                      request_id: '50000000-0000-4000-8000-000000000011',
                      correlation_id: '60000000-0000-4000-8000-000000000011',
                    },
                  },
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(<App contextConfiguration={{ accessToken: 'signed.jwt.value', onSignOut, tenantId }} />);
    expect(await screen.findByText('Tenant A')).toBeVisible();
    const contextCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith(
        '/api/v1/platform/context',
      ),
    );
    expect(new Headers(contextCall?.[1]?.headers).get('authorization')).toBe(
      'Bearer signed.jwt.value',
    );
    expect(storageSpy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/in-memory session is no longer usable/)).toBeVisible();
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it.each([
    [401, /Session expired/],
    [403, /Access forbidden/],
    [503, /Identity service unavailable/],
  ])('renders the safe authentication state for HTTP %s', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          new Response(
            typeof input === 'string' && input.endsWith('/health')
              ? JSON.stringify({
                  component: 'FOUNDATION',
                  service: 'acs-platform-api',
                  status: 'ok',
                  version: '0.0.0-foundation',
                })
              : undefined,
            { status: typeof input === 'string' && input.endsWith('/health') ? 200 : status },
          ),
        ),
      ),
    );
    render(
      <App
        contextConfiguration={{
          accessToken: 'signed.jwt.value',
          tenantId: '00000000-0000-4000-8000-000000000011',
        }}
      />,
    );
    expect(await screen.findByText(message)).toBeVisible();
  });
});
