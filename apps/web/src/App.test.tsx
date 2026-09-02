import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { BrowserAuthContext } from './auth/auth-context.js';
import { AuthProvider } from './auth/auth-provider.js';
import type { OidcRuntimeConfiguration, OidcSessionManager } from './auth/oidc-session.js';

const configuration: OidcRuntimeConfiguration = {
  apiBaseUrl: '/api',
  authority: 'https://idp.acs.local:8443/realms/acs',
  clientId: 'acs-web',
  redirectUri: 'http://localhost/auth/callback',
  postLogoutRedirectUri: 'http://localhost/',
  scope: 'openid profile email',
};

const anonymousManager: OidcSessionManager = {
  getUser: vi.fn(() => Promise.resolve(null)),
  removeUser: vi.fn(() => Promise.resolve()),
  signinRedirect: vi.fn(() => Promise.resolve()),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(() => Promise.resolve()),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('P1-C application shell', () => {
  it('does not render a tenant as application-ready before server context hydration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              component: 'FOUNDATION',
              service: 'acs-platform-api',
              status: 'ok',
              version: '1',
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(
      <BrowserAuthContext.Provider
        value={{
          authentication: 'authenticated',
          membership: {
            kind: 'ready',
            response: {
              data: {
                memberships: [
                  {
                    membership_id: '30000000-0000-4000-8000-0000000000a1',
                    status: 'ACTIVE',
                    tenant: {
                      id: '00000000-0000-4000-8000-000000000011',
                      slug: 'tenant-a',
                      display_name: 'Tenant A',
                    },
                  },
                ],
              },
              meta: {
                request_id: '50000000-0000-4000-8000-000000000011',
                correlation_id: '60000000-0000-4000-8000-000000000011',
              },
            },
          },
          tenantContext: { kind: 'loading' },
          signIn: vi.fn(),
          signOut: vi.fn(),
          selectMembership: vi.fn(),
        }}
      >
        <App />
      </BrowserAuthContext.Provider>,
    );
    expect(await screen.findByText('Establishing server-authorized tenant context…')).toBeVisible();
    expect(screen.queryByText('Tenant A')).not.toBeInTheDocument();
  });

  it('does not render tenant data before authenticated membership readiness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              component: 'FOUNDATION',
              service: 'acs-platform-api',
              status: 'ok',
              version: '1',
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(
      <AuthProvider configuration={configuration} manager={anonymousManager}>
        <App />
      </AuthProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(screen.queryByText('Tenant A')).not.toBeInTheDocument();
  });

  it('keeps health evidence separate from authentication readiness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    render(
      <AuthProvider configuration={configuration} manager={anonymousManager}>
        <App />
      </AuthProvider>,
    );
    expect(await screen.findByText(/Technical service disconnected/)).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
