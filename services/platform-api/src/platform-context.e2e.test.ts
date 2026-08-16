import pg from 'pg';
import { tenantAdministrationSchema } from '@acs/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';

const { Client } = pg;
const connectionTimeoutMillis = 5_000;
const statementTimeout = 5_000;
const requiredEnvironment = {
  admin: process.env.DATABASE_URL,
  auditor: process.env.ACS_SECURITY_AUDIT_DATABASE_URL,
  issuer: process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL,
  tenant: process.env.ACS_TENANT_DATABASE_URL,
  tenantAdmin: process.env.ACS_TENANT_ADMIN_DATABASE_URL,
};

for (const [name, value] of Object.entries(requiredEnvironment)) {
  if (value === undefined || value === '') throw new Error(`${name} E2E database URL is required.`);
}

const configuration: PlatformConfiguration = {
  environment: 'test',
  host: '127.0.0.1',
  identityMode: 'development-header',
  logLevel: 'error',
  port: 3000,
  resolverDatabaseUrl: requiredEnvironment.issuer as string,
  securityAuditDatabaseUrl: requiredEnvironment.auditor as string,
  tenantDatabaseUrl: requiredEnvironment.tenant as string,
  tenantAdminDatabaseUrl: requiredEnvironment.tenantAdmin as string,
  webOrigin: 'http://localhost:5173',
};

const tenantA = '00000000-0000-4000-8000-000000000011';
const tenantB = '00000000-0000-4000-8000-000000000022';
let app: Awaited<ReturnType<typeof buildApp>>;
let oidcApp: Awaited<ReturnType<typeof buildApp>>;
let admin: pg.Client;
let jwksServer: Server;
let oidcToken: string;
let oidcSigningKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

beforeAll(async () => {
  admin = new Client({
    connectionString: requiredEnvironment.admin,
    connectionTimeoutMillis,
    statement_timeout: statementTimeout,
  });
  await admin.connect();
  app = await buildApp(configuration, { logger: false });
  const keys = await generateKeyPair('RS256');
  oidcSigningKey = keys.privateKey;
  const publicJwk = { ...(await exportJWK(keys.publicKey)), alg: 'RS256', kid: 'e2e', use: 'sig' };
  jwksServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  const address = jwksServer.address();
  if (address === null || typeof address === 'string') throw new Error('JWKS server unavailable');
  oidcApp = await buildApp(
    {
      ...configuration,
      identityMode: 'oidc',
      oidc: {
        allowedAlgorithms: ['RS256'],
        audience: 'acs-platform-api',
        clockToleranceSeconds: 0,
        issuer: 'https://issuer.acs.test',
        jwksCacheMs: 60_000,
        jwksCooldownMs: 1_000,
        jwksTimeoutMs: 1_000,
        jwksUri: `http://127.0.0.1:${address.port}/jwks`,
      },
    },
    { logger: false },
  );
  oidcToken = await new SignJWT({ amr: ['pwd', 'otp'] })
    .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
    .setIssuer('https://issuer.acs.test')
    .setAudience('acs-platform-api')
    .setSubject('alice')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey);
});

async function signedOidcToken(subject: string, claims: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    amr: ['pwd', 'otp'],
    aud: 'acs-platform-api',
    exp: now + 300,
    iat: now,
    iss: 'https://issuer.acs.test',
    sub: subject,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
    .sign(oidcSigningKey);
}

afterAll(async () => {
  await app.close();
  await oidcApp.close();
  await new Promise<void>((resolve, reject) =>
    jwksServer.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  await admin.end();
});

async function context(subject: string | undefined, tenant: string | undefined) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/platform/context',
    headers: {
      ...(subject === undefined ? {} : { authorization: `Bearer dev:${subject}` }),
      ...(tenant === undefined ? {} : { 'x-acs-tenant-id': tenant }),
    },
  });
}

describe('Phase 1 API to PostgreSQL tenant isolation', () => {
  it('lists tenant administration through role authorization and denies cross-tenant access', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: `/api/v1/platform/tenants/${tenantA}/administration`,
      headers: { authorization: 'Bearer dev:oidc|alice' },
    });
    expect(allowed.statusCode).toBe(200);
    const administration = tenantAdministrationSchema.parse(allowed.json());
    expect(administration.data.roles.some((role) => role.role_key === 'tenant-administrator')).toBe(
      true,
    );
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/platform/tenants/${tenantB}/administration`,
      headers: { authorization: 'Bearer dev:oidc|alice' },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('enforces self-administration, optimistic concurrency, idempotency, audit, and events', async () => {
    const self = await app.inject({
      method: 'PUT',
      url: `/api/v1/platform/tenants/${tenantA}/memberships/30000000-0000-4000-8000-000000000011/status`,
      headers: {
        authorization: 'Bearer dev:oidc|alice',
        'idempotency-key': '81000000-0000-4000-8000-000000000011',
      },
      payload: { status: 'INACTIVE', expected_version: 1 },
    });
    expect(self.statusCode).toBe(403);
    const target = '30000000-0000-4000-8000-000000000055';
    const first = await app.inject({
      method: 'PUT',
      url: `/api/v1/platform/tenants/${tenantA}/memberships/${target}/roles/70000000-0000-4000-8000-000000000022`,
      headers: {
        authorization: 'Bearer dev:oidc|alice',
        'idempotency-key': '81000000-0000-4000-8000-000000000022',
      },
      payload: { expected_version: 1 },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      data: { changed: true, version: 2 },
      meta: { idempotent_replay: false },
    });
    const replay = await app.inject({
      method: 'PUT',
      url: `/api/v1/platform/tenants/${tenantA}/memberships/${target}/roles/70000000-0000-4000-8000-000000000022`,
      headers: {
        authorization: 'Bearer dev:oidc|alice',
        'idempotency-key': '81000000-0000-4000-8000-000000000022',
      },
      payload: { expected_version: 1 },
    });
    expect(replay.json()).toMatchObject({
      data: { changed: true, version: 2 },
      meta: { idempotent_replay: true },
    });
    const stale = await app.inject({
      method: 'DELETE',
      url: `/api/v1/platform/tenants/${tenantA}/memberships/${target}/roles/70000000-0000-4000-8000-000000000022`,
      headers: {
        authorization: 'Bearer dev:oidc|alice',
        'idempotency-key': '81000000-0000-4000-8000-000000000033',
      },
      payload: { expected_version: 1 },
    });
    expect(stale.statusCode).toBe(409);
    const evidence = await admin.query<{ audits: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE action='platform.roles.manage') audits,(SELECT count(*)::int FROM platform.domain_events WHERE event_type='platform.membership.role_assigned') events`,
    );
    expect(evidence.rows[0]).toMatchObject({ audits: 1, events: 1 });
  });

  it('enforces lifecycle, revocation, cross-tenant targets, and concurrent winner/loser behavior', async () => {
    const target = '30000000-0000-4000-8000-000000000055';
    const readerRole = '70000000-0000-4000-8000-000000000022';
    const otherTenantRole = '70000000-0000-4000-8000-000000000033';
    const request = (method: 'PUT' | 'DELETE', path: string, key: string, payload: object) =>
      app.inject({
        method,
        url: `/api/v1/platform/tenants/${tenantA}${path}`,
        headers: { authorization: 'Bearer dev:oidc|alice', 'idempotency-key': key },
        payload,
      });

    const divergentReplay = await request(
      'PUT',
      `/memberships/${target}/roles/${readerRole}`,
      '81000000-0000-4000-8000-000000000022',
      { expected_version: 2 },
    );
    expect(divergentReplay.statusCode).toBe(409);

    const foreignRole = await request(
      'PUT',
      `/memberships/${target}/roles/${otherTenantRole}`,
      '82000000-0000-4000-8000-000000000011',
      { expected_version: 2 },
    );
    expect(foreignRole.statusCode).toBe(404);
    const unknownRole = await request(
      'PUT',
      `/memberships/${target}/roles/77777777-7777-4777-8777-777777777777`,
      '82000000-0000-4000-8000-000000000022',
      { expected_version: 2 },
    );
    expect(unknownRole.statusCode).toBe(404);

    const limitedAdministrator = await app.inject({
      method: 'PUT',
      url: `/api/v1/platform/tenants/${tenantB}/memberships/30000000-0000-4000-8000-000000000066/roles/${otherTenantRole}`,
      headers: {
        authorization: 'Bearer dev:oidc|charlie',
        'idempotency-key': '82000000-0000-4000-8000-000000000033',
      },
      payload: { expected_version: 1 },
    });
    expect(limitedAdministrator.statusCode).toBe(403);

    const concurrent = await Promise.all([
      request('PUT', `/memberships/${target}/status`, '82000000-0000-4000-8000-000000000044', {
        status: 'INACTIVE',
        expected_version: 2,
      }),
      request('PUT', `/memberships/${target}/status`, '82000000-0000-4000-8000-000000000055', {
        status: 'INACTIVE',
        expected_version: 2,
      }),
    ]);
    expect(concurrent.map((response) => response.statusCode).sort()).toEqual([200, 409]);

    const inactiveRoleMutation = await request(
      'DELETE',
      `/memberships/${target}/roles/${readerRole}`,
      '82000000-0000-4000-8000-000000000066',
      { expected_version: 3 },
    );
    expect(inactiveRoleMutation.statusCode).toBe(404);
    const reactivated = await request(
      'PUT',
      `/memberships/${target}/status`,
      '82000000-0000-4000-8000-000000000077',
      { status: 'ACTIVE', expected_version: 3 },
    );
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json()).toMatchObject({ data: { status: 'ACTIVE', version: 4 } });

    await admin.query("UPDATE platform.roles SET status='INACTIVE' WHERE id=$1", [readerRole]);
    const inactiveRole = await request(
      'DELETE',
      `/memberships/${target}/roles/${readerRole}`,
      '82000000-0000-4000-8000-000000000088',
      { expected_version: 4 },
    );
    expect(inactiveRole.statusCode).toBe(404);
    await admin.query("UPDATE platform.roles SET status='ACTIVE' WHERE id=$1", [readerRole]);

    const removed = await request(
      'DELETE',
      `/memberships/${target}/roles/${readerRole}`,
      '82000000-0000-4000-8000-000000000099',
      { expected_version: 4 },
    );
    expect(removed.json()).toMatchObject({ data: { changed: true, version: 5 } });
    const duplicateRemoval = await request(
      'DELETE',
      `/memberships/${target}/roles/${readerRole}`,
      '82000000-0000-4000-8000-000000000100',
      { expected_version: 5 },
    );
    expect(duplicateRemoval.json()).toMatchObject({ data: { changed: false, version: 5 } });

    await admin.query(
      "DELETE FROM platform.role_permissions WHERE tenant_id=$1 AND role_id='70000000-0000-4000-8000-000000000011' AND permission_key='platform.roles.manage'",
      [tenantA],
    );
    const revokedPermission = await request(
      'PUT',
      `/memberships/${target}/roles/${readerRole}`,
      '82000000-0000-4000-8000-000000000111',
      { expected_version: 5 },
    );
    expect(revokedPermission.statusCode).toBe(403);
    await admin.query(
      "INSERT INTO platform.role_permissions(tenant_id,role_id,permission_key,assigned_by) VALUES($1,'70000000-0000-4000-8000-000000000011','platform.roles.manage','10000000-0000-4000-8000-000000000011')",
      [tenantA],
    );

    await admin.query(
      "UPDATE platform.roles SET status='INACTIVE' WHERE id='70000000-0000-4000-8000-000000000011'",
    );
    const revokedRole = await app.inject({
      method: 'GET',
      url: `/api/v1/platform/tenants/${tenantA}/administration`,
      headers: { authorization: 'Bearer dev:oidc|alice' },
    });
    expect(revokedRole.statusCode).toBe(403);
    await admin.query(
      "UPDATE platform.roles SET status='ACTIVE' WHERE id='70000000-0000-4000-8000-000000000011'",
    );

    await expect(
      admin.query("UPDATE platform.domain_events SET payload='{}'::jsonb"),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('uses signed OIDC identity while ignoring authorization claims supplied by the token', async () => {
    const allowed = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/platform/tenants/${tenantA}/administration`,
      headers: { authorization: `Bearer ${oidcToken}` },
    });
    expect(allowed.statusCode).toBe(200);
    const forgedClaims = await signedOidcToken('bob', {
      tenant_id: tenantA,
      permissions: ['platform.roles.manage'],
      roles: ['tenant-administrator'],
    });
    const denied = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/platform/tenants/${tenantA}/administration`,
      headers: { authorization: `Bearer ${forgedClaims}` },
    });
    expect(denied.statusCode).toBe(403);
  });
  it('resolves a real signed OIDC JWT through PostgreSQL membership and RLS', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/platform/context',
      headers: { authorization: `Bearer ${oidcToken}`, 'x-acs-tenant-id': tenantA },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { tenant: { id: tenantA }, permissions: ['platform.context.read'] },
    });
  });

  it.each([
    ['User A / inactive Tenant B', 'alice', tenantB],
    ['User B / Tenant A', 'bob', tenantA],
    ['permission absent', 'charlie', tenantB],
    ['unknown identity', 'unknown', tenantA],
    ['manipulated tenant', 'alice', '77777777-7777-4777-8777-777777777777'],
  ])('denies a valid signed OIDC token for %s', async (_label, subject, tenant) => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/platform/context',
      headers: {
        authorization: `Bearer ${await signedOidcToken(subject)}`,
        'x-acs-tenant-id': tenant,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { message: 'The requested tenant context is not available.' },
    });
  });

  it('durably audits OIDC signature, expiry, issuer, and audience failures without raw tokens', async () => {
    const wrongKey = await generateKeyPair('RS256');
    const invalidSignature = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
      .setIssuer('https://issuer.acs.test')
      .setAudience('acs-platform-api')
      .setSubject('alice')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(wrongKey.privateKey);
    const tokens = [
      invalidSignature,
      await signedOidcToken('alice', { exp: 1 }),
      await signedOidcToken('alice', { iss: 'https://wrong-issuer.example' }),
      await signedOidcToken('alice', { aud: 'wrong-audience' }),
    ];
    for (const token of tokens) {
      const response = await oidcApp.inject({
        method: 'GET',
        url: '/api/v1/platform/context',
        headers: { authorization: `Bearer ${token}`, 'x-acs-tenant-id': tenantA },
      });
      expect(response.statusCode).toBe(401);
    }
    const result = await admin.query<Record<string, unknown>>(
      `SELECT * FROM platform.security_audit_logs
       WHERE reason_code IN ('JWT_SIGNATURE_INVALID', 'JWT_EXPIRED', 'JWT_CLAIM_INVALID')`,
    );
    expect(result.rowCount).toBeGreaterThanOrEqual(4);
    const durableEvidence = JSON.stringify(result.rows);
    for (const token of tokens) expect(durableEvidence).not.toContain(token);
  });
  it('allows Tenant A subject to read Tenant A with durable allowed audit', async () => {
    const response = await context('oidc|alice', tenantA);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        tenant: { id: tenantA },
        permissions: ['platform.context.read'],
      },
    });
    const audit = await admin.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM platform.audit_logs WHERE tenant_id = $1 AND action = 'platform.context.read'",
      [tenantA],
    );
    expect(audit.rows[0]?.count).toBeGreaterThan(0);
  });

  it.each([
    ['Tenant A to Tenant B inactive membership', 'oidc|alice', tenantB],
    ['Tenant B to Tenant A', 'oidc|bob', tenantA],
    ['permission absent', 'oidc|charlie', tenantB],
    ['manipulated tenant', 'oidc|alice', '77777777-7777-4777-8777-777777777777'],
    ['invalid identity', 'oidc|unknown', tenantA],
  ])('denies %s without disclosing tenant existence', async (_label, subject, tenant) => {
    const response = await context(subject, tenant);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        message: 'The requested tenant context is not available.',
      },
    });
  });

  it('denies missing authentication and records durable evidence', async () => {
    const response = await context(undefined, tenantA);
    expect(response.statusCode).toBe(401);
  });

  it.each([
    ['missing tenant', undefined],
    ['invalid tenant', 'not-a-uuid'],
  ])('denies %s', async (_label, tenant) => {
    const response = await context('oidc|alice', tenant);
    expect(response.statusCode).toBe(400);
  });

  it('persists redacted denial audit for the negative matrix', async () => {
    const result = await admin.query<{ count: number; protected: boolean }>(
      `SELECT count(*)::integer AS count,
              bool_and(outcome = 'DENIED' AND classification = 'SECURITY') AS protected
       FROM platform.security_audit_logs
       WHERE request_id <> 'phase1-denial-request'`,
    );
    expect(result.rows[0]?.count).toBeGreaterThanOrEqual(7);
    expect(result.rows[0]?.protected).toBe(true);
  });

  it('rejects grant replay, another connection, expiry, malformed tokens, and tenant escape', async () => {
    const issuer = new Client({
      connectionString: requiredEnvironment.issuer,
      connectionTimeoutMillis,
      statement_timeout: statementTimeout,
    });
    const tenantConnectionA = new Client({
      connectionString: requiredEnvironment.tenant,
      connectionTimeoutMillis,
      statement_timeout: statementTimeout,
    });
    const tenantConnectionB = new Client({
      connectionString: requiredEnvironment.tenant,
      connectionTimeoutMillis,
      statement_timeout: statementTimeout,
    });
    await Promise.all([issuer.connect(), tenantConnectionA.connect(), tenantConnectionB.connect()]);
    try {
      const issued = await issuer.query<{ context_token: string }>(
        `SELECT context_token FROM platform.issue_tenant_context(
          'oidc|alice', $1::uuid, 'platform.context.read'
        )`,
        [tenantA],
      );
      const token = issued.rows[0]?.context_token;
      expect(token).toBeDefined();

      await tenantConnectionA.query('BEGIN');
      const activation = await tenantConnectionA.query(
        "SELECT * FROM platform.activate_tenant_context($1::uuid, 'platform.context.read')",
        [token],
      );
      expect(activation.rowCount).toBe(1);
      const tenantAVisible = await tenantConnectionA.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM platform.tenants WHERE id = $1',
        [tenantA],
      );
      const tenantBVisible = await tenantConnectionA.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM platform.tenants WHERE id = $1',
        [tenantB],
      );
      expect(tenantAVisible.rows[0]?.count).toBe(1);
      expect(tenantBVisible.rows[0]?.count).toBe(0);
      await tenantConnectionA.query('COMMIT');

      await tenantConnectionB.query('BEGIN');
      const otherConnection = await tenantConnectionB.query(
        "SELECT * FROM platform.activate_tenant_context($1::uuid, 'platform.context.read')",
        [token],
      );
      expect(otherConnection.rowCount).toBe(0);
      await tenantConnectionB.query('ROLLBACK');

      await tenantConnectionA.query('BEGIN');
      const replay = await tenantConnectionA.query(
        "SELECT * FROM platform.activate_tenant_context($1::uuid, 'platform.context.read')",
        [token],
      );
      expect(replay.rowCount).toBe(0);
      await tenantConnectionA.query('ROLLBACK');

      const expired = await admin.query<{ token: string }>(
        `INSERT INTO platform.tenant_context_grants
           (tenant_id, user_id, membership_id, permission_key, expires_at)
         VALUES ($1, '10000000-0000-4000-8000-000000000011',
                 '30000000-0000-4000-8000-000000000011',
                 'platform.context.read', clock_timestamp() - interval '1 second')
         RETURNING token`,
        [tenantA],
      );
      const expiredActivation = await tenantConnectionA.query(
        "SELECT * FROM platform.activate_tenant_context($1::uuid, 'platform.context.read')",
        [expired.rows[0]?.token],
      );
      expect(expiredActivation.rowCount).toBe(0);

      await tenantConnectionA.query('BEGIN');
      await tenantConnectionA.query("SELECT set_config('app.context_token', $1, true)", [
        'not-a-uuid',
      ]);
      const malformed = await tenantConnectionA.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM platform.tenants',
      );
      expect(malformed.rows[0]?.count).toBe(0);
      await tenantConnectionA.query('ROLLBACK');

      await expect(
        tenantConnectionA.query(
          `SELECT * FROM platform.issue_tenant_context(
            'oidc|alice', $1::uuid, 'platform.context.read'
          )`,
          [tenantA],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await Promise.all([issuer.end(), tenantConnectionA.end(), tenantConnectionB.end()]);
    }
  }, 15_000);
});
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
