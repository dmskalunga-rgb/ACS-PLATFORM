import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, resolveContextClientConfiguration } from './App.js';

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
      vi.fn(async () =>
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
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Platform Foundation' })).toBeVisible();
    expect(await screen.findByText('acs-platform-api')).toBeVisible();
    expect(screen.getByText('PHASE 1')).toBeVisible();
    expect(screen.getByText(/NOT_CONFIGURED/)).toBeVisible();
  });

  it('shows disconnected state rather than fabricated data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    render(<App />);
    expect(await screen.findByText(/Technical service disconnected/)).toBeVisible();
  });

  it('renders only a tenant context returned by the authenticated API', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000011';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            component: 'FOUNDATION',
            service: 'acs-platform-api',
            status: 'ok',
            version: '0.0.0-foundation',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
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
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App contextConfiguration={{ developmentIdentitySubject: 'oidc|alice', tenantId }} />);
    expect(await screen.findByText('Tenant A')).toBeVisible();
    expect(screen.getByText('platform.context.read')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/platform/context'),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer dev:oidc|alice',
          'x-acs-tenant-id': tenantId,
        }),
      }),
    );
  });
});
