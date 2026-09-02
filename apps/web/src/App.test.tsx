import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
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

describe('P1-B application shell', () => {
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
