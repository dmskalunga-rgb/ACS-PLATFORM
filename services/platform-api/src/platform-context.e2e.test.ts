import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';

const { Client } = pg;
const requiredEnvironment = {
  admin: process.env.DATABASE_URL,
  auditor: process.env.ACS_SECURITY_AUDIT_DATABASE_URL,
  issuer: process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL,
  tenant: process.env.ACS_TENANT_DATABASE_URL,
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
  webOrigin: 'http://localhost:5173',
};

const tenantA = '00000000-0000-4000-8000-000000000011';
const tenantB = '00000000-0000-4000-8000-000000000022';
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: pg.Client;

beforeAll(async () => {
  admin = new Client({ connectionString: requiredEnvironment.admin });
  await admin.connect();
  app = await buildApp(configuration, { logger: false });
});

afterAll(async () => {
  await app.close();
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
    const issuer = new Client({ connectionString: requiredEnvironment.issuer });
    const tenantConnectionA = new Client({ connectionString: requiredEnvironment.tenant });
    const tenantConnectionB = new Client({ connectionString: requiredEnvironment.tenant });
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
