import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  customerEnvelopeSchema,
  customerListEnvelopeSchema,
  leadEnvelopeSchema,
  leadListEnvelopeSchema,
  planEnvelopeSchema,
  planFeatureEnvelopeSchema,
  planFeatureListEnvelopeSchema,
  planListEnvelopeSchema,
  tenantAdministrationSchema,
} from '@acs/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { PostgresPlanCatalogRepository } from './postgres-plan-catalog.js';
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
  customer: process.env.ACS_CUSTOMER_DATABASE_URL,
  lead: process.env.ACS_LEAD_DATABASE_URL,
  plan: process.env.ACS_PLAN_DATABASE_URL,
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
  customerDatabaseUrl: requiredEnvironment.customer as string,
  leadDatabaseUrl: requiredEnvironment.lead as string,
  planDatabaseUrl: requiredEnvironment.plan as string,
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
  it('executes the Plan Catalog OIDC, FORCE RLS, audit and outbox path', async () => {
    const planCode = `e2e-${randomUUID().slice(0, 12)}`;
    const createKey = randomUUID();
    const headers = {
      authorization: `Bearer ${oidcToken}`,
      'x-acs-tenant-id': tenantA,
      'idempotency-key': createKey,
    };
    const created = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/plans',
      headers,
      payload: { plan_code: planCode, name: 'Starter' },
    });
    expect(created.statusCode, created.body).toBe(200);
    const plan = planEnvelopeSchema.parse(created.json()).data;
    const replay = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/plans',
      headers,
      payload: { plan_code: planCode, name: 'Starter' },
    });
    expect(planEnvelopeSchema.parse(replay.json()).meta.idempotent_replay).toBe(true);
    const divergent = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/plans',
      headers: { ...headers, 'idempotency-key': headers['idempotency-key'] },
      payload: { plan_code: `${planCode}-two`, name: 'Starter Two' },
    });
    expect(divergent.statusCode).toBe(409);
    const listed = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/plans?limit=25',
      headers,
    });
    expect(
      planListEnvelopeSchema.parse(listed.json()).data.some((entry) => entry.id === plan.id),
    ).toBe(true);
    const feature = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/plans/${plan.id}/features`,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { feature_code: 'core', name: 'Core' },
    });
    expect(feature.statusCode, feature.body).toBe(200);
    const featureData = planFeatureEnvelopeSchema.parse(feature.json()).data;
    const features = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/plans/${plan.id}/features?limit=25`,
      headers,
    });
    expect(planFeatureListEnvelopeSchema.parse(features.json()).data).toContainEqual(
      expect.objectContaining({ id: featureData.id, plan_id: plan.id }),
    );
    const inactive = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/plans/${plan.id}`,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { status: 'INACTIVE', expected_version: plan.version },
    });
    expect(planEnvelopeSchema.parse(inactive.json()).data.status).toBe('INACTIVE');
    const blockedFeature = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/plans/${plan.id}/features/${featureData.id}`,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { name: 'Changed', expected_version: featureData.version },
    });
    expect(blockedFeature.statusCode).toBe(422);
    const foreign = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/plans/${plan.id}`,
      headers: { authorization: `Bearer ${oidcToken}`, 'x-acs-tenant-id': tenantB },
    });
    expect(foreign.statusCode).toBe(403);
  });
  it('executes the Lead Registry OIDC, FORCE RLS, audit and outbox path', async () => {
    const headers = {
      authorization: `Bearer ${oidcToken}`,
      'x-acs-tenant-id': tenantA,
      'idempotency-key': '83000000-0000-4000-8000-000000000011',
    };
    const created = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/leads',
      headers,
      payload: { display_name: 'Acme Prospect', source: 'MANUAL', contact_email: 'lead@acme.test' },
    });
    expect(created.statusCode, created.body).toBe(200);
    const lead = leadEnvelopeSchema.parse(created.json()).data;
    expect(lead).toMatchObject({ display_name: 'Acme Prospect', status: 'NEW', version: 1 });
    const replay = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/leads',
      headers,
      payload: { display_name: 'Acme Prospect', source: 'MANUAL', contact_email: 'lead@acme.test' },
    });
    expect(replay.json()).toMatchObject({
      data: { id: lead.id },
      meta: { idempotent_replay: true },
    });
    const divergent = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/leads',
      headers,
      payload: { display_name: 'Different lead' },
    });
    expect(divergent.statusCode).toBe(409);
    const list = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/leads?limit=10',
      headers: { authorization: `Bearer ${oidcToken}`, 'x-acs-tenant-id': tenantA },
    });
    expect(leadListEnvelopeSchema.parse(list.json()).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: lead.id })]),
    );
    const foreign = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/leads/${lead.id}`,
      headers: {
        authorization: `Bearer ${await signedOidcToken('charlie')}`,
        'x-acs-tenant-id': tenantB,
      },
    });
    expect(foreign.statusCode).toBe(403);
    const mass = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/leads/${lead.id}`,
      headers: { ...headers, 'idempotency-key': '83000000-0000-4000-8000-000000000012' },
      payload: { tenant_id: tenantB, display_name: 'escape', expected_version: 1 },
    });
    expect(mass.statusCode).toBe(400);
    const updated = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/leads/${lead.id}`,
      headers: { ...headers, 'idempotency-key': '83000000-0000-4000-8000-000000000013' },
      payload: { status: 'QUALIFIED', expected_version: 1 },
    });
    expect(updated.json()).toMatchObject({ data: { version: 2, status: 'QUALIFIED' } });
    const stale = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/leads/${lead.id}`,
      headers: { ...headers, 'idempotency-key': '83000000-0000-4000-8000-000000000014' },
      payload: { display_name: 'stale', expected_version: 1 },
    });
    expect(stale.statusCode).toBe(409);
    const evidence = await admin.query<{ audits: number; events: number; pii: number }>(
      `SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$1) audits, (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'lead_id'=$2) events, (SELECT count(*)::int FROM platform.domain_events WHERE payload::text LIKE '%lead@acme.test%') pii`,
      [`commercial:lead:${lead.id}`, lead.id],
    );
    expect(evidence.rows[0]).toEqual({ audits: 2, events: 2, pii: 0 });
  });
  it('executes the Customer Registry OIDC, authorization, RLS, audit and outbox path', async () => {
    const startedAt = performance.now();
    const headers = {
      authorization: `Bearer ${oidcToken}`,
      'x-acs-tenant-id': tenantA,
      'idempotency-key': '82000000-0000-4000-8000-000000000011',
    };
    const created = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/customers',
      headers,
      payload: {
        display_name: 'Acme Angola',
        reference_code: 'ACME-AO',
        contact_email: 'ops@acme.test',
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const customer = customerEnvelopeSchema.parse(created.json()).data;
    const createMilliseconds = performance.now() - startedAt;
    expect(customer).toMatchObject({ display_name: 'Acme Angola', status: 'ACTIVE', version: 1 });

    const replay = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/customers',
      headers,
      payload: {
        display_name: 'Acme Angola',
        reference_code: 'ACME-AO',
        contact_email: 'ops@acme.test',
      },
    });
    expect(replay.json()).toMatchObject({
      data: { id: customer.id },
      meta: { idempotent_replay: true },
    });
    const divergent = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/customers',
      headers,
      payload: { display_name: 'Different customer' },
    });
    expect(divergent.statusCode).toBe(409);

    const listStartedAt = performance.now();
    const listed = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/customers?limit=10',
      headers: { authorization: `Bearer ${oidcToken}`, 'x-acs-tenant-id': tenantA },
    });
    expect(customerListEnvelopeSchema.parse(listed.json()).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: customer.id })]),
    );
    const listMilliseconds = performance.now() - listStartedAt;
    const readStartedAt = performance.now();
    const read = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/customers/${customer.id}`,
      headers: { authorization: `Bearer ${oidcToken}`, 'x-acs-tenant-id': tenantA },
    });
    expect(customerEnvelopeSchema.parse(read.json()).data.id).toBe(customer.id);
    const readMilliseconds = performance.now() - readStartedAt;
    const foreign = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/customers/${customer.id}`,
      headers: {
        authorization: `Bearer ${await signedOidcToken('charlie')}`,
        'x-acs-tenant-id': tenantB,
      },
    });
    expect(foreign.statusCode).toBe(403);
    const invalidJwt = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/customers/${customer.id}`,
      headers: { authorization: 'Bearer invalid.jwt', 'x-acs-tenant-id': tenantA },
    });
    expect(invalidJwt.statusCode).toBe(401);
    const massAssignment = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/customers/${customer.id}`,
      headers: {
        authorization: `Bearer ${oidcToken}`,
        'x-acs-tenant-id': tenantA,
        'idempotency-key': '82000000-0000-4000-8000-000000000099',
      },
      payload: { tenant_id: tenantB, display_name: 'Hijacked', expected_version: 1 },
    });
    expect(massAssignment.statusCode).toBe(400);

    const updateStartedAt = performance.now();
    const updated = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/customers/${customer.id}`,
      headers: {
        authorization: `Bearer ${oidcToken}`,
        'x-acs-tenant-id': tenantA,
        'idempotency-key': '82000000-0000-4000-8000-000000000022',
      },
      payload: { display_name: 'Acme Angola Updated', expected_version: 1 },
    });
    expect(updated.json()).toMatchObject({ data: { version: 2 } });
    const updateMilliseconds = performance.now() - updateStartedAt;
    const stale = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/customers/${customer.id}`,
      headers: {
        authorization: `Bearer ${oidcToken}`,
        'x-acs-tenant-id': tenantA,
        'idempotency-key': '82000000-0000-4000-8000-000000000033',
      },
      payload: { display_name: 'Stale', expected_version: 1 },
    });
    expect(stale.statusCode).toBe(409);
    const concurrent = await Promise.all([
      oidcApp.inject({
        method: 'PATCH',
        url: `/api/v1/commercial/customers/${customer.id}`,
        headers: {
          authorization: `Bearer ${oidcToken}`,
          'x-acs-tenant-id': tenantA,
          'idempotency-key': '82000000-0000-4000-8000-000000000044',
        },
        payload: { display_name: 'Concurrent A', expected_version: 2 },
      }),
      oidcApp.inject({
        method: 'PATCH',
        url: `/api/v1/commercial/customers/${customer.id}`,
        headers: {
          authorization: `Bearer ${oidcToken}`,
          'x-acs-tenant-id': tenantA,
          'idempotency-key': '82000000-0000-4000-8000-000000000055',
        },
        payload: { display_name: 'Concurrent B', expected_version: 2 },
      }),
    ]);
    expect(concurrent.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const evidence = await admin.query<{
      audits: number;
      events: number;
      deliveries: number;
      pii_events: number;
    }>(
      `SELECT
       (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$1) audits,
       (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'customer_id'=$2) events,
       (SELECT count(*)::int FROM platform.event_deliveries d JOIN platform.domain_events e USING(event_id) WHERE e.payload->>'customer_id'=$2) deliveries,
       (SELECT count(*)::int FROM platform.domain_events WHERE payload::text LIKE '%ops@acme.test%') pii_events`,
      [`commercial:customer:${customer.id}`, customer.id],
    );
    expect(evidence.rows[0]).toEqual({ audits: 3, events: 3, deliveries: 3, pii_events: 0 });
    process.stdout.write(
      `${JSON.stringify({ baseline_only_not_slo: true, customer_create_with_outbox_milliseconds: Number(createMilliseconds.toFixed(2)), customer_read_milliseconds: Number(readMilliseconds.toFixed(2)), customer_list_milliseconds: Number(listMilliseconds.toFixed(2)), customer_update_with_outbox_milliseconds: Number(updateMilliseconds.toFixed(2)), customer_journey_milliseconds: Number((performance.now() - startedAt).toFixed(2)), outbox_records: evidence.rows[0]?.events })}\n`,
    );
  });
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
    const evidenceBefore = await admin.query<{ audits: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE action='platform.roles.manage') audits,(SELECT count(*)::int FROM platform.domain_events WHERE event_type='platform.membership.role_assigned') events`,
    );
    await admin.query(`DELETE FROM platform.administrative_operations WHERE tenant_id=$1`, [
      tenantA,
    ]);
    await admin.query(
      `DELETE FROM platform.membership_roles WHERE tenant_id=$1 AND membership_id=$2 AND role_id=$3`,
      [tenantA, '30000000-0000-4000-8000-000000000055', '70000000-0000-4000-8000-000000000022'],
    );
    await admin.query(`UPDATE platform.memberships SET version=1 WHERE id=$1`, [
      '30000000-0000-4000-8000-000000000055',
    ]);
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
    expect(evidence.rows[0]!.audits).toBeGreaterThan(evidenceBefore.rows[0]!.audits);
    expect(evidence.rows[0]!.events).toBeGreaterThan(evidenceBefore.rows[0]!.events);
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

describe.sequential('Plan Catalog acceptance matrix', () => {
  let acceptedPlan: { id: string; version: number };
  let acceptedFeature: { id: string; version: number };
  const performanceBaseline = new Map<string, number>();
  let journeyStartedAt = 0;
  const measure = (name: string, startedAt: number) =>
    performanceBaseline.set(name, Number((performance.now() - startedAt).toFixed(2)));
  const headers = (key = randomUUID(), tenant = tenantA, token = oidcToken) => ({
    authorization: `Bearer ${token}`,
    'x-acs-tenant-id': tenant,
    'idempotency-key': key,
  });
  const safeError = (response: { json(): unknown }) =>
    expect(JSON.stringify(response.json())).not.toMatch(/postgres|password|bearer |token|stack/i);

  it('PLAN-POS-01 POST /plans', async () => {
    journeyStartedAt = performance.now();
    const startedAt = performance.now();
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/plans',
      headers: headers(),
      payload: { plan_code: `accept-${randomUUID().slice(0, 8)}`, name: 'Acceptance plan' },
    });
    expect(response.statusCode, response.body).toBe(200);
    acceptedPlan = planEnvelopeSchema.parse(response.json()).data;
    measure('PLAN_CREATE_WITH_AUDIT_OUTBOX_MS', startedAt);
  });
  it('PLAN-POS-02 GET /plans', async () => {
    const startedAt = performance.now();
    const response = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/plans?limit=25',
      headers: headers(),
    });
    expect(planListEnvelopeSchema.parse(response.json()).data).toContainEqual(
      expect.objectContaining({ id: acceptedPlan.id }),
    );
    measure('PLAN_LIST_MS', startedAt);
  });
  it('PLAN-POS-03 GET /plans/:planId', async () => {
    const startedAt = performance.now();
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
      headers: headers(),
    });
    expect(planEnvelopeSchema.parse(response.json()).data.id).toBe(acceptedPlan.id);
    measure('PLAN_DETAIL_MS', startedAt);
  });
  it('PLAN-POS-04 PATCH /plans/:planId', async () => {
    const startedAt = performance.now();
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
      headers: headers(),
      payload: { name: 'Acceptance plan updated', expected_version: acceptedPlan.version },
    });
    acceptedPlan = planEnvelopeSchema.parse(response.json()).data;
    expect(acceptedPlan.version).toBe(2);
    measure('PLAN_UPDATE_WITH_AUDIT_OUTBOX_MS', startedAt);
  });
  it('PLAN-POS-05 POST /plans/:planId/features', async () => {
    const startedAt = performance.now();
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/plans/${acceptedPlan.id}/features`,
      headers: headers(),
      payload: { feature_code: `feature-${randomUUID().slice(0, 8)}`, name: 'Acceptance feature' },
    });
    expect(response.statusCode, response.body).toBe(200);
    acceptedFeature = planFeatureEnvelopeSchema.parse(response.json()).data;
    measure('PLAN_FEATURE_CREATE_MS', startedAt);
  });
  it('PLAN-POS-06 GET /plans/:planId/features', async () => {
    const startedAt = performance.now();
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/plans/${acceptedPlan.id}/features?limit=25`,
      headers: headers(),
    });
    expect(planFeatureListEnvelopeSchema.parse(response.json()).data).toContainEqual(
      expect.objectContaining({ id: acceptedFeature.id }),
    );
    measure('PLAN_FEATURE_LIST_MS', startedAt);
  });
  it('PLAN-POS-07 GET /plans/:planId/features/:featureId', async () => {
    const startedAt = performance.now();
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/plans/${acceptedPlan.id}/features/${acceptedFeature.id}`,
      headers: headers(),
    });
    expect(planFeatureEnvelopeSchema.parse(response.json()).data.id).toBe(acceptedFeature.id);
    measure('PLAN_FEATURE_DETAIL_MS', startedAt);
  });
  it('PLAN-POS-08 PATCH /plans/:planId/features/:featureId', async () => {
    const startedAt = performance.now();
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/plans/${acceptedPlan.id}/features/${acceptedFeature.id}`,
      headers: headers(),
      payload: { name: 'Acceptance feature updated', expected_version: acceptedFeature.version },
    });
    acceptedFeature = planFeatureEnvelopeSchema.parse(response.json()).data;
    expect(acceptedFeature.version).toBe(2);
    measure('PLAN_FEATURE_UPDATE_MS', startedAt);
    measure('PLAN_COMPLETE_JOURNEY_MS', journeyStartedAt);
    process.stdout.write(
      `${JSON.stringify({ BASELINE_MEASUREMENT_NOT_SLO: true, ...Object.fromEntries(performanceBaseline) })}\n`,
    );
  });

  const securityCases: readonly [
    string,
    () => Promise<{ statusCode: number; json(): unknown }>,
    number,
  ][] = [
    [
      'PLAN-SEC-01 missing authentication',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: { 'x-acs-tenant-id': tenantA },
        }),
      401,
    ],
    [
      'PLAN-SEC-02 malformed Authorization header',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: { authorization: 'Basic malformed', 'x-acs-tenant-id': tenantA },
        }),
      401,
    ],
    [
      'PLAN-SEC-03 invalid JWT signature',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: { authorization: 'Bearer invalid.jwt.signature', 'x-acs-tenant-id': tenantA },
        }),
      401,
    ],
    [
      'PLAN-SEC-04 expired JWT',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: {
            authorization: `Bearer ${await signedOidcToken('alice', { exp: 1 })}`,
            'x-acs-tenant-id': tenantA,
          },
        }),
      401,
    ],
    [
      'PLAN-SEC-05 wrong issuer',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: {
            authorization: `Bearer ${await signedOidcToken('alice', { iss: 'https://wrong.example' })}`,
            'x-acs-tenant-id': tenantA,
          },
        }),
      401,
    ],
    [
      'PLAN-SEC-06 wrong audience',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: {
            authorization: `Bearer ${await signedOidcToken('alice', { aud: 'wrong' })}`,
            'x-acs-tenant-id': tenantA,
          },
        }),
      401,
    ],
    [
      'PLAN-SEC-07 unknown identity',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: {
            authorization: `Bearer ${await signedOidcToken('nobody')}`,
            'x-acs-tenant-id': tenantA,
          },
        }),
      403,
    ],
    [
      'PLAN-SEC-08 inactive membership',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: headers(randomUUID(), tenantB),
        }),
      403,
    ],
    [
      'PLAN-SEC-09 foreign tenant membership',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
        }),
      403,
    ],
    [
      'PLAN-SEC-10 manipulated tenant context',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: headers(randomUUID(), '77777777-7777-4777-8777-777777777777'),
        }),
      403,
    ],
    [
      'PLAN-SEC-11 missing tenant',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: { authorization: `Bearer ${oidcToken}` },
        }),
      400,
    ],
    [
      'PLAN-SEC-12 malformed tenant/resource identifier',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans/not-a-uuid',
          headers: { authorization: `Bearer ${oidcToken}`, 'x-acs-tenant-id': 'not-a-uuid' },
        }),
      400,
    ],
    [
      'PLAN-SEC-13 missing commercial.plan.read',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans',
          headers: headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
        }),
      403,
    ],
    [
      'PLAN-SEC-14 missing commercial.plan.create',
      async () =>
        oidcApp.inject({
          method: 'POST',
          url: '/api/v1/commercial/plans',
          headers: headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
          payload: { plan_code: 'no-access', name: 'No access' },
        }),
      403,
    ],
    [
      'PLAN-SEC-15 missing commercial.plan.update',
      async () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
          headers: headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
          payload: { name: 'No access', expected_version: 1 },
        }),
      403,
    ],
    [
      'PLAN-SEC-16 missing commercial.plan.admin for lifecycle change',
      async () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
          headers: headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
          payload: { status: 'INACTIVE', expected_version: 1 },
        }),
      403,
    ],
    [
      'PLAN-SEC-17 cross-tenant Plan read',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
          headers: headers(randomUUID(), tenantB),
        }),
      403,
    ],
    [
      'PLAN-SEC-18 cross-tenant Plan update',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
          headers: headers(randomUUID(), tenantB),
          payload: { name: 'Escape', expected_version: acceptedPlan.version },
        }),
      403,
    ],
    [
      'PLAN-SEC-19 cross-tenant Feature access/mutation',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}/features/${acceptedFeature.id}`,
          headers: headers(randomUUID(), tenantB),
        }),
      403,
    ],
    [
      'PLAN-SEC-20 Plan mass assignment / unknown field',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
          headers: headers(),
          payload: { name: 'Escape', tenant_id: tenantB, expected_version: acceptedPlan.version },
        }),
      400,
    ],
    [
      'PLAN-SEC-21 malformed Plan/Feature UUID',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/plans/not-a-uuid/features/not-a-uuid',
          headers: headers(),
        }),
      400,
    ],
    [
      'PLAN-SEC-22 stale Plan expected_version',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
          headers: headers(),
          payload: { name: 'Stale', expected_version: 1 },
        }),
      409,
    ],
    [
      'PLAN-SEC-23 stale Feature expected_version',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}/features/${acceptedFeature.id}`,
          headers: headers(),
          payload: { name: 'Stale', expected_version: 1 },
        }),
      409,
    ],
    [
      'PLAN-SEC-24 divergent idempotency-key reuse',
      async () => {
        const key = randomUUID();
        await oidcApp.inject({
          method: 'POST',
          url: '/api/v1/commercial/plans',
          headers: headers(key),
          payload: { plan_code: `repeat-${randomUUID().slice(0, 8)}`, name: 'First' },
        });
        return oidcApp.inject({
          method: 'POST',
          url: '/api/v1/commercial/plans',
          headers: headers(key),
          payload: { plan_code: `repeat-${randomUUID().slice(0, 8)}`, name: 'Different' },
        });
      },
      409,
    ],
    [
      'PLAN-SEC-25 Feature mutation under INACTIVE Plan',
      async () => {
        const deactivate = await oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}`,
          headers: headers(),
          payload: { status: 'INACTIVE', expected_version: acceptedPlan.version },
        });
        acceptedPlan = planEnvelopeSchema.parse(deactivate.json()).data;
        return oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${acceptedPlan.id}/features/${acceptedFeature.id}`,
          headers: headers(),
          payload: { name: 'Blocked', expected_version: acceptedFeature.version },
        });
      },
      422,
    ],
  ];
  for (const [label, request, expected] of securityCases)
    it(label, async () => {
      const response = await request();
      expect(response.statusCode, label).toBe(expected);
      safeError(response);
    });

  it('PLAN_CONCURRENCY and PLAN_FEATURE_CONCURRENCY preserve a single winner and side effects', async () => {
    const create = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/plans',
      headers: headers(),
      payload: { plan_code: `concurrent-${randomUUID().slice(0, 8)}`, name: 'Concurrent' },
    });
    const concurrentPlan = planEnvelopeSchema.parse(create.json()).data;
    const planWrites = await Promise.all(
      ['winner-a', 'winner-b'].map((name) =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${concurrentPlan.id}`,
          headers: headers(),
          payload: { name, expected_version: 1 },
        }),
      ),
    );
    expect(planWrites.map((entry) => entry.statusCode).sort()).toEqual([200, 409]);
    const createdFeature = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/plans/${concurrentPlan.id}/features`,
      headers: headers(),
      payload: { feature_code: `con-${randomUUID().slice(0, 8)}`, name: 'Concurrent feature' },
    });
    const concurrentFeature = planFeatureEnvelopeSchema.parse(createdFeature.json()).data;
    const featureWrites = await Promise.all(
      ['feature-a', 'feature-b'].map((name) =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/plans/${concurrentPlan.id}/features/${concurrentFeature.id}`,
          headers: headers(),
          payload: { name, expected_version: 1 },
        }),
      ),
    );
    expect(featureWrites.map((entry) => entry.statusCode).sort()).toEqual([200, 409]);
    const persisted = await admin.query<{ audits: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource IN ($1,$2)) audits, (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id' IN ($3,$4)) events`,
      [
        `commercial:plan:${concurrentPlan.id}`,
        `commercial:plan:${concurrentFeature.id}`,
        concurrentPlan.id,
        concurrentFeature.id,
      ],
    );
    expect(persisted.rows[0]!.audits).toBeGreaterThanOrEqual(4);
    expect(persisted.rows[0]!.events).toBeGreaterThanOrEqual(4);
  });

  it('PLAN_AUDIT_ACCEPTANCE and PLAN_EVENT_CONTRACT persist redacted tenant-scoped evidence', async () => {
    const audits = await admin.query<{
      tenant_id: string;
      actor_user_id: string;
      metadata: unknown;
    }>(
      `SELECT tenant_id,actor_user_id,metadata FROM platform.audit_logs WHERE resource IN ($1,$2) ORDER BY occurred_at DESC LIMIT 8`,
      [`commercial:plan:${acceptedPlan.id}`, `commercial:plan:${acceptedFeature.id}`],
    );
    const events = await admin.query<{
      tenant_id: string;
      event_type: string;
      schema_version: string;
      payload: unknown;
    }>(
      `SELECT tenant_id,event_type,schema_version,payload FROM platform.domain_events WHERE payload->>'id' IN ($1,$2) ORDER BY occurred_at DESC LIMIT 8`,
      [acceptedPlan.id, acceptedFeature.id],
    );
    expect(audits.rows.length).toBeGreaterThan(0);
    expect(events.rows.length).toBeGreaterThan(0);
    for (const record of audits.rows) {
      expect(record.tenant_id).toBe(tenantA);
      expect(record.actor_user_id).toBe('40000000-0000-4000-8000-000000000044');
      expect(JSON.stringify(record)).not.toMatch(/bearer|postgres|password|token/i);
    }
    for (const record of events.rows) {
      expect(record.tenant_id).toBe(tenantA);
      expect(record.schema_version).toBe('1.0.0');
      expect(record.event_type).toMatch(/^commercial\.plan/);
      expect(JSON.stringify(record)).not.toMatch(/bearer|postgres|password|token/i);
    }
  });

  it('PLAN_TRANSACTION_ATOMICITY and PLAN_OUTBOX_ATOMICITY roll back all success effects', async () => {
    const issued = await admin.query<{ context_token: string }>(
      `SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,'commercial.plan.create')`,
      ['["https://issuer.acs.test","alice"]', tenantA],
    );
    const planCode = `rollback-${randomUUID().slice(0, 8)}`;
    const failed = new PostgresPlanCatalogRepository(requiredEnvironment.plan as string, () => {
      throw new Error('test-only controlled transaction failure');
    });
    try {
      await expect(
        failed.create({
          actorUserId: '40000000-0000-4000-8000-000000000044',
          contextToken: issued.rows[0]!.context_token,
          correlationId: randomUUID(),
          idempotencyKey: randomUUID(),
          requestHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          requestId: randomUUID(),
          tenantId: tenantA,
          plan_code: planCode,
          name: 'Rollback proof',
        }),
      ).rejects.toThrow('test-only controlled transaction failure');
    } finally {
      await failed.close();
    }
    const absent = await admin.query<{ plans: number; audits: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM commercial.plans WHERE tenant_id=$1 AND plan_code=$2) plans,(SELECT count(*)::int FROM platform.audit_logs WHERE metadata::text LIKE '%' || $2 || '%') audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload::text LIKE '%' || $2 || '%') events`,
      [tenantA, planCode],
    );
    expect(absent.rows[0]).toEqual({ plans: 0, audits: 0, events: 0 });
    const success = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/plans',
      headers: headers(),
      payload: { plan_code: planCode, name: 'Rollback proof' },
    });
    expect(success.statusCode, success.body).toBe(200);
    const persisted = await admin.query<{ plans: number; audits: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM commercial.plans WHERE tenant_id=$1 AND plan_code=$2) plans,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:plan:' || (SELECT id::text FROM commercial.plans WHERE tenant_id=$1 AND plan_code=$2)) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=(SELECT id::text FROM commercial.plans WHERE tenant_id=$1 AND plan_code=$2)) events`,
      [tenantA, planCode],
    );
    expect(persisted.rows[0]).toEqual({ plans: 1, audits: 1, events: 1 });
  });
});
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
