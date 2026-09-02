import { activeMembershipBootstrapSchema } from '@acs/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BrowserAuthContext,
  type AuthenticationState,
  type MembershipState,
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

export function AuthProvider({
  children,
  configuration,
  manager,
  fetchImplementation = fetch,
  location = window.location,
}: {
  readonly children: ReactNode;
  readonly configuration: OidcRuntimeConfiguration;
  readonly manager: OidcSessionManager;
  readonly fetchImplementation?: typeof fetch;
  readonly location?: Location;
}) {
  const [authentication, setAuthentication] = useState<AuthenticationState>('loading');
  const [membership, setMembership] = useState<MembershipState>({ kind: 'not-requested' });
  const callbackHandled = useRef(false);

  const clearSession = useCallback(
    async (state: AuthenticationState = 'unauthenticated') => {
      setMembership({ kind: 'not-requested' });
      setAuthentication(state);
      await manager.removeUser();
    },
    [manager],
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

  const bootstrapMembership = useCallback(async () => {
    setMembership({ kind: 'loading' });
    try {
      const response = await apiClient.request('/api/v1/platform/memberships');
      const parsed = activeMembershipBootstrapSchema.parse(await response.json());
      setMembership(
        parsed.data.memberships.length === 0
          ? { kind: 'no-active-membership' }
          : { kind: 'ready', response: parsed },
      );
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
  }, [apiClient, clearSession]);

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

  const value = useMemo(
    () => ({
      authentication,
      membership,
      signIn: async () => {
        setAuthentication('authenticating');
        try {
          await manager.signinRedirect();
        } catch {
          setAuthentication('error');
        }
      },
      signOut: async () => {
        setMembership({ kind: 'not-requested' });
        setAuthentication('unauthenticated');
        try {
          await manager.removeUser();
          await manager.signoutRedirect();
        } catch {
          setAuthentication('error');
        }
      },
    }),
    [authentication, manager, membership],
  );

  return <BrowserAuthContext.Provider value={value}>{children}</BrowserAuthContext.Provider>;
}
