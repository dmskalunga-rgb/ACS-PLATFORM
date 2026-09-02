import { activeMembershipBootstrapSchema, platformContextSchema } from '@acs/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BrowserAuthContext,
  type AuthenticationState,
  type MembershipState,
  type TenantContextState,
} from './auth-context.js';
import { AuthenticatedApiClient, AuthenticatedApiClientError } from './authenticated-api-client.js';
import {
  isOidcCallback,
  isUsableOidcUser,
  type OidcRuntimeConfiguration,
  type OidcSessionManager,
} from './oidc-session.js';

function membershipFailure(error: unknown): MembershipState {
  if (error instanceof AuthenticatedApiClientError) {
    if (error.kind === 'forbidden') return { kind: 'forbidden' };
    if (error.kind === 'authentication-required') return { kind: 'not-requested' };
  }
  return { kind: 'unavailable' };
}

const selectedMembershipStorageKey = 'acs.selected-membership-id';

function contextFailure(error: unknown): TenantContextState {
  if (error instanceof AuthenticatedApiClientError) {
    if (error.kind === 'forbidden') return { kind: 'forbidden' };
    if (error.kind === 'not-found') return { kind: 'not-found' };
  }
  return { kind: 'unavailable' };
}

export function AuthProvider({
  children,
  configuration,
  manager,
  fetchImplementation = fetch,
  location = window.location,
  sessionStorage = window.sessionStorage,
}: {
  readonly children: ReactNode;
  readonly configuration: OidcRuntimeConfiguration;
  readonly manager: OidcSessionManager;
  readonly fetchImplementation?: typeof fetch;
  readonly location?: Location;
  readonly sessionStorage?: Storage;
}) {
  const [authentication, setAuthentication] = useState<AuthenticationState>('loading');
  const [membership, setMembership] = useState<MembershipState>({ kind: 'not-requested' });
  const [tenantContext, setTenantContext] = useState<TenantContextState>({ kind: 'not-requested' });
  const callbackHandled = useRef(false);

  const clearSession = useCallback(
    async (state: AuthenticationState = 'unauthenticated') => {
      setMembership({ kind: 'not-requested' });
      setTenantContext({ kind: 'not-requested' });
      sessionStorage.removeItem(selectedMembershipStorageKey);
      setAuthentication(state);
      await manager.removeUser();
    },
    [manager, sessionStorage],
  );

  const apiClient = useMemo(
    () =>
      new AuthenticatedApiClient({
        apiBaseUrl: configuration.apiBaseUrl,
        fetchImplementation,
        getAccessToken: async () => {
          const currentUser = await manager.getUser();
          return isUsableOidcUser(currentUser) ? currentUser.access_token : undefined;
        },
        origin: location.origin,
      }),
    [configuration.apiBaseUrl, fetchImplementation, location.origin, manager],
  );

  const hydrateContext = useCallback(
    async (selected: {
      readonly membership_id: string;
      readonly tenant: { readonly id: string };
    }) => {
      setTenantContext({ kind: 'loading' });
      sessionStorage.setItem(selectedMembershipStorageKey, selected.membership_id);
      try {
        const response = await apiClient.request('/api/v1/platform/context', {
          headers: { 'x-acs-tenant-id': selected.tenant.id },
        });
        setTenantContext({
          kind: 'ready',
          response: platformContextSchema.parse(await response.json()),
        });
      } catch (error) {
        sessionStorage.removeItem(selectedMembershipStorageKey);
        if (
          error instanceof AuthenticatedApiClientError &&
          error.kind === 'authentication-required'
        ) {
          await clearSession('session-expired');
          return;
        }
        setTenantContext(contextFailure(error));
      }
    },
    [apiClient, clearSession, sessionStorage],
  );

  const bootstrapMembership = useCallback(async () => {
    setMembership({ kind: 'loading' });
    setTenantContext({ kind: 'not-requested' });
    try {
      const response = await apiClient.request('/api/v1/platform/memberships');
      const parsed = activeMembershipBootstrapSchema.parse(await response.json());
      const memberships = parsed.data.memberships;
      if (memberships.length === 0) {
        sessionStorage.removeItem(selectedMembershipStorageKey);
        setMembership({ kind: 'no-active-membership' });
        return;
      }
      setMembership({ kind: 'ready', response: parsed });
      if (memberships.length === 1) {
        const soleMembership = memberships[0];
        if (soleMembership !== undefined) await hydrateContext(soleMembership);
        return;
      }
      const restoredMembershipId = sessionStorage.getItem(selectedMembershipStorageKey);
      const restored = memberships.find(
        (candidate) => candidate.membership_id === restoredMembershipId,
      );
      if (restored !== undefined) {
        await hydrateContext(restored);
        return;
      }
      sessionStorage.removeItem(selectedMembershipStorageKey);
      setTenantContext({ kind: 'selection-required' });
    } catch (error) {
      if (
        error instanceof AuthenticatedApiClientError &&
        error.kind === 'authentication-required'
      ) {
        await clearSession('session-expired');
        return;
      }
      setMembership(membershipFailure(error));
    }
  }, [apiClient, clearSession, hydrateContext, sessionStorage]);

  const establishSession = useCallback(
    async (user: Awaited<ReturnType<OidcSessionManager['getUser']>>) => {
      const expired = user !== null && user.expired;
      if (!isUsableOidcUser(user)) {
        await clearSession(expired ? 'session-expired' : 'unauthenticated');
        return;
      }
      setAuthentication('authenticated');
      await bootstrapMembership();
    },
    [bootstrapMembership, clearSession],
  );

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        if (isOidcCallback(location, configuration.redirectUri)) {
          if (callbackHandled.current) return;
          callbackHandled.current = true;
          setAuthentication('callback-processing');
          await establishSession(await manager.signinRedirectCallback());
          return;
        }
        await establishSession(await manager.getUser());
      } catch {
        if (active) {
          setMembership({ kind: 'not-requested' });
          setAuthentication('error');
        }
      }
    };
    void restore();
    const expired = () => {
      if (active) void clearSession('session-expired');
    };
    manager.events?.addAccessTokenExpired(expired);
    return () => {
      active = false;
      manager.events?.removeAccessTokenExpired(expired);
    };
  }, [clearSession, configuration.redirectUri, establishSession, location, manager]);

  const selectMembership = useCallback(
    async (membershipId: string) => {
      if (membership.kind !== 'ready') return;
      const selected = membership.response.data.memberships.find(
        (candidate) => candidate.membership_id === membershipId,
      );
      if (selected === undefined) {
        sessionStorage.removeItem(selectedMembershipStorageKey);
        setTenantContext({ kind: 'selection-required' });
        return;
      }
      await hydrateContext(selected);
    },
    [hydrateContext, membership, sessionStorage],
  );

  const value = useMemo(
    () => ({
      authentication,
      membership,
      tenantContext,
      signIn: async () => {
        setAuthentication('authenticating');
        try {
          await manager.signinRedirect();
        } catch {
          setAuthentication('error');
        }
      },
      signOut: async () => {
        try {
          await clearSession();
          await manager.signoutRedirect();
        } catch {
          setAuthentication('error');
        }
      },
      selectMembership,
    }),
    [authentication, clearSession, manager, membership, selectMembership, tenantContext],
  );

  return <BrowserAuthContext.Provider value={value}>{children}</BrowserAuthContext.Provider>;
}
