export interface ContextClientConfiguration {
  readonly apiBaseUrl: string;
}

export interface OidcRuntimeEnvironment {
  readonly VITE_ACS_API_BASE_URL?: string | undefined;
  readonly VITE_ACS_OIDC_CLIENT_ID?: string | undefined;
  readonly VITE_ACS_OIDC_ISSUER?: string | undefined;
  readonly VITE_ACS_OIDC_POST_LOGOUT_REDIRECT_URI?: string | undefined;
  readonly VITE_ACS_OIDC_REDIRECT_URI?: string | undefined;
  readonly VITE_ACS_OIDC_SCOPE?: string | undefined;
}

/**
 * Retains only browser configuration that is permitted in the production OIDC
 * dependency graph. Do not pass `import.meta.env` itself to runtime code: Vite
 * materializes every referenced VITE_* value in that object.
 */
export function allowOidcRuntimeEnvironment(input: OidcRuntimeEnvironment): OidcRuntimeEnvironment {
  return {
    VITE_ACS_API_BASE_URL: input.VITE_ACS_API_BASE_URL,
    VITE_ACS_OIDC_CLIENT_ID: input.VITE_ACS_OIDC_CLIENT_ID,
    VITE_ACS_OIDC_ISSUER: input.VITE_ACS_OIDC_ISSUER,
    VITE_ACS_OIDC_POST_LOGOUT_REDIRECT_URI: input.VITE_ACS_OIDC_POST_LOGOUT_REDIRECT_URI,
    VITE_ACS_OIDC_REDIRECT_URI: input.VITE_ACS_OIDC_REDIRECT_URI,
    VITE_ACS_OIDC_SCOPE: input.VITE_ACS_OIDC_SCOPE,
  };
}

/** Production configuration intentionally references only the OIDC/API allowlist. */
export function productionOidcRuntimeEnvironment(): OidcRuntimeEnvironment {
  return allowOidcRuntimeEnvironment({
    VITE_ACS_API_BASE_URL: import.meta.env.VITE_ACS_API_BASE_URL,
    VITE_ACS_OIDC_CLIENT_ID: import.meta.env.VITE_ACS_OIDC_CLIENT_ID,
    VITE_ACS_OIDC_ISSUER: import.meta.env.VITE_ACS_OIDC_ISSUER,
    VITE_ACS_OIDC_POST_LOGOUT_REDIRECT_URI: import.meta.env.VITE_ACS_OIDC_POST_LOGOUT_REDIRECT_URI,
    VITE_ACS_OIDC_REDIRECT_URI: import.meta.env.VITE_ACS_OIDC_REDIRECT_URI,
    VITE_ACS_OIDC_SCOPE: import.meta.env.VITE_ACS_OIDC_SCOPE,
  });
}

/** The browser only accepts a same-origin API base; Vite forwards `/api` locally. */
export function resolveContextClientConfiguration(input: {
  readonly apiBaseUrl?: string;
}): ContextClientConfiguration {
  const apiBaseUrl = input.apiBaseUrl?.trim() || '/api';
  if (!apiBaseUrl.startsWith('/') || apiBaseUrl.startsWith('//')) {
    throw new Error('The browser API base must be a same-origin relative path.');
  }
  return { apiBaseUrl: apiBaseUrl.replace(/\/$/, '') };
}
