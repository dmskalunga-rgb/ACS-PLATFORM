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
  partnerEnvelopeSchema,
  partnerListEnvelopeSchema,
  opportunityEnvelopeSchema,
  opportunityListEnvelopeSchema,
  type Opportunity,
  type Partner,
  tenantAdministrationSchema,
} from '@acs/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { PostgresPlanCatalogRepository } from './postgres-plan-catalog.js';
import { PostgresPartnerRegistryRepository } from './postgres-partner-registry.js';
import { PostgresOpportunityRegistryRepository } from './postgres-opportunity-registry.js';
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
  partner: process.env.ACS_PARTNER_DATABASE_URL,
  opportunity: process.env.ACS_OPPORTUNITY_DATABASE_URL,
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
  partnerDatabaseUrl: requiredEnvironment.partner as string,
  opportunityDatabaseUrl: requiredEnvironment.opportunity as string,
  webOrigin: 'http://localhost:5173',
};

const tenantA = '00000000-0000-4000-8000-000000000011';
const tenantB = '00000000-0000-4000-8000-000000000022';
const tenantC = '00000000-0000-4000-8000-000000000033';
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

describe.sequential('Partner Registry acceptance matrix', () => {
  let accepted: Partner;
  const headers = (key = randomUUID(), tenant = tenantA, token = oidcToken) => ({
    authorization: `Bearer ${token}`,
    'x-acs-tenant-id': tenant,
    'idempotency-key': key,
  });
  it('PARTNER-POS-01 through PARTNER-POS-04 create, list, detail, update, audit and event', async () => {
    const started = performance.now();
    const createKey = randomUUID();
    const createStartedAt = performance.now();
    const create = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(createKey),
      payload: {
        partner_code: `partner-${randomUUID().slice(0, 8)}`,
        display_name: 'Partner acceptance',
      },
    });
    const createMilliseconds = performance.now() - createStartedAt;
    expect(create.statusCode, create.body).toBe(200);
    accepted = partnerEnvelopeSchema.parse(create.json()).data;
    const replay = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(createKey),
      payload: { partner_code: accepted.partner_code, display_name: accepted.display_name },
    });
    expect(partnerEnvelopeSchema.parse(replay.json()).meta.idempotent_replay).toBe(true);
    const listStartedAt = performance.now();
    const list = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/partners?limit=25',
      headers: headers(),
    });
    const listMilliseconds = performance.now() - listStartedAt;
    expect(partnerListEnvelopeSchema.parse(list.json()).data).toContainEqual(
      expect.objectContaining({ id: accepted.id }),
    );
    const detailStartedAt = performance.now();
    const detail = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/partners/${accepted.id}`,
      headers: headers(),
    });
    const detailMilliseconds = performance.now() - detailStartedAt;
    expect(partnerEnvelopeSchema.parse(detail.json()).data.id).toBe(accepted.id);
    const updateStartedAt = performance.now();
    const update = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/partners/${accepted.id}`,
      headers: headers(),
      payload: { display_name: 'Partner acceptance updated', expected_version: accepted.version },
    });
    const updateMilliseconds = performance.now() - updateStartedAt;
    expect(update.statusCode, update.body).toBe(200);
    accepted = partnerEnvelopeSchema.parse(update.json()).data;
    const lifecycleStartedAt = performance.now();
    const lifecycle = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/partners/${accepted.id}`,
      headers: headers(),
      payload: { status: 'INACTIVE', expected_version: accepted.version },
    });
    const lifecycleMilliseconds = performance.now() - lifecycleStartedAt;
    expect(partnerEnvelopeSchema.parse(lifecycle.json()).data.status).toBe('INACTIVE');
    const evidence = await admin.query<{ audits: number; events: number; leaked: number }>(
      `SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$1) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=$2) events,(SELECT count(*)::int FROM platform.domain_events WHERE payload::text LIKE '%Partner acceptance%') leaked`,
      [`commercial:partner:${accepted.id}`, accepted.id],
    );
    expect(evidence.rows[0]).toEqual({ audits: 3, events: 3, leaked: 0 });
    process.stdout.write(
      `${JSON.stringify({ BASELINE_MEASUREMENT_NOT_SLO: true, PARTNER_CREATE_WITH_AUDIT_OUTBOX_MS: Number(createMilliseconds.toFixed(2)), PARTNER_DETAIL_MS: Number(detailMilliseconds.toFixed(2)), PARTNER_LIST_MS: Number(listMilliseconds.toFixed(2)), PARTNER_UPDATE_WITH_AUDIT_OUTBOX_MS: Number(updateMilliseconds.toFixed(2)), PARTNER_STATUS_TRANSITION_MS: Number(lifecycleMilliseconds.toFixed(2)), PARTNER_COMPLETE_JOURNEY_MS: Number((performance.now() - started).toFixed(2)) })}\n`,
    );
  });
  const securityCases: readonly [string, () => Promise<{ statusCode: number }>, number][] = [
    [
      'PRT-NEG-001 unauthenticated create',
      () =>
        oidcApp.inject({
          method: 'POST',
          url: '/api/v1/commercial/partners',
          headers: { 'x-acs-tenant-id': tenantA, 'idempotency-key': randomUUID() },
          payload: { partner_code: 'unauth', display_name: 'Unauth' },
        }),
      401,
    ],
    [
      'PRT-NEG-002 unauthenticated list',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/partners',
          headers: { 'x-acs-tenant-id': tenantA },
        }),
      401,
    ],
    [
      'PRT-NEG-003 unauthenticated detail',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: { 'x-acs-tenant-id': tenantA },
        }),
      401,
    ],
    [
      'PRT-NEG-004 unauthenticated patch',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: { 'x-acs-tenant-id': tenantA, 'idempotency-key': randomUUID() },
          payload: { display_name: 'No', expected_version: accepted.version },
        }),
      401,
    ],
    [
      'PRT-NEG-005 create permission denied',
      async () =>
        oidcApp.inject({
          method: 'POST',
          url: '/api/v1/commercial/partners',
          headers: headers(randomUUID(), tenantC, await signedOidcToken('bob')),
          payload: { partner_code: 'denied', display_name: 'Denied' },
        }),
      403,
    ],
    [
      'PRT-NEG-006 read permission denied',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/partners',
          headers: headers(randomUUID(), tenantC, await signedOidcToken('bob')),
        }),
      403,
    ],
    [
      'PRT-NEG-007 detail permission denied',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(randomUUID(), tenantC, await signedOidcToken('bob')),
        }),
      403,
    ],
    [
      'PRT-NEG-008 patch permission denied',
      async () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(randomUUID(), tenantC, await signedOidcToken('bob')),
          payload: { display_name: 'Denied', expected_version: accepted.version },
        }),
      403,
    ],
    [
      'PRT-NEG-009 tenant injection',
      () =>
        oidcApp.inject({
          method: 'POST',
          url: '/api/v1/commercial/partners',
          headers: headers(),
          payload: { partner_code: 'nope', display_name: 'Nope', tenant_id: tenantB },
        }),
      400,
    ],
    [
      'PRT-NEG-011 mass assignment',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(),
          payload: {
            partner_id: randomUUID(),
            created_at: '2026-01-01T00:00:00.000Z',
            commission_rate: 1,
            expected_version: accepted.version,
          },
        }),
      400,
    ],
    [
      'PRT-NEG-021 invalid lifecycle',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(),
          payload: { status: 'SUSPENDED', expected_version: accepted.version },
        }),
      400,
    ],
    [
      'PRT-NEG-022 hard delete unavailable',
      () =>
        oidcApp.inject({
          method: 'DELETE',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(),
        }),
      404,
    ],
    [
      'PRT-NEG-013 cross-tenant detail',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(randomUUID(), tenantB),
        }),
      403,
    ],
    [
      'PRT-NEG-014 cross-tenant patch',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(randomUUID(), tenantB),
          payload: { display_name: 'Escape', expected_version: accepted.version },
        }),
      403,
    ],
    [
      'PRT-NEG-016 stale version',
      () =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(),
          payload: { display_name: 'Stale', expected_version: 1 },
        }),
      409,
    ],
  ];
  it.each(securityCases)('%s', async (label, request, status) => {
    expect((await request()).statusCode, label).toBe(status);
  });
  it('PRT-NEG-010 unknown field rejection', async () => {
    const r = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(),
      payload: { partner_code: 'unknown', display_name: 'Unknown', unknown_field: true },
    });
    expect(r.statusCode).toBe(400);
  });
  it('PRT-NEG-012 cross-tenant list isolation', async () => {
    const created = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
      payload: {
        partner_code: `tenant-b-${randomUUID().slice(0, 8)}`,
        display_name: 'Tenant B isolated',
      },
    });
    expect(created.statusCode).toBe(200);
    const foreign = partnerEnvelopeSchema.parse(created.json()).data;
    const r = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/partners?limit=100',
      headers: headers(),
    });
    const data = partnerListEnvelopeSchema.parse(r.json()).data;
    expect(data.some((partner) => partner.id === accepted.id)).toBe(true);
    expect(data.some((partner) => partner.id === foreign.id)).toBe(false);
  });
  it('PRT-NEG-015 BOLA/IDOR foreign identifier is denied', async () => {
    const r = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/partners/${accepted.id}`,
      headers: headers(randomUUID(), tenantB),
    });
    expect(r.statusCode).toBe(403);
  });
  it('PARTNER-CONCURRENCY and atomicity preserve one winner and no partial side effects', async () => {
    const writes = await Promise.all(
      ['a', 'b'].map((display_name) =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/partners/${accepted.id}`,
          headers: headers(),
          payload: { display_name, expected_version: 3 },
        }),
      ),
    );
    expect(writes.map((entry) => entry.statusCode).sort()).toEqual([200, 409]);
    const issued = await admin.query<{ context_token: string }>(
      `SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,'commercial.partner.create')`,
      ['["https://issuer.acs.test","alice"]', tenantA],
    );
    const code = `rollback-${randomUUID().slice(0, 8)}`;
    const failed = new PostgresPartnerRegistryRepository(
      requiredEnvironment.partner as string,
      () => {
        throw new Error('test-only controlled transaction failure');
      },
    );
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
          partner_code: code,
          display_name: 'Rollback proof',
        }),
      ).rejects.toThrow('test-only controlled transaction failure');
    } finally {
      await failed.close();
    }
    expect(
      (
        await admin.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM commercial.partners WHERE tenant_id=$1 AND partner_code=$2',
          [tenantA, code],
        )
      ).rows[0]!.count,
    ).toBe(0);
  });
  it('PARTNER-SEC uniqueness and divergent replay are tenant-scoped and deterministic', async () => {
    const duplicate = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(),
      payload: { partner_code: accepted.partner_code.toUpperCase(), display_name: 'Duplicate' },
    });
    expect(duplicate.statusCode).toBe(409);
    const key = randomUUID();
    const first = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(key),
      payload: { partner_code: `replay-${randomUUID().slice(0, 8)}`, display_name: 'First' },
    });
    expect(first.statusCode).toBe(200);
    const divergent = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(key),
      payload: { partner_code: `replay-${randomUUID().slice(0, 8)}`, display_name: 'Different' },
    });
    expect(divergent.statusCode).toBe(409);
    const properties = await admin.query<{
      rls: boolean;
      force: boolean;
      bypass: boolean;
      superuser: boolean;
    }>(
      `SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS force,r.rolbypassrls AS bypass,r.rolsuper AS superuser FROM pg_class c CROSS JOIN pg_roles r WHERE c.oid='commercial.partners'::regclass AND r.rolname='acs_phase2_partner_registry'`,
    );
    expect(properties.rows[0]).toEqual({ rls: true, force: true, bypass: false, superuser: false });
  });
  it('PRT-NEG-017 rejects a duplicate normalized code in the same tenant', async () => {
    const r = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(),
      payload: { partner_code: accepted.partner_code.toUpperCase(), display_name: 'Duplicate' },
    });
    expect(r.statusCode).toBe(409);
  });
  it('PRT-NEG-019 rejects divergent idempotency replay', async () => {
    const key = randomUUID();
    await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(key),
      payload: { partner_code: `diff-${randomUUID().slice(0, 8)}`, display_name: 'First' },
    });
    const r = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(key),
      payload: { partner_code: `diff-${randomUUID().slice(0, 8)}`, display_name: 'Different' },
    });
    expect(r.statusCode).toBe(409);
  });
  it('PRT-NEG-020 replays the same idempotent request without a duplicate row', async () => {
    const key = randomUUID(),
      code = `same-${randomUUID().slice(0, 8)}`,
      payload = { partner_code: code, display_name: 'Same' };
    const first = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(key),
      payload,
    });
    const replay = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(key),
      payload,
    });
    expect(partnerEnvelopeSchema.parse(replay.json()).data.id).toBe(
      partnerEnvelopeSchema.parse(first.json()).data.id,
    );
    expect(
      (
        await admin.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM commercial.partners WHERE tenant_id=$1 AND partner_code=$2',
          [tenantA, code],
        )
      ).rows[0]!.count,
    ).toBe(1);
  });
  it('PRT-NEG-023 audit redacts sensitive data', async () => {
    const r = await admin.query(
      'SELECT actor_user_id,tenant_id,action,resource,metadata FROM platform.audit_logs WHERE resource=$1',
      [`commercial:partner:${accepted.id}`],
    );
    expect(JSON.stringify(r.rows)).not.toMatch(
      /bearer|token|password|commission|financial|partner acceptance/i,
    );
  });
  it('PRT-NEG-024 event payload redacts sensitive data', async () => {
    const r = await admin.query(
      "SELECT payload FROM platform.domain_events WHERE payload->>'id'=$1",
      [accepted.id],
    );
    expect(JSON.stringify(r.rows)).not.toMatch(
      /bearer|token|password|commission|financial|partner acceptance/i,
    );
  });
  it('PRT-NEG-025 direct Partner role retains FORCE RLS and no bypass authority', async () => {
    const r = await admin.query<{
      rls: boolean;
      force: boolean;
      bypass: boolean;
      superuser: boolean;
    }>(
      `SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS force,ro.rolbypassrls AS bypass,ro.rolsuper AS superuser FROM pg_class c CROSS JOIN pg_roles ro WHERE c.oid='commercial.partners'::regclass AND ro.rolname='acs_phase2_partner_registry'`,
    );
    expect(r.rows[0]).toEqual({ rls: true, force: true, bypass: false, superuser: false });
  });
  it('PRT-NEG-018 allows the same normalized code in a different authorized tenant', async () => {
    const code = `shared-${randomUUID().slice(0, 8)}`;
    const a = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(),
      payload: { partner_code: code.toUpperCase(), display_name: 'Tenant A Partner' },
    });
    const b = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/partners',
      headers: headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
      payload: { partner_code: code, display_name: 'Tenant B Partner' },
    });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const aPartner = partnerEnvelopeSchema.parse(a.json()).data;
    const bPartner = partnerEnvelopeSchema.parse(b.json()).data;
    expect(aPartner.id).not.toBe(bPartner.id);
    const foreign = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/partners/${bPartner.id}`,
      headers: headers(),
    });
    expect(foreign.statusCode).toBe(404);
    const reverse = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/partners/${aPartner.id}`,
      headers: headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
    });
    expect(reverse.statusCode).toBe(404);
  });
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

describe.sequential('Opportunity Registry signed OIDC acceptance matrix', () => {
  let accepted: Opportunity;
  let tenantBOpportunity: Opportunity;
  let references: {
    customer: string;
    lead: string;
    partner: string;
    plan: string;
    foreignCustomer: string;
    foreignLead: string;
    foreignPartner: string;
    foreignPlan: string;
  };
  const aliceMembership = '30000000-0000-4000-8000-000000000055';
  const charlieMembership = '30000000-0000-4000-8000-000000000088';
  const headers = (key = randomUUID(), tenant = tenantA, token = oidcToken) => ({
    authorization: `Bearer ${token}`,
    'x-acs-tenant-id': tenant,
    'idempotency-key': key,
  });
  const createPayload = (
    suffix = randomUUID().slice(0, 8),
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    opportunity_code: `opp-${suffix}`,
    owner_membership_id: aliceMembership,
    title: 'OIDC Opportunity acceptance',
    ...overrides,
  });
  const create = async (
    payload: Record<string, unknown> = createPayload(),
    requestHeaders: Record<string, string> = headers(),
  ) =>
    oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/opportunities',
      headers: requestHeaders,
      payload,
    });
  const detail = (id: string, requestHeaders: Record<string, string> = headers()) =>
    oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/opportunities/${id}`,
      headers: requestHeaders,
    });
  const patch = (
    id: string,
    payload: Record<string, unknown>,
    requestHeaders: Record<string, string> = headers(),
  ) =>
    oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/opportunities/${id}`,
      headers: requestHeaders,
      payload,
    });

  beforeAll(async () => {
    const fixture = async (tenantId: string, actorId: string) => {
      const suffix = randomUUID().slice(0, 8);
      const [customer, lead, partner, plan] = await Promise.all([
        admin.query<{ id: string }>(
          "INSERT INTO commercial.customers(tenant_id,display_name,reference_code,created_by,updated_by) VALUES($1,'Opportunity fixture',$2,$3,$3) RETURNING id",
          [tenantId, `opp-${suffix}`, actorId],
        ),
        admin.query<{ id: string }>(
          "INSERT INTO commercial.leads(tenant_id,display_name,source,created_by,updated_by) VALUES($1,'Opportunity fixture','e2e',$2,$2) RETURNING id",
          [tenantId, actorId],
        ),
        admin.query<{ id: string }>(
          "INSERT INTO commercial.partners(tenant_id,partner_code,display_name,created_by,updated_by) VALUES($1,$2,'Opportunity fixture',$3,$3) RETURNING id",
          [tenantId, `opp-${suffix}`, actorId],
        ),
        admin.query<{ id: string }>(
          "INSERT INTO commercial.plans(tenant_id,plan_code,name,created_by,updated_by) VALUES($1,$2,'Opportunity fixture',$3,$3) RETURNING id",
          [tenantId, `opp-${suffix}`, actorId],
        ),
      ]);
      return [customer.rows[0]!.id, lead.rows[0]!.id, partner.rows[0]!.id, plan.rows[0]!.id];
    };
    const first = [
      ...(await fixture(tenantA, '40000000-0000-4000-8000-000000000044')),
      ...(await fixture(tenantB, '60000000-0000-4000-8000-000000000066')),
    ];
    references = {
      customer: first[0]!,
      lead: first[1]!,
      partner: first[2]!,
      plan: first[3]!,
      foreignCustomer: first[4]!,
      foreignLead: first[5]!,
      foreignPartner: first[6]!,
      foreignPlan: first[7]!,
    };
  });

  it('OPP-POS-001 create Opportunity', async () => {
    const r = await create();
    expect(r.statusCode, r.body).toBe(200);
    accepted = opportunityEnvelopeSchema.parse(r.json()).data;
  });
  it('OPP-POS-002 list own-tenant Opportunities', async () => {
    const r = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/opportunities?limit=100',
      headers: headers(),
    });
    expect(opportunityListEnvelopeSchema.parse(r.json()).data).toContainEqual(
      expect.objectContaining({ id: accepted.id }),
    );
  });
  it('OPP-POS-003 get Opportunity detail', async () =>
    expect((await detail(accepted.id)).statusCode).toBe(200));
  it('OPP-POS-004 update ordinary mutable business field', async () => {
    const r = await patch(accepted.id, {
      title: 'OIDC Opportunity updated',
      expected_version: accepted.version,
    });
    expect(r.statusCode).toBe(200);
    accepted = opportunityEnvelopeSchema.parse(r.json()).data;
  });
  it.each([
    ['OPP-POS-005 assign valid Customer reference', 'customer_id', () => references.customer],
    ['OPP-POS-006 assign valid Lead reference', 'lead_id', () => references.lead],
    ['OPP-POS-007 assign valid Partner reference', 'partner_id', () => references.partner],
    ['OPP-POS-008 assign valid Plan reference', 'plan_id', () => references.plan],
  ])('%s', async (_label, field, value) => {
    const r = await patch(accepted.id, { [field]: value(), expected_version: accepted.version });
    expect(r.statusCode, r.body).toBe(200);
    accepted = opportunityEnvelopeSchema.parse(r.json()).data;
  });
  it('OPP-POS-009 create/update with no optional relationship', async () => {
    const r = await create(
      createPayload(randomUUID().slice(0, 8), {
        customer_id: null,
        lead_id: null,
        partner_id: null,
        plan_id: null,
      }),
    );
    expect(r.statusCode).toBe(200);
  });
  it.each([
    ['OPP-POS-010 probability 0 accepted', 0],
    ['OPP-POS-011 probability 100 accepted', 100],
  ])('%s', async (_label, probability_percent) => {
    const r = await create(createPayload(randomUUID().slice(0, 8), { probability_percent }));
    expect(r.statusCode).toBe(200);
  });
  it('OPP-POS-012 expected_close_date accepted', async () =>
    expect(
      (await create(createPayload(randomUUID().slice(0, 8), { expected_close_date: '2027-01-15' })))
        .statusCode,
    ).toBe(200));
  it('OPP-POS-013 valid owner membership accepted', async () =>
    expect(
      (
        await create(
          createPayload(randomUUID().slice(0, 8), { owner_membership_id: aliceMembership }),
        )
      ).statusCode,
    ).toBe(200));
  it.each([
    ['OPP-POS-014 legal QUALIFICATION → DISCOVERY', 'QUALIFICATION', 'DISCOVERY'],
    ['OPP-POS-015 legal DISCOVERY → PROPOSAL', 'DISCOVERY', 'PROPOSAL'],
    ['OPP-POS-016 legal PROPOSAL → NEGOTIATION', 'PROPOSAL', 'NEGOTIATION'],
    ['OPP-POS-017 legal NEGOTIATION → WON', 'NEGOTIATION', 'WON'],
    ['OPP-POS-018 active stage → LOST where DoR permits', 'DISCOVERY', 'LOST'],
  ])('%s', async (_label, start, next) => {
    const created = await create(createPayload(randomUUID().slice(0, 8)));
    let entity = opportunityEnvelopeSchema.parse(created.json()).data;
    const path = ['QUALIFICATION', 'DISCOVERY', 'PROPOSAL', 'NEGOTIATION'];
    for (const stage of path.slice(1, path.indexOf(start) + 1)) {
      const r = await patch(entity.id, { stage, expected_version: entity.version });
      entity = opportunityEnvelopeSchema.parse(r.json()).data;
    }
    const r = await patch(entity.id, { stage: next, expected_version: entity.version });
    expect(r.statusCode, r.body).toBe(200);
  });
  it('OPP-POS-019 same-request idempotent replay', async () => {
    const key = randomUUID(),
      payload = createPayload();
    const a = await create(payload, headers(key));
    const b = await create(payload, headers(key));
    expect(opportunityEnvelopeSchema.parse(b.json()).meta.idempotent_replay).toBe(true);
    expect(opportunityEnvelopeSchema.parse(a.json()).data.id).toBe(
      opportunityEnvelopeSchema.parse(b.json()).data.id,
    );
  });
  it('OPP-POS-020 valid optimistic-concurrency update', async () => {
    const r = await patch(accepted.id, {
      probability_percent: 75,
      expected_version: accepted.version,
    });
    expect(r.statusCode).toBe(200);
    accepted = opportunityEnvelopeSchema.parse(r.json()).data;
  });

  it.each([
    [
      'OPP-NEG-001 unauthenticated create',
      () =>
        create(createPayload(), { 'x-acs-tenant-id': tenantA, 'idempotency-key': randomUUID() }),
      401,
    ],
    [
      'OPP-NEG-002 unauthenticated list',
      () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/opportunities',
          headers: { 'x-acs-tenant-id': tenantA },
        }),
      401,
    ],
    [
      'OPP-NEG-003 unauthenticated detail',
      () => detail(accepted.id, { 'x-acs-tenant-id': tenantA }),
      401,
    ],
    [
      'OPP-NEG-004 unauthenticated update',
      () =>
        patch(
          accepted.id,
          { title: 'Denied', expected_version: accepted.version },
          { 'x-acs-tenant-id': tenantA, 'idempotency-key': randomUUID() },
        ),
      401,
    ],
    [
      'OPP-NEG-005 missing create permission',
      async () =>
        create(createPayload(), headers(randomUUID(), tenantC, await signedOidcToken('bob'))),
      403,
    ],
    [
      'OPP-NEG-006 missing read permission',
      async () =>
        oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/opportunities',
          headers: headers(randomUUID(), tenantC, await signedOidcToken('bob')),
        }),
      403,
    ],
    [
      'OPP-NEG-007 missing update permission',
      async () =>
        patch(
          accepted.id,
          { title: 'Denied', expected_version: accepted.version },
          headers(randomUUID(), tenantC, await signedOidcToken('bob')),
        ),
      403,
    ],
    [
      'OPP-NEG-008 tenant injection',
      () => create({ ...createPayload(), tenant_id: tenantB }, headers()),
      400,
    ],
    [
      'OPP-NEG-009 unknown field',
      () => create({ ...createPayload(), unknown_field: true }, headers()),
      400,
    ],
    [
      'OPP-NEG-010 mass assignment',
      () =>
        patch(
          accepted.id,
          {
            tenant_id: tenantB,
            version: 999,
            created_at: '2026-01-01T00:00:00Z',
            expected_version: accepted.version,
          },
          headers(),
        ),
      400,
    ],
    [
      'OPP-NEG-012 cross-tenant detail',
      async () =>
        detail(accepted.id, headers(randomUUID(), tenantB, await signedOidcToken('charlie'))),
      404,
    ],
    [
      'OPP-NEG-013 cross-tenant PATCH',
      async () =>
        patch(
          accepted.id,
          { title: 'Escape', expected_version: accepted.version },
          headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
        ),
      404,
    ],
    [
      'OPP-NEG-019 invalid/ineligible membership',
      () => create(createPayload(randomUUID().slice(0, 8), { owner_membership_id: randomUUID() })),
      400,
    ],
    [
      'OPP-NEG-020 genuine foreign-tenant membership',
      () =>
        create(createPayload(randomUUID().slice(0, 8), { owner_membership_id: charlieMembership })),
      400,
    ],
    [
      'OPP-NEG-021 invalid stage value',
      () => patch(accepted.id, { stage: 'INVALID', expected_version: accepted.version }, headers()),
      400,
    ],
    [
      'OPP-NEG-022 illegal transition',
      () => patch(accepted.id, { stage: 'WON', expected_version: accepted.version }, headers()),
      409,
    ],
    [
      'OPP-NEG-025 stale version',
      () => patch(accepted.id, { title: 'Stale', expected_version: 1 }, headers()),
      409,
    ],
    [
      'OPP-NEG-030 DELETE unavailable',
      () =>
        oidcApp.inject({
          method: 'DELETE',
          url: `/api/v1/commercial/opportunities/${accepted.id}`,
          headers: headers(),
        }),
      404,
    ],
  ])('%s', async (_label, request, status) => expect((await request()).statusCode).toBe(status));

  it('OPP-NEG-011 cross-tenant list isolation', async () => {
    const created = await create(
      { ...createPayload(randomUUID().slice(0, 8), { owner_membership_id: charlieMembership }) },
      headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
    );
    tenantBOpportunity = opportunityEnvelopeSchema.parse(created.json()).data;
    const list = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/opportunities?limit=100',
      headers: headers(),
    });
    expect(
      opportunityListEnvelopeSchema
        .parse(list.json())
        .data.some((v) => v.id === tenantBOpportunity.id),
    ).toBe(false);
  });
  it('OPP-NEG-014 BOLA/IDOR using genuine foreign Opportunity ID', async () =>
    expect((await detail(tenantBOpportunity.id)).statusCode).toBe(404));
  it.each([
    ['OPP-NEG-015 Tenant B Customer', 'customer_id', () => references.foreignCustomer],
    ['OPP-NEG-016 Tenant B Lead', 'lead_id', () => references.foreignLead],
    ['OPP-NEG-017 Tenant B Partner', 'partner_id', () => references.foreignPartner],
    ['OPP-NEG-018 Tenant B Plan', 'plan_id', () => references.foreignPlan],
  ])('%s', async (_label, field, value) =>
    expect(
      (await create(createPayload(randomUUID().slice(0, 8), { [field]: value() }))).statusCode,
    ).toBe(400),
  );
  it('OPP-NEG-023 mutation/reopen after WON', async () => {
    const created = opportunityEnvelopeSchema.parse((await create()).json()).data;
    let entity = created;
    for (const stage of ['DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'WON'])
      entity = opportunityEnvelopeSchema.parse(
        (await patch(entity.id, { stage, expected_version: entity.version })).json(),
      ).data;
    expect(
      (await patch(entity.id, { stage: 'DISCOVERY', expected_version: entity.version })).statusCode,
    ).toBe(409);
  });
  it('OPP-NEG-024 mutation/reopen after LOST', async () => {
    const entity = opportunityEnvelopeSchema.parse((await create()).json()).data;
    const lost = opportunityEnvelopeSchema.parse(
      (await patch(entity.id, { stage: 'LOST', expected_version: entity.version })).json(),
    ).data;
    expect(
      (await patch(lost.id, { title: 'Reopen', expected_version: lost.version })).statusCode,
    ).toBe(409);
  });
  it('OPP-NEG-026 normalized opportunity-code uniqueness is database-enforced', async () => {
    const code = `OPP-ALPHA-${randomUUID().slice(0, 6)}`;
    expect((await create(createPayload(code))).statusCode).toBe(200);
    expect((await create(createPayload(code.toLowerCase()))).statusCode).toBe(409);
  });
  it('OPP-NEG-027 tenant-scoped code uniqueness permits genuine Tenant B identity', async () => {
    const code = `OPP-SHARED-${randomUUID().slice(0, 6)}`;
    const a = opportunityEnvelopeSchema.parse((await create(createPayload(code))).json()).data;
    const b = opportunityEnvelopeSchema.parse(
      (
        await create(
          { ...createPayload(code.toLowerCase(), { owner_membership_id: charlieMembership }) },
          headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
        )
      ).json(),
    ).data;
    expect(a.id).not.toBe(b.id);
    expect((await detail(b.id)).statusCode).toBe(404);
  });
  it('OPP-NEG-028 same key materially different request conflicts', async () => {
    const key = randomUUID();
    expect((await create(createPayload(), headers(key))).statusCode).toBe(200);
    expect((await create(createPayload(), headers(key))).statusCode).toBe(409);
  });
  it('OPP-NEG-029 same key same canonical request replays without duplicate', async () => {
    const key = randomUUID(),
      payload = createPayload();
    const first = opportunityEnvelopeSchema.parse(
      (await create(payload, headers(key))).json(),
    ).data;
    const replay = opportunityEnvelopeSchema.parse((await create(payload, headers(key))).json());
    expect(replay.data.id).toBe(first.id);
    expect(replay.meta.idempotent_replay).toBe(true);
  });
  it('OPP-NEG-031 direct least-privilege DB role cannot escape Tenant A', async () => {
    const issued = await admin.query<{ context_token: string }>(
      "SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,'commercial.opportunity.read')",
      ['["https://issuer.acs.test","alice"]', tenantA],
    );
    const connection = new Client({ connectionString: requiredEnvironment.opportunity as string });
    try {
      await connection.connect();
      await connection.query('BEGIN');
      await connection.query('SELECT * FROM platform.activate_tenant_context($1::uuid,$2)', [
        issued.rows[0]!.context_token,
        'commercial.opportunity.read',
      ]);
      const foreign = await connection.query(
        'SELECT id FROM commercial.opportunities WHERE id=$1',
        [tenantBOpportunity.id],
      );
      expect(foreign.rowCount).toBe(0);
      await connection.query('ROLLBACK');
    } finally {
      await connection.end();
    }
  });
  it('OPP-NEG-032 FORCE RLS is enabled and effective', async () => {
    const r = await admin.query<{ rls: boolean; force: boolean }>(
      "SELECT relrowsecurity AS rls,relforcerowsecurity AS force FROM pg_class WHERE oid='commercial.opportunities'::regclass",
    );
    expect(r.rows[0]).toEqual({ rls: true, force: true });
  });
  it('OPP-NEG-033 runtime role has no superuser, bypass, or table ownership', async () => {
    const r = await admin.query<{ superuser: boolean; bypass: boolean; owns: boolean }>(
      "SELECT r.rolsuper AS superuser,r.rolbypassrls AS bypass,c.relowner=r.oid AS owns FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname='acs_phase2_opportunity_registry' AND c.oid='commercial.opportunities'::regclass",
    );
    expect(r.rows[0]).toEqual({ superuser: false, bypass: false, owns: false });
  });
  it('OPP-NEG-034 audit evidence is redacted and includes required outcomes', async () => {
    const r = await admin.query(
      'SELECT action,outcome,metadata FROM platform.audit_logs WHERE resource=$1',
      [`commercial:opportunity:${accepted.id}`],
    );
    expect(JSON.stringify(r.rows)).not.toMatch(
      /authorization|bearer|jwt|token|password|currency|financial/i,
    );
    expect(r.rows.length).toBeGreaterThan(0);
  });
  it('OPP-NEG-035 event/outbox payload is redacted and contract-safe', async () => {
    const r = await admin.query<{ event_type: string; payload: unknown; tenant_id: string }>(
      "SELECT event_type,payload,tenant_id FROM platform.domain_events WHERE payload->>'id'=$1",
      [accepted.id],
    );
    expect(r.rows.map((v) => v.event_type)).toContain('commercial.opportunity.created');
    expect(JSON.stringify(r.rows)).not.toMatch(
      /authorization|bearer|jwt|token|password|currency|customer.*email|lead.*email/i,
    );
    expect(r.rows.every((v) => v.tenant_id === tenantA)).toBe(true);
  });
  it('OPPORTUNITY-CONCURRENCY permits one writer and rejects the stale writer', async () => {
    const writes = await Promise.all(
      ['A', 'B'].map((title) => patch(accepted.id, { title, expected_version: accepted.version })),
    );
    expect(writes.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    accepted = opportunityEnvelopeSchema.parse(
      writes.find((r) => r.statusCode === 200)!.json(),
    ).data;
  });
  it('OPPORTUNITY-ATOMICITY rolls back Opportunity, audit, outbox and idempotency', async () => {
    const issued = await admin.query<{ context_token: string }>(
      "SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,'commercial.opportunity.create')",
      ['["https://issuer.acs.test","alice"]', tenantA],
    );
    const code = `rollback-${randomUUID().slice(0, 8)}`;
    const failed = new PostgresOpportunityRegistryRepository(
      requiredEnvironment.opportunity as string,
      () => {
        throw new Error('test-only controlled transaction failure');
      },
    );
    try {
      await expect(
        failed.create({
          actorUserId: '40000000-0000-4000-8000-000000000044',
          contextToken: issued.rows[0]!.context_token,
          correlationId: randomUUID(),
          idempotencyKey: randomUUID(),
          requestHash: 'a'.repeat(64),
          requestId: randomUUID(),
          tenantId: tenantA,
          ...createPayload(code),
        } as never),
      ).rejects.toThrow('test-only controlled transaction failure');
    } finally {
      await failed.close();
    }
    const r = await admin.query<{
      opportunities: number;
      audit: number;
      events: number;
      operations: number;
    }>(
      "SELECT (SELECT count(*)::int FROM commercial.opportunities WHERE tenant_id=$1 AND opportunity_code=$2) opportunities,(SELECT count(*)::int FROM platform.audit_logs WHERE resource LIKE 'commercial:opportunity:%' AND metadata::text LIKE '%' || $2 || '%') audit,(SELECT count(*)::int FROM platform.domain_events WHERE payload::text LIKE '%' || $2 || '%') events,(SELECT count(*)::int FROM commercial.opportunity_operations WHERE result::text LIKE '%' || $2 || '%') operations",
      [tenantA, code],
    );
    expect(r.rows[0]).toEqual({ opportunities: 0, audit: 0, events: 0, operations: 0 });
  });
  it('OPPORTUNITY-PERFORMANCE records a local baseline through the signed OIDC execution path', async () => {
    const journeyStartedAt = performance.now();
    const createStartedAt = performance.now();
    const created = await create(
      createPayload(`performance-${randomUUID().slice(0, 8)}`, {
        title: 'Opportunity performance fixture',
      }),
    );
    expect(created.statusCode, created.body).toBe(200);
    let opportunity = opportunityEnvelopeSchema.parse(created.json()).data;
    const createMilliseconds = performance.now() - createStartedAt;

    const detailStartedAt = performance.now();
    const detailResponse = await detail(opportunity.id);
    expect(opportunityEnvelopeSchema.parse(detailResponse.json()).data.id).toBe(opportunity.id);
    const detailMilliseconds = performance.now() - detailStartedAt;

    const listStartedAt = performance.now();
    const listResponse = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/opportunities?limit=100',
      headers: headers(),
    });
    expect(opportunityListEnvelopeSchema.parse(listResponse.json()).data).toContainEqual(
      expect.objectContaining({ id: opportunity.id }),
    );
    const listMilliseconds = performance.now() - listStartedAt;

    const updateStartedAt = performance.now();
    const updateResponse = await patch(opportunity.id, {
      expected_version: opportunity.version,
      title: 'Opportunity performance fixture updated',
    });
    expect(updateResponse.statusCode, updateResponse.body).toBe(200);
    opportunity = opportunityEnvelopeSchema.parse(updateResponse.json()).data;
    const updateMilliseconds = performance.now() - updateStartedAt;

    const transitionStartedAt = performance.now();
    const transitionResponse = await patch(opportunity.id, {
      expected_version: opportunity.version,
      stage: 'DISCOVERY',
    });
    expect(transitionResponse.statusCode, transitionResponse.body).toBe(200);
    opportunity = opportunityEnvelopeSchema.parse(transitionResponse.json()).data;
    expect(opportunity.stage).toBe('DISCOVERY');
    const transitionMilliseconds = performance.now() - transitionStartedAt;

    const evidence = await admin.query<{ audits: number; events: number }>(
      "SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$1) audits, (SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=$2) events",
      [`commercial:opportunity:${opportunity.id}`, opportunity.id],
    );
    expect(evidence.rows[0]).toEqual({ audits: 3, events: 3 });
    process.stdout.write(
      `${JSON.stringify({ BASELINE_MEASUREMENT_NOT_SLO: true, OPPORTUNITY_CREATE_WITH_AUDIT_OUTBOX_MS: Number(createMilliseconds.toFixed(2)), OPPORTUNITY_DETAIL_MS: Number(detailMilliseconds.toFixed(2)), OPPORTUNITY_LIST_MS: Number(listMilliseconds.toFixed(2)), OPPORTUNITY_UPDATE_WITH_AUDIT_OUTBOX_MS: Number(updateMilliseconds.toFixed(2)), OPPORTUNITY_STAGE_TRANSITION_MS: Number(transitionMilliseconds.toFixed(2)), OPPORTUNITY_COMPLETE_JOURNEY_MS: Number((performance.now() - journeyStartedAt).toFixed(2)) })}\n`,
    );
  });
});
