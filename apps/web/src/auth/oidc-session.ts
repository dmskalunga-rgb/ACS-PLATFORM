import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

export interface OidcRuntimeConfiguration {
  readonly apiBaseUrl: string;
  readonly authority: string;
  readonly clientId: string;
  readonly postLogoutRedirectUri: string;
  readonly redirectUri: string;
  readonly scope: string;
}

export interface OidcSessionManager {
  readonly events?: {
    addAccessTokenExpired(listener: () => void): void;
    removeAccessTokenExpired(listener: () => void): void;
  };
  getUser(): Promise<User | null>;
  removeUser(): Promise<void>;
  signinRedirect(): Promise<void>;
  signinRedirectCallback(): Promise<User>;
  signoutRedirect(): Promise<void>;
}

type OidcEnvironment = {
  readonly VITE_ACS_API_BASE_URL?: string;
  readonly VITE_ACS_OIDC_CLIENT_ID?: string;
  readonly VITE_ACS_OIDC_ISSUER?: string;
  readonly VITE_ACS_OIDC_POST_LOGOUT_REDIRECT_URI?: string;
  readonly VITE_ACS_OIDC_REDIRECT_URI?: string;
  readonly VITE_ACS_OIDC_SCOPE?: string;
};

export class OidcConfigurationError extends Error {
  public constructor() {
    super('OIDC runtime configuration is incomplete or invalid.');
  }
}

function required(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) throw new OidcConfigurationError();
  return value.trim();
}

function httpsUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OidcConfigurationError();
  }
  if (parsed.protocol !== 'https:') throw new OidcConfigurationError();
  return parsed.toString().replace(/\/$/, '');
}

function redirectUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OidcConfigurationError();
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    throw new OidcConfigurationError();
  return parsed.toString();
}

export function resolveOidcRuntimeConfiguration(
  environment: OidcEnvironment,
): OidcRuntimeConfiguration {
  const scope = environment.VITE_ACS_OIDC_SCOPE?.trim() || 'openid profile email';
  if (!scope.split(/\s+/).includes('openid')) throw new OidcConfigurationError();
  return {
    apiBaseUrl: environment.VITE_ACS_API_BASE_URL?.trim() || '/api',
    authority: httpsUrl(required(environment.VITE_ACS_OIDC_ISSUER)),
    clientId: required(environment.VITE_ACS_OIDC_CLIENT_ID),
    postLogoutRedirectUri: redirectUrl(
      required(environment.VITE_ACS_OIDC_POST_LOGOUT_REDIRECT_URI),
    ),
    redirectUri: redirectUrl(required(environment.VITE_ACS_OIDC_REDIRECT_URI)),
    scope,
  };
}

export function createOidcSessionManager(
  configuration: OidcRuntimeConfiguration,
): OidcSessionManager {
  return new UserManager({
    authority: configuration.authority,
    client_id: configuration.clientId,
    redirect_uri: configuration.redirectUri,
    post_logout_redirect_uri: configuration.postLogoutRedirectUri,
    response_type: 'code',
    scope: configuration.scope,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
}

export function isOidcCallback(
  location: Pick<Location, 'href' | 'pathname'>,
  redirectUri: string,
): boolean {
  const redirect = new URL(redirectUri);
  if (location.pathname !== redirect.pathname) return false;
  const current = new URL(location.href);
  return current.searchParams.has('code') && current.searchParams.has('state');
}

export function isUsableOidcUser(user: User | null): user is User {
  return (
    user !== null &&
    !user.expired &&
    user.access_token.trim().length > 0 &&
    user.profile.sub.length > 0
  );
}
