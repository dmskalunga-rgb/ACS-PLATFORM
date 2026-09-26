import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';
import { DevelopmentHeaderIdentityAdapter } from './identity.js';
import { MachineAuthenticationService } from './machine-service-auth.js';
import { RepositoryAuthorizationPort } from './platform-context.js';
import { PostgresMachineAuthenticationRepository } from './postgres-machine-service-auth.js';
import { PostgresTenantContextRepository } from './postgres-platform-context.js';

const { Client } = pg;
const tenantA = '00000000-0000-4000-8000-000000000011';
const tenantB = '00000000-0000-4000-8000-000000000022';
const required = {
  admin: process.env.DATABASE_URL,
  resolver: process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL,
  tenant: process.env.ACS_TENANT_DATABASE_URL,
  audit: process.env.ACS_SECURITY_AUDIT_DATABASE_URL,
  authentication: process.env.ACS_MACHINE_AUTH_DATABASE_URL,
  issuer: process.env.ACS_MACHINE_CONTEXT_ISSUER_DATABASE_URL,
};
for (const [name, value] of Object.entries(required))
  if (!value) throw new Error(`${name} disposable Machine/Service E2E database URL is required.`);

const configuration: PlatformConfiguration = {
  environment: 'test',
  host: '127.0.0.1',
  identityMode: 'development-header',
  logLevel: 'error',
  port: 3000,
  webOrigin: 'http://localhost:5173',
  resolverDatabaseUrl: required.resolver as string,
  tenantDatabaseUrl: required.tenant as string,
  securityAuditDatabaseUrl: required.audit as string,
  machineAuthDatabaseUrl: required.authentication as string,
  machineContextIssuerDatabaseUrl: required.issuer as string,
};
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: pg.Client;

beforeAll(async () => {
  admin = new Client({ connectionString: required.admin });
  await admin.connect();
  await admin.query(`
    INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
    VALUES
      ('00000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','platform.machine_principals.provision'),
      ('00000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','platform.machine_credentials.manage'),
      ('00000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','platform.machine_permissions.manage')
    ON CONFLICT DO NOTHING
  `);
  app = await buildApp(configuration, { logger: false });
});
afterAll(async () => {
  await Promise.all([app?.close(), admin?.end()]);
});

describe('Machine/Service real HTTP and PostgreSQL lifecycle', () => {
  it('provisions, authenticates, authorizes tenant context, rotates and revokes without plaintext storage', async () => {
    const humanHeaders = { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/machine-identities',
      headers: humanHeaders,
      payload: { principal_type: 'SERVICE', external_binding: `e2e:${randomUUID()}` },
    });
    expect(created.statusCode, created.body).toBe(200);
    const initial = z
      .object({
        data: z.object({ principal_id: z.uuid(), credential_id: z.uuid(), credential: z.string() }),
      })
      .parse(created.json()).data;
    const stored = await admin.query<{ verifier_sha256: string }>(
      'SELECT verifier_sha256 FROM platform.machine_credentials WHERE credential_id=$1',
      [initial.credential_id],
    );
    expect(stored.rows[0]?.verifier_sha256).toBe(
      createHash('sha256').update(initial.credential).digest('hex'),
    );
    expect(stored.rows[0]?.verifier_sha256).not.toBe(initial.credential);

    const self = (id: string, secret: string) =>
      app.inject({
        method: 'GET',
        url: '/api/v1/platform/machine-identities/self',
        headers: { 'x-acs-machine-credential-id': id, 'x-acs-machine-credential': secret },
      });
    expect((await self(initial.credential_id, initial.credential)).statusCode).toBe(200);
    expect((await self(initial.credential_id, 'x'.repeat(43))).statusCode).toBe(401);
    expect((await self(randomUUID(), initial.credential)).statusCode).toBe(401);

    const permission = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/machine-identities/${initial.principal_id}/permissions`,
      headers: humanHeaders,
      payload: { permission_key: 'platform.context.read', grant: true },
    });
    expect(permission.statusCode, permission.body).toBe(200);

    const contexts = new PostgresTenantContextRepository(
      required.resolver as string,
      required.tenant as string,
    );
    const repository = new PostgresMachineAuthenticationRepository(
      required.authentication as string,
      required.issuer as string,
    );
    try {
      const service = new MachineAuthenticationService(
        new DevelopmentHeaderIdentityAdapter(),
        new RepositoryAuthorizationPort(contexts),
        contexts,
        repository,
      );
      const identity = await service.authenticate(initial.credential_id, initial.credential);
      await expect(
        service.issueTenantContext(identity, tenantB, 'platform.context.read'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await service.issueTenantContext(identity, tenantA, 'platform.context.read')).toMatch(
        /^[0-9a-f-]{36}$/,
      );
    } finally {
      await Promise.all([contexts.close(), repository.close()]);
    }

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/machine-identities/${initial.principal_id}/rotate-credential`,
      headers: humanHeaders,
      payload: { current_credential_id: initial.credential_id },
    });
    expect(rotated.statusCode, rotated.body).toBe(200);
    const next = z
      .object({ data: z.object({ credential_id: z.uuid(), credential: z.string() }) })
      .parse(rotated.json()).data;
    expect((await self(initial.credential_id, initial.credential)).statusCode).toBe(401);
    expect((await self(next.credential_id, next.credential)).statusCode).toBe(200);
    const revoked = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/machine-identities/${initial.principal_id}/revoke-credential`,
      headers: humanHeaders,
      payload: { credential_id: next.credential_id },
    });
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect((await self(next.credential_id, next.credential)).statusCode).toBe(401);
  });

  it('denies missing human authority and cross-tenant administration', async () => {
    const path = '/api/v1/platform/machine-identities';
    const body = { principal_type: 'SERVICE', external_binding: `e2e-denied:${randomUUID()}` };
    const unauthenticated = await app.inject({
      method: 'POST',
      url: path,
      headers: { 'x-acs-tenant-id': tenantA },
      payload: body,
    });
    expect(unauthenticated.statusCode).toBe(401);
    const foreign = await app.inject({
      method: 'POST',
      url: path,
      headers: { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantB },
      payload: body,
    });
    expect(foreign.statusCode).toBe(403);
    const count = await admin.query<{ count: string }>(
      'SELECT count(*) FROM platform.machine_principals WHERE external_binding=$1',
      [body.external_binding],
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  it('separates machine authentication from permissions and human authority', async () => {
    const headers = { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/machine-identities',
      headers,
      payload: { principal_type: 'MACHINE', external_binding: `auth-separation:${randomUUID()}` },
    });
    expect(created.statusCode, created.body).toBe(200);
    const machine = z
      .object({
        data: z.object({ principal_id: z.uuid(), credential_id: z.uuid(), credential: z.string() }),
      })
      .parse(created.json()).data;
    const contexts = new PostgresTenantContextRepository(
      required.resolver as string,
      required.tenant as string,
    );
    const repository = new PostgresMachineAuthenticationRepository(
      required.authentication as string,
      required.issuer as string,
    );
    try {
      const service = new MachineAuthenticationService(
        new DevelopmentHeaderIdentityAdapter(),
        new RepositoryAuthorizationPort(contexts),
        contexts,
        repository,
      );
      const identity = await service.authenticate(machine.credential_id, machine.credential);
      await expect(
        service.issueTenantContext(identity, tenantA, 'platform.context.read'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        service.issueTenantContext(
          { ...identity, principalId: randomUUID() },
          tenantA,
          'platform.context.read',
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const humanOnly = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/machine-identities',
        headers: {
          'x-acs-tenant-id': tenantA,
          'x-acs-machine-credential-id': machine.credential_id,
          'x-acs-machine-credential': machine.credential,
        },
        payload: { principal_type: 'SERVICE', external_binding: `not-human:${randomUUID()}` },
      });
      expect(humanOnly.statusCode).toBe(401);
      const grant = await app.inject({
        method: 'POST',
        url: `/api/v1/platform/machine-identities/${machine.principal_id}/permissions`,
        headers,
        payload: { permission_key: 'platform.context.read', grant: true },
      });
      expect(grant.statusCode, grant.body).toBe(200);
      expect(await service.issueTenantContext(identity, tenantA, 'platform.context.read')).toMatch(
        /^[0-9a-f-]{36}$/,
      );
    } finally {
      await Promise.all([contexts.close(), repository.close()]);
    }
  });

  it('rolls back the principal if credential persistence fails', async () => {
    const binding = `credential-failure:${randomUUID()}`;
    await admin.query(`CREATE FUNCTION platform.machine_auth_test_fail_credential() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'injected machine credential persistence failure';
      END $$`);
    await admin.query(`CREATE TRIGGER machine_auth_test_fail_credential BEFORE INSERT ON platform.machine_credentials
      FOR EACH ROW EXECUTE FUNCTION platform.machine_auth_test_fail_credential()`);
    try {
      const failed = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/machine-identities',
        headers: { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA },
        payload: { principal_type: 'SERVICE', external_binding: binding },
      });
      expect(failed.statusCode).toBe(500);
      const count = await admin.query<{ count: string }>(
        'SELECT count(*) FROM platform.machine_principals WHERE external_binding=$1',
        [binding],
      );
      expect(count.rows[0]?.count).toBe('0');
    } finally {
      await admin.query(
        'DROP TRIGGER machine_auth_test_fail_credential ON platform.machine_credentials',
      );
      await admin.query('DROP FUNCTION platform.machine_auth_test_fail_credential()');
    }
  });

  it('rolls back provisioning when audit persistence fails', async () => {
    const binding = `audit-failure:${randomUUID()}`;
    await admin.query(`CREATE FUNCTION platform.machine_auth_test_fail_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action='platform.machine_principals.provision' THEN
          RAISE EXCEPTION 'injected machine authentication audit failure';
        END IF;
        RETURN NEW;
      END $$`);
    await admin.query(`CREATE TRIGGER machine_auth_test_fail_audit BEFORE INSERT ON platform.audit_logs
      FOR EACH ROW EXECUTE FUNCTION platform.machine_auth_test_fail_audit()`);
    try {
      const failed = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/machine-identities',
        headers: { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA },
        payload: { principal_type: 'SERVICE', external_binding: binding },
      });
      expect(failed.statusCode).toBe(500);
      const count = await admin.query<{ count: string }>(
        'SELECT count(*) FROM platform.machine_principals WHERE external_binding=$1',
        [binding],
      );
      expect(count.rows[0]?.count).toBe('0');
    } finally {
      await admin.query('DROP TRIGGER machine_auth_test_fail_audit ON platform.audit_logs');
      await admin.query('DROP FUNCTION platform.machine_auth_test_fail_audit()');
    }
  });

  it('rolls back rotation and revocation when the canonical outbox fails', async () => {
    const headers = { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/machine-identities',
      headers,
      payload: { principal_type: 'MACHINE', external_binding: `outbox-failure:${randomUUID()}` },
    });
    expect(created.statusCode, created.body).toBe(200);
    const initial = z
      .object({
        data: z.object({ principal_id: z.uuid(), credential_id: z.uuid(), credential: z.string() }),
      })
      .parse(created.json()).data;
    await admin.query(`CREATE FUNCTION platform.machine_auth_test_fail_outbox() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.event_type IN ('platform.machine_credential.rotated','platform.machine_credential.revoked') THEN
          RAISE EXCEPTION 'injected machine authentication outbox failure';
        END IF;
        RETURN NEW;
      END $$`);
    await admin.query(`CREATE TRIGGER machine_auth_test_fail_outbox BEFORE INSERT ON platform.domain_events
      FOR EACH ROW EXECUTE FUNCTION platform.machine_auth_test_fail_outbox()`);
    try {
      const rotated = await app.inject({
        method: 'POST',
        url: `/api/v1/platform/machine-identities/${initial.principal_id}/rotate-credential`,
        headers,
        payload: { current_credential_id: initial.credential_id },
      });
      expect(rotated.statusCode).toBe(500);
      const afterRotation = await admin.query<{ count: string; status: string }>(
        `SELECT count(*)::text AS count, max(status) AS status FROM platform.machine_credentials
         WHERE machine_principal_id=$1 AND status='ACTIVE'`,
        [initial.principal_id],
      );
      expect(afterRotation.rows[0]).toMatchObject({ count: '1', status: 'ACTIVE' });
      const revoked = await app.inject({
        method: 'POST',
        url: `/api/v1/platform/machine-identities/${initial.principal_id}/revoke-credential`,
        headers,
        payload: { credential_id: initial.credential_id },
      });
      expect(revoked.statusCode).toBe(500);
      const afterRevoke = await admin.query<{ status: string }>(
        'SELECT status FROM platform.machine_credentials WHERE credential_id=$1',
        [initial.credential_id],
      );
      expect(afterRevoke.rows[0]?.status).toBe('ACTIVE');
    } finally {
      await admin.query('DROP TRIGGER machine_auth_test_fail_outbox ON platform.domain_events');
      await admin.query('DROP FUNCTION platform.machine_auth_test_fail_outbox()');
    }
  });

  it('allows only one concurrent rotation and never leaves multiple active credentials', async () => {
    const headers = { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/machine-identities',
      headers,
      payload: { principal_type: 'AUTOMATION', external_binding: `rotation-race:${randomUUID()}` },
    });
    expect(created.statusCode, created.body).toBe(200);
    const initial = z
      .object({ data: z.object({ principal_id: z.uuid(), credential_id: z.uuid() }) })
      .parse(created.json()).data;
    const url = `/api/v1/platform/machine-identities/${initial.principal_id}/rotate-credential`;
    const results = await Promise.all([
      app.inject({
        method: 'POST',
        url,
        headers,
        payload: { current_credential_id: initial.credential_id },
      }),
      app.inject({
        method: 'POST',
        url,
        headers,
        payload: { current_credential_id: initial.credential_id },
      }),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 403]);
    const winner = results.find((result) => result.statusCode === 200);
    const loser = results.find((result) => result.statusCode === 403);
    expect(winner).toBeDefined();
    expect(loser?.body).not.toContain('credential_id');
    expect(loser?.body).not.toContain('credential"');
    const winningCredential = z
      .object({ data: z.object({ credential_id: z.uuid(), credential: z.string() }) })
      .parse(winner?.json()).data;
    const stale = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { current_credential_id: initial.credential_id },
    });
    expect(stale.statusCode).toBe(403);
    expect(stale.body).not.toContain('credential_id');
    const current = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { current_credential_id: winningCredential.credential_id },
    });
    expect(current.statusCode, current.body).toBe(200);
    const active = await admin.query<{ count: string }>(
      `SELECT count(*) FROM platform.machine_credentials
       WHERE machine_principal_id=$1 AND status='ACTIVE'`,
      [initial.principal_id],
    );
    expect(active.rows[0]?.count).toBe('1');
  });

  it('denies cross-principal preconditions, expired and disabled credentials', async () => {
    const headers = { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA };
    const provision = async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/machine-identities',
        headers,
        payload: { principal_type: 'SERVICE', external_binding: `security:${randomUUID()}` },
      });
      expect(response.statusCode, response.body).toBe(200);
      return z
        .object({
          data: z.object({
            principal_id: z.uuid(),
            credential_id: z.uuid(),
            credential: z.string(),
          }),
        })
        .parse(response.json()).data;
    };
    const first = await provision();
    const second = await provision();
    const crossPrincipal = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/machine-identities/${second.principal_id}/rotate-credential`,
      headers,
      payload: { current_credential_id: first.credential_id },
    });
    expect(crossPrincipal.statusCode).toBe(403);
    expect(crossPrincipal.body).not.toContain('credential_id');
    const foreign = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/machine-identities/${first.principal_id}/rotate-credential`,
      headers: { ...headers, 'x-acs-tenant-id': tenantB },
      payload: { current_credential_id: first.credential_id },
    });
    expect(foreign.statusCode).toBe(403);
    const self = (id: string, secret: string) =>
      app.inject({
        method: 'GET',
        url: '/api/v1/platform/machine-identities/self',
        headers: { 'x-acs-machine-credential-id': id, 'x-acs-machine-credential': secret },
      });
    await admin.query(
      "UPDATE platform.machine_credentials SET created_at=now() - interval '2 minutes', expires_at=now() - interval '1 minute' WHERE credential_id=$1",
      [first.credential_id],
    );
    expect((await self(first.credential_id, first.credential)).statusCode).toBe(401);
    const disabled = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/machine-identities/${second.principal_id}/disable`,
      headers,
    });
    expect(disabled.statusCode, disabled.body).toBe(200);
    expect((await self(second.credential_id, second.credential)).statusCode).toBe(401);
  });

  it('fails closed on authentication when the real repository is unavailable', async () => {
    const unavailableUrl = new URL(required.authentication as string);
    unavailableUrl.hostname = '127.0.0.1';
    unavailableUrl.port = '1';
    const contexts = new PostgresTenantContextRepository(
      required.resolver as string,
      required.tenant as string,
    );
    const repository = new PostgresMachineAuthenticationRepository(
      unavailableUrl.toString(),
      unavailableUrl.toString(),
    );
    const service = new MachineAuthenticationService(
      new DevelopmentHeaderIdentityAdapter(),
      new RepositoryAuthorizationPort(contexts),
      contexts,
      repository,
    );
    try {
      await expect(repository.resolveCredential(randomUUID())).rejects.toMatchObject({
        code: 'ECONNREFUSED',
      });
      await expect(service.authenticate(randomUUID(), 'A'.repeat(43))).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    } finally {
      await Promise.all([contexts.close(), repository.close()]);
    }
  });

  it('persists no principal, audit or event when the real provisioning repository is unavailable', async () => {
    const unavailableUrl = new URL(required.authentication as string);
    unavailableUrl.hostname = '127.0.0.1';
    unavailableUrl.port = '1';
    const contexts = new PostgresTenantContextRepository(
      required.resolver as string,
      required.tenant as string,
    );
    const repository = new PostgresMachineAuthenticationRepository(
      unavailableUrl.toString(),
      unavailableUrl.toString(),
    );
    const service = new MachineAuthenticationService(
      new DevelopmentHeaderIdentityAdapter(),
      new RepositoryAuthorizationPort(contexts),
      contexts,
      repository,
    );
    const binding = `repository-outage:${randomUUID()}`;
    const requestId = randomUUID();
    const correlationId = randomUUID();
    try {
      await expect(
        service.provision('Bearer dev:oidc|alice', tenantA, 'SERVICE', binding, {
          requestId,
          correlationId,
        }),
      ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      const principals = await admin.query<{ count: string }>(
        'SELECT count(*) FROM platform.machine_principals WHERE external_binding=$1',
        [binding],
      );
      const audit = await admin.query<{ count: string }>(
        'SELECT count(*) FROM platform.audit_logs WHERE request_id=$1',
        [requestId],
      );
      const outbox = await admin.query<{ count: string }>(
        'SELECT count(*) FROM platform.domain_events WHERE correlation_id=$1',
        [correlationId],
      );
      expect(principals.rows[0]?.count).toBe('0');
      expect(audit.rows[0]?.count).toBe('0');
      expect(outbox.rows[0]?.count).toBe('0');
    } finally {
      await Promise.all([contexts.close(), repository.close()]);
    }
  });

  it('returns no HTTP success or credential when the real provisioning repository is unavailable', async () => {
    const unavailableUrl = new URL(required.authentication as string);
    unavailableUrl.hostname = '127.0.0.1';
    unavailableUrl.port = '1';
    const unavailableApp = await buildApp(
      { ...configuration, machineAuthDatabaseUrl: unavailableUrl.toString() },
      { logger: false },
    );
    const binding = `http-repository-outage:${randomUUID()}`;
    try {
      const response = await unavailableApp.inject({
        method: 'POST',
        url: '/api/v1/platform/machine-identities',
        headers: { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA },
        payload: { principal_type: 'SERVICE', external_binding: binding },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ error: { code: 'FOUNDATION_INTERNAL_ERROR' } });
      expect(response.body).not.toContain('credential_id');
      expect(response.body).not.toContain('credential"');
      const principals = await admin.query<{ count: string }>(
        'SELECT count(*) FROM platform.machine_principals WHERE external_binding=$1',
        [binding],
      );
      expect(principals.rows[0]?.count).toBe('0');
    } finally {
      await unavailableApp.close();
    }
  });

  it('leaves rotation and revocation unchanged when the real repository is unavailable', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/machine-identities',
      headers: { authorization: 'Bearer dev:oidc|alice', 'x-acs-tenant-id': tenantA },
      payload: {
        principal_type: 'SERVICE',
        external_binding: `repository-outage-seed:${randomUUID()}`,
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const seed = z
      .object({ data: z.object({ principal_id: z.uuid(), credential_id: z.uuid() }) })
      .parse(created.json()).data;
    const unavailableUrl = new URL(required.authentication as string);
    unavailableUrl.hostname = '127.0.0.1';
    unavailableUrl.port = '1';
    const contexts = new PostgresTenantContextRepository(
      required.resolver as string,
      required.tenant as string,
    );
    const repository = new PostgresMachineAuthenticationRepository(
      unavailableUrl.toString(),
      unavailableUrl.toString(),
    );
    const service = new MachineAuthenticationService(
      new DevelopmentHeaderIdentityAdapter(),
      new RepositoryAuthorizationPort(contexts),
      contexts,
      repository,
    );
    const rotateMeta = { requestId: randomUUID(), correlationId: randomUUID() };
    const revokeMeta = { requestId: randomUUID(), correlationId: randomUUID() };
    try {
      await expect(
        service.rotate(
          'Bearer dev:oidc|alice',
          tenantA,
          seed.principal_id,
          seed.credential_id,
          rotateMeta,
        ),
      ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      await expect(
        service.revoke(
          'Bearer dev:oidc|alice',
          tenantA,
          seed.principal_id,
          seed.credential_id,
          revokeMeta,
        ),
      ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      const active = await admin.query<{ count: string }>(
        "SELECT count(*) FROM platform.machine_credentials WHERE machine_principal_id=$1 AND status='ACTIVE'",
        [seed.principal_id],
      );
      expect(active.rows[0]?.count).toBe('1');
      for (const meta of [rotateMeta, revokeMeta]) {
        const audit = await admin.query<{ count: string }>(
          'SELECT count(*) FROM platform.audit_logs WHERE request_id=$1',
          [meta.requestId],
        );
        const outbox = await admin.query<{ count: string }>(
          'SELECT count(*) FROM platform.domain_events WHERE correlation_id=$1',
          [meta.correlationId],
        );
        expect(audit.rows[0]?.count).toBe('0');
        expect(outbox.rows[0]?.count).toBe('0');
      }
    } finally {
      await Promise.all([contexts.close(), repository.close()]);
    }
  });
});
