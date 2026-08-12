import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OidcConfiguration } from './config.js';
import { OidcJwtIdentityAdapter } from './identity.js';

const issuer = 'https://issuer.acs.test';
const audience = 'acs-platform-api';
type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

describe('OIDC JWT identity adapter', () => {
  let server: Server;
  let jwksUri: string;
  let privateKey: SigningKey;
  let publicJwk: Record<string, unknown>;
  let requestCount: number;
  let responseDelay: number;
  let malformedJwks: boolean;

  beforeEach(async () => {
    requestCount = 0;
    responseDelay = 0;
    malformedJwks = false;
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    publicJwk = { ...(await exportJWK(pair.publicKey)), alg: 'RS256', kid: 'current', use: 'sig' };
    server = createServer((_request, response) => {
      requestCount += 1;
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(malformedJwks ? '{"keys":"invalid"}' : JSON.stringify({ keys: [publicJwk] }));
      }, responseDelay);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('test server unavailable');
    jwksUri = `http://127.0.0.1:${address.port}/jwks`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  });

  function adapter(overrides: Partial<OidcConfiguration> = {}) {
    return new OidcJwtIdentityAdapter({
      allowedAlgorithms: ['RS256'],
      audience,
      clockToleranceSeconds: 0,
      issuer,
      jwksCacheMs: 60_000,
      jwksCooldownMs: 1_000,
      jwksTimeoutMs: 1_000,
      jwksUri,
      ...overrides,
    });
  }

  async function token(
    claims: Record<string, unknown> = {},
    key: SigningKey = privateKey,
    protectedHeader: { alg: string; kid?: string } = { alg: 'RS256', kid: 'current' },
  ) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      acr: 'urn:mfa',
      amr: ['pwd', 'otp'],
      aud: audience,
      exp: now + 300,
      iat: now,
      iss: issuer,
      sub: 'alice',
      ...claims,
    })
      .setProtectedHeader(protectedHeader)
      .sign(key);
  }

  it('validates signature and claims and maps the immutable issuer/subject identity', async () => {
    const identity = await adapter().authenticate(`Bearer ${await token()}`);
    expect(identity).toEqual({
      authentication: { acr: 'urn:mfa', amr: ['pwd', 'otp'] },
      subject: JSON.stringify([issuer, 'alice']),
    });
  });

  it('rejects malformed, expired, future nbf, wrong issuer/audience, future iat and missing sub', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(adapter().authenticate('Bearer malformed')).rejects.toMatchObject({
      reasonCode: 'JWT_VERIFICATION_FAILED',
    });
    await expect(
      adapter().authenticate(`Bearer ${await token({ exp: now - 10 })}`),
    ).rejects.toMatchObject({ reasonCode: 'JWT_EXPIRED' });
    await expect(
      adapter().authenticate(`Bearer ${await token({ nbf: now + 120 })}`),
    ).rejects.toMatchObject({ reasonCode: 'JWT_CLAIM_INVALID' });
    await expect(
      adapter().authenticate(`Bearer ${await token({ iss: 'https://evil.example' })}`),
    ).rejects.toMatchObject({ reasonCode: 'JWT_CLAIM_INVALID' });
    await expect(
      adapter().authenticate(`Bearer ${await token({ aud: 'other-api' })}`),
    ).rejects.toMatchObject({ reasonCode: 'JWT_CLAIM_INVALID' });
    await expect(
      adapter().authenticate(`Bearer ${await token({ iat: now + 120 })}`),
    ).rejects.toMatchObject({ reasonCode: 'JWT_REQUIRED_CLAIM_INVALID' });
    const withoutSubject = new SignJWT({
      aud: audience,
      exp: now + 300,
      iat: now,
      iss: issuer,
    }).setProtectedHeader({ alg: 'RS256', kid: 'current' });
    await expect(
      adapter().authenticate(`Bearer ${await withoutSubject.sign(privateKey)}`),
    ).rejects.toMatchObject({ reasonCode: 'JWT_CLAIM_INVALID' });
  });

  it('rejects untrusted keys, unsigned tokens, HMAC confusion, and disallowed algorithms', async () => {
    const other = await generateKeyPair('RS256');
    await expect(
      adapter().authenticate(`Bearer ${await token({}, other.privateKey)}`),
    ).rejects.toMatchObject({ reasonCode: 'JWT_SIGNATURE_INVALID' });
    const ps = await generateKeyPair('PS256');
    await expect(
      adapter().authenticate(
        `Bearer ${await token({}, ps.privateKey, { alg: 'PS256', kid: 'ps' })}`,
      ),
    ).rejects.toMatchObject({ reasonCode: 'JWT_ALGORITHM_NOT_ALLOWED' });
    const payload = Buffer.from(
      JSON.stringify({ aud: audience, iss: issuer, sub: 'alice' }),
    ).toString('base64url');
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${payload}.`;
    await expect(adapter().authenticate(`Bearer ${unsigned}`)).rejects.toMatchObject({
      reasonCode: 'JWT_ALGORITHM_NOT_ALLOWED',
    });
    const hmac = await new SignJWT({
      aud: audience,
      exp: 4_102_444_800,
      iat: 1,
      iss: issuer,
      sub: 'alice',
    })
      .setProtectedHeader({ alg: 'HS256', kid: 'attacker' })
      .sign(new TextEncoder().encode('attacker-controlled-key-material'));
    await expect(adapter().authenticate(`Bearer ${hmac}`)).rejects.toMatchObject({
      reasonCode: 'JWT_ALGORITHM_NOT_ALLOWED',
    });
  });

  it('keeps identical subjects distinct across trusted issuers', async () => {
    const otherIssuer = 'https://other-issuer.acs.test';
    const first = await adapter().authenticate(`Bearer ${await token()}`);
    const second = await adapter({ issuer: otherIssuer }).authenticate(
      `Bearer ${await token({ iss: otherIssuer })}`,
    );
    expect(first?.subject).not.toBe(second?.subject);
    expect(second?.subject).toBe(JSON.stringify([otherIssuer, 'alice']));
  });

  it('refreshes JWKS for a legitimate key rotation and rejects malformed JWKS', async () => {
    const rotatingAdapter = adapter({ jwksCooldownMs: 0 });
    await rotatingAdapter.authenticate(`Bearer ${await token()}`);
    const rotated = await generateKeyPair('RS256');
    privateKey = rotated.privateKey;
    publicJwk = {
      ...(await exportJWK(rotated.publicKey)),
      alg: 'RS256',
      kid: 'rotated',
      use: 'sig',
    };
    await expect(
      rotatingAdapter.authenticate(
        `Bearer ${await token({}, rotated.privateKey, { alg: 'RS256', kid: 'rotated' })}`,
      ),
    ).resolves.toMatchObject({ subject: JSON.stringify([issuer, 'alice']) });
    expect(requestCount).toBe(2);

    malformedJwks = true;
    await expect(
      adapter({ jwksCooldownMs: 0 }).authenticate(
        `Bearer ${await token({}, rotated.privateKey, { alg: 'RS256', kid: 'rotated' })}`,
      ),
    ).rejects.toMatchObject({ reasonCode: 'JWT_VERIFICATION_FAILED' });
  });

  it('caches JWKS across validations and fails closed on timeout', async () => {
    const cachedAdapter = adapter();
    await cachedAdapter.authenticate(`Bearer ${await token()}`);
    await cachedAdapter.authenticate(`Bearer ${await token()}`);
    expect(requestCount).toBe(1);
    responseDelay = 250;
    await expect(
      adapter({ jwksTimeoutMs: 100 }).authenticate(`Bearer ${await token()}`),
    ).rejects.toMatchObject({ reasonCode: 'JWKS_TIMEOUT' });
  });

  it('keeps cached-key verification bounded under concurrent load', async () => {
    const cachedAdapter = adapter();
    const signed = await token();
    await cachedAdapter.authenticate(`Bearer ${signed}`);
    const started = performance.now();
    const identities = await Promise.all(
      Array.from({ length: 50 }, () => cachedAdapter.authenticate(`Bearer ${signed}`)),
    );
    expect(identities).toHaveLength(50);
    expect(requestCount).toBe(1);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
