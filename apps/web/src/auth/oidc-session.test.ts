import { describe, expect, it } from 'vitest';
import {
  OidcConfigurationError,
  isOidcCallback,
  resolveOidcRuntimeConfiguration,
} from './oidc-session.js';

describe('OIDC runtime configuration', () => {
  const environment = {
    VITE_ACS_OIDC_ISSUER: 'https://idp.acs.local:8443/realms/acs',
    VITE_ACS_OIDC_CLIENT_ID: 'acs-web',
    VITE_ACS_OIDC_REDIRECT_URI: 'http://localhost:5173/auth/callback',
    VITE_ACS_OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:5173/',
  };
  it('uses authorization code OIDC configuration with a relative API base', () => {
    expect(resolveOidcRuntimeConfiguration(environment)).toMatchObject({
      apiBaseUrl: '/api',
      scope: 'openid profile email',
    });
  });
  it('fails closed for absent issuer configuration', () => {
    const missingIssuer = { ...environment } as Partial<typeof environment>;
    delete missingIssuer.VITE_ACS_OIDC_ISSUER;
    expect(() => resolveOidcRuntimeConfiguration(missingIssuer)).toThrow(OidcConfigurationError);
  });
  it('recognizes only a code-and-state callback at the configured path', () => {
    expect(
      isOidcCallback(
        {
          href: 'http://localhost:5173/auth/callback?code=x&state=y',
          pathname: '/auth/callback',
        },
        environment.VITE_ACS_OIDC_REDIRECT_URI,
      ),
    ).toBe(true);
    expect(
      isOidcCallback(
        { href: 'http://localhost:5173/?code=x&state=y', pathname: '/' },
        environment.VITE_ACS_OIDC_REDIRECT_URI,
      ),
    ).toBe(false);
  });
});
