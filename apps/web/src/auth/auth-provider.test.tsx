import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBrowserAuth } from './auth-context.js';
import { AuthProvider } from './auth-provider.js';
import type { OidcRuntimeConfiguration } from './oidc-session.js';

const configuration: OidcRuntimeConfiguration = {
  apiBaseUrl: '/api',
  authority: 'https://idp.acs.local:8443/realms/acs',
  clientId: 'acs-web',
  redirectUri: 'http://localhost/auth/callback',
  postLogoutRedirectUri: 'http://localhost/',
  scope: 'openid profile email',
};
const user = {
  expired: false,
  access_token: 'opaque-token',
  profile: { sub: 'subject-1' },
} as never;
const response = {
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
};

function Probe() {
  const auth = useBrowserAuth();
  return <output>{`${auth.authentication}:${auth.membership.kind}`}</output>;
}
function managerWith(currentUser: unknown) {
  return {
    getUser: vi.fn(() => Promise.resolve(currentUser as never)),
    removeUser: vi.fn(() => Promise.resolve()),
    signinRedirect: vi.fn(() => Promise.resolve()),
    signinRedirectCallback: vi.fn(() => Promise.resolve(currentUser as never)),
    signoutRedirect: vi.fn(() => Promise.resolve()),
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('restores a usable session and hands it to P1-A membership discovery', async () => {
    const fetchImplementation = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(response), { status: 200 })),
    );
    render(
      <AuthProvider
        configuration={configuration}
        manager={managerWith(user)}
        fetchImplementation={fetchImplementation}
      >
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('authenticated:ready')).toBeVisible();
    const [, init] = fetchImplementation.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer opaque-token');
  });
  it.each([
    [401, 'session-expired:not-requested'],
    [403, 'authenticated:forbidden'],
    [503, 'authenticated:unavailable'],
  ] as const)('maps membership HTTP %s to a bounded state', async (status, expected) => {
    render(
      <AuthProvider
        configuration={configuration}
        manager={managerWith(user)}
        fetchImplementation={vi.fn(() => Promise.resolve(new Response('', { status })))}
      >
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText(expected)).toBeVisible();
  });
  it('does not treat zero active memberships as tenant readiness', async () => {
    render(
      <AuthProvider
        configuration={configuration}
        manager={managerWith(user)}
        fetchImplementation={vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({ ...response, data: { memberships: [] } }), {
              status: 200,
            }),
          ),
        )}
      >
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('authenticated:no-active-membership')).toBeVisible();
  });
  it('clears an expired stored user rather than sending its token', async () => {
    const manager = managerWith({
      expired: true,
      access_token: 'opaque-token',
      profile: { sub: 'subject-1' },
    });
    const fetchImplementation = vi.fn();
    render(
      <AuthProvider
        configuration={configuration}
        manager={manager}
        fetchImplementation={fetchImplementation}
      >
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('session-expired:not-requested')).toBeVisible();
    await waitFor(() => expect(manager.removeUser).toHaveBeenCalledOnce());
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
