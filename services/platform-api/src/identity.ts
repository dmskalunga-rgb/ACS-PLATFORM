import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import type { OidcConfiguration } from './config.js';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type TrustedIdentity,
} from './platform-context.js';

export class DevelopmentHeaderIdentityAdapter implements IdentityAdapter {
  readonly configured = true;
  readonly status = 'development-only' as const;

  authenticate(authorizationHeader: string | undefined): Promise<TrustedIdentity | null> {
    if (authorizationHeader === undefined) return Promise.resolve(null);
    const match = /^Bearer dev:(.{1,255})$/.exec(authorizationHeader);
    return Promise.resolve(match?.[1] === undefined ? null : { subject: match[1] });
  }
}

export class NotConfiguredIdentityAdapter implements IdentityAdapter {
  readonly configured = false;
  readonly status = 'not-configured' as const;

  authenticate(): Promise<null> {
    return Promise.resolve(null);
  }
}

export type AuthenticationObservation = Readonly<{
  durationSeconds: number;
  outcome: 'success' | 'failure';
  reason: string;
}>;

export class OidcJwtIdentityAdapter implements IdentityAdapter {
  readonly configured = true;
  private currentStatus: 'available' | 'degraded' | 'unknown' = 'unknown';
  private readonly jwks;

  get status(): 'available' | 'degraded' | 'unknown' {
    return this.currentStatus;
  }

  constructor(
    private readonly configuration: OidcConfiguration,
    private readonly observe: (observation: AuthenticationObservation) => void = () => undefined,
  ) {
    this.jwks = createRemoteJWKSet(new URL(configuration.jwksUri), {
      cacheMaxAge: configuration.jwksCacheMs,
      cooldownDuration: configuration.jwksCooldownMs,
      timeoutDuration: configuration.jwksTimeoutMs,
    });
  }

  async authenticate(authorizationHeader: string | undefined): Promise<TrustedIdentity | null> {
    const started = performance.now();
    const token = parseBearerToken(authorizationHeader);
    if (token === null) {
      this.observeResult(started, 'failure', 'BEARER_TOKEN_MISSING_OR_MALFORMED');
      return null;
    }
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        algorithms: [...this.configuration.allowedAlgorithms],
        audience: this.configuration.audience,
        clockTolerance: this.configuration.clockToleranceSeconds,
        issuer: this.configuration.issuer,
        requiredClaims: ['exp', 'iat', 'sub'],
      });
      if (
        payload.sub === undefined ||
        payload.iss === undefined ||
        payload.iat === undefined ||
        payload.iat > Math.floor(Date.now() / 1000) + this.configuration.clockToleranceSeconds
      ) {
        throw new IdentityAuthenticationError('JWT_REQUIRED_CLAIM_INVALID');
      }
      const amr = Array.isArray(payload.amr)
        ? payload.amr.filter((value): value is string => typeof value === 'string')
        : [];
      this.observeResult(started, 'success', 'JWT_VERIFIED');
      this.currentStatus = 'available';
      return {
        authentication: {
          ...(typeof payload.acr === 'string' ? { acr: payload.acr } : {}),
          amr,
        },
        subject: JSON.stringify([payload.iss, payload.sub]),
      };
    } catch (error) {
      const reason = classifyJwtFailure(error);
      if (reason.startsWith('JWKS_') || reason === 'JWT_VERIFICATION_FAILED') {
        this.currentStatus = 'degraded';
      }
      this.observeResult(started, 'failure', reason);
      throw new IdentityAuthenticationError(reason);
    }
  }

  private observeResult(
    started: number,
    outcome: AuthenticationObservation['outcome'],
    reason: string,
  ): void {
    this.observe({ durationSeconds: (performance.now() - started) / 1000, outcome, reason });
  }
}

function parseBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? null;
}

function classifyJwtFailure(error: unknown): string {
  if (error instanceof IdentityAuthenticationError) return error.reasonCode;
  if (error instanceof errors.JWTExpired) return 'JWT_EXPIRED';
  if (error instanceof errors.JWTClaimValidationFailed) return 'JWT_CLAIM_INVALID';
  if (error instanceof errors.JWSSignatureVerificationFailed) return 'JWT_SIGNATURE_INVALID';
  if (error instanceof errors.JOSEAlgNotAllowed) return 'JWT_ALGORITHM_NOT_ALLOWED';
  if (error instanceof errors.JWKSNoMatchingKey) return 'JWKS_KEY_NOT_FOUND';
  if (error instanceof errors.JWKSTimeout) return 'JWKS_TIMEOUT';
  return 'JWT_VERIFICATION_FAILED';
}
