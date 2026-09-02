import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const secondMembership = {
  membership_id: '30000000-0000-4000-8000-0000000000b1',
  status: 'ACTIVE',
  tenant: {
    id: '00000000-0000-4000-8000-000000000022',
    slug: 'tenant-b',
    display_name: 'Tenant B',
  },
};

function contextResponse(membership = response.data.memberships[0]!) {
  return {
    data: {
      user_id: '20000000-0000-4000-8000-000000000001',
      tenant: membership.tenant,
      membership: { status: 'ACTIVE' },
      permissions: ['platform.context.read'],
    },
    meta: response.meta,
  };
}

function Probe() {
  const auth = useBrowserAuth();
  return (
    <>
      <output>{`${auth.authentication}:${auth.membership.kind}:${auth.tenantContext.kind}`}</output>
      <button
        type="button"
        onClick={() => void auth.selectMembership(secondMembership.membership_id)}
      >
        Select Tenant B
      </button>
      <button type="button" onClick={() => void auth.selectMembership('not-server-returned')}>
        Select invalid tenant
      </button>
      <button type="button" onClick={() => void auth.signOut()}>
        Sign out
      </button>
    </>
  );
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
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('restores a usable session and hands it to P1-A membership discovery', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(contextResponse()), { status: 200 }));
    render(
      <AuthProvider
        configuration={configuration}
        manager={managerWith(user)}
        fetchImplementation={fetchImplementation}
      >
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('authenticated:ready:ready')).toBeVisible();
    const [, init] = fetchImplementation.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer opaque-token');
    const [, contextInit] = fetchImplementation.mock.calls[1] as unknown as [URL, RequestInit];
    expect(new Headers(contextInit.headers).get('x-acs-tenant-id')).toBe(
      response.data.memberships[0]!.tenant.id,
    );
  });
  it.each([
    [401, 'session-expired:not-requested:not-requested'],
    [403, 'authenticated:forbidden:not-requested'],
    [503, 'authenticated:unavailable:not-requested'],
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
    expect(
      await screen.findByText('authenticated:no-active-membership:not-requested'),
    ).toBeVisible();
  });
  it('requires explicit selection when more than one active membership exists', async () => {
    const fetchImplementation = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ...response,
            data: { memberships: [response.data.memberships[0], secondMembership] },
          }),
          { status: 200 },
        ),
      ),
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
    expect(await screen.findByText('authenticated:ready:selection-required')).toBeVisible();
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });
  it('hydrates a server-returned selected membership and rejects a fabricated selector', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...response,
            data: { memberships: [response.data.memberships[0], secondMembership] },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(contextResponse(secondMembership)), { status: 200 }),
      );
    const actor = userEvent.setup();
    render(
      <AuthProvider
        configuration={configuration}
        manager={managerWith(user)}
        fetchImplementation={fetchImplementation}
      >
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('authenticated:ready:selection-required');
    await actor.click(screen.getByRole('button', { name: 'Select Tenant B' }));
    expect(await screen.findByText('authenticated:ready:ready')).toBeVisible();
    const [, contextInit] = fetchImplementation.mock.calls[1] as unknown as [URL, RequestInit];
    expect(new Headers(contextInit.headers).get('x-acs-tenant-id')).toBe(
      secondMembership.tenant.id,
    );
    await actor.click(screen.getByRole('button', { name: 'Select invalid tenant' }));
    expect(await screen.findByText('authenticated:ready:selection-required')).toBeVisible();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
  it.each([
    [401, 'session-expired:not-requested:not-requested'],
    [403, 'authenticated:ready:forbidden'],
    [404, 'authenticated:ready:not-found'],
    [503, 'authenticated:ready:unavailable'],
  ] as const)('bounds context HTTP %s and never grants readiness', async (status, expected) => {
    const manager = managerWith(user);
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status }));
    render(
      <AuthProvider
        configuration={configuration}
        manager={manager}
        fetchImplementation={fetchImplementation}
      >
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText(expected)).toBeVisible();
    if (status === 401) await waitFor(() => expect(manager.removeUser).toHaveBeenCalledOnce());
  });
  it('revalidates a session selector before restoring context and clears stale selectors', async () => {
    sessionStorage.setItem('acs.selected-membership-id', secondMembership.membership_id);
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...response,
            data: { memberships: [response.data.memberships[0], secondMembership] },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(contextResponse(secondMembership)), { status: 200 }),
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
    expect(await screen.findByText('authenticated:ready:ready')).toBeVisible();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);

    cleanup();
    sessionStorage.setItem('acs.selected-membership-id', 'stale');
    const staleFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ...response,
            data: { memberships: [response.data.memberships[0], secondMembership] },
          }),
          { status: 200 },
        ),
      ),
    );
    render(
      <AuthProvider
        configuration={configuration}
        manager={managerWith(user)}
        fetchImplementation={staleFetch}
      >
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('authenticated:ready:selection-required')).toBeVisible();
    expect(sessionStorage.getItem('acs.selected-membership-id')).toBeNull();
    expect(staleFetch).toHaveBeenCalledOnce();
  });
  it('clears selected context on logout', async () => {
    const actor = userEvent.setup();
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(contextResponse()), { status: 200 }));
    render(
      <AuthProvider
        configuration={configuration}
        manager={managerWith(user)}
        fetchImplementation={fetchImplementation}
      >
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('authenticated:ready:ready');
    await actor.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('unauthenticated:not-requested:not-requested')).toBeVisible();
    expect(sessionStorage.getItem('acs.selected-membership-id')).toBeNull();
  });
  it('clears selected context when the OIDC session expires', async () => {
    let expire: (() => void) | undefined;
    const manager = {
      ...managerWith(user),
      events: {
        addAccessTokenExpired: vi.fn((listener: () => void) => {
          expire = listener;
        }),
        removeAccessTokenExpired: vi.fn(),
      },
    };
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(contextResponse()), { status: 200 }));
    render(
      <AuthProvider
        configuration={configuration}
        manager={manager}
        fetchImplementation={fetchImplementation}
      >
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('authenticated:ready:ready');
    expire?.();
    expect(await screen.findByText('session-expired:not-requested:not-requested')).toBeVisible();
    expect(sessionStorage.getItem('acs.selected-membership-id')).toBeNull();
  });
  it('rehydrates on a tenant switch and fails closed if the new context is denied', async () => {
    sessionStorage.setItem(
      'acs.selected-membership-id',
      response.data.memberships[0]!.membership_id,
    );
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...response,
            data: { memberships: [response.data.memberships[0], secondMembership] },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(contextResponse()), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    const actor = userEvent.setup();
    render(
      <AuthProvider
        configuration={configuration}
        manager={managerWith(user)}
        fetchImplementation={fetchImplementation}
      >
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('authenticated:ready:ready');
    await actor.click(screen.getByRole('button', { name: 'Select Tenant B' }));
    expect(await screen.findByText('authenticated:ready:forbidden')).toBeVisible();
    expect(sessionStorage.getItem('acs.selected-membership-id')).toBeNull();
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
    expect(await screen.findByText('session-expired:not-requested:not-requested')).toBeVisible();
    await waitFor(() => expect(manager.removeUser).toHaveBeenCalledOnce());
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
