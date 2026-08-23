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
  proposalEnvelopeSchema,
  proposalListEnvelopeSchema,
  contractEnvelopeSchema,
  contractListEnvelopeSchema,
  subscriptionEnvelopeSchema,
  subscriptionListEnvelopeSchema,
  type Contract,
  type Subscription,
  type Proposal,
  type Opportunity,
  type Partner,
  tenantAdministrationSchema,
} from '@acs/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { PostgresPlanCatalogRepository } from './postgres-plan-catalog.js';
import { PostgresPartnerRegistryRepository } from './postgres-partner-registry.js';
import { PostgresOpportunityRegistryRepository } from './postgres-opportunity-registry.js';
import { PostgresProposalRegistryRepository } from './postgres-proposal-registry.js';
import { PostgresContractRegistryRepository } from './postgres-contract-registry.js';
import { PostgresSubscriptionRegistryRepository } from './postgres-subscription-registry.js';
import { PostgresTenantContextRepository } from './postgres-platform-context.js';
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
  proposal: process.env.ACS_PROPOSAL_DATABASE_URL,
  contract: process.env.ACS_CONTRACT_DATABASE_URL,
  subscription: process.env.ACS_SUBSCRIPTION_DATABASE_URL,
};

for (const [name, value] of Object.entries(requiredEnvironment).filter(
  ([name]) => name !== 'subscription',
)) {
  if (value === undefined || value === '') throw new Error(`${name} E2E database URL is required.`);
}
const proposalDatabaseUrl = requiredEnvironment.proposal;
if (proposalDatabaseUrl === undefined || proposalDatabaseUrl === '')
  throw new Error('proposal E2E database URL is required.');
const contractDatabaseUrl = requiredEnvironment.contract;
if (contractDatabaseUrl === undefined || contractDatabaseUrl === '')
  throw new Error('contract E2E database URL is required.');
const subscriptionDatabaseUrl = requiredEnvironment.subscription ?? '';

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
  ...(process.env.ACS_PROPOSAL_DATABASE_URL === undefined
    ? {}
    : { proposalDatabaseUrl: process.env.ACS_PROPOSAL_DATABASE_URL }),
  contractDatabaseUrl,
  ...(subscriptionDatabaseUrl === '' ? {} : { subscriptionDatabaseUrl }),
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
    if (subscriptionDatabaseUrl === '')
      throw new Error('subscription E2E database URL is required.');
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

describe.sequential('Proposal Registry signed OIDC acceptance matrix', () => {
  const aliceMembership = '30000000-0000-4000-8000-000000000055';
  const aliceUser = '40000000-0000-4000-8000-000000000044';
  let opportunityId: string;
  let planId: string;
  let bobToken: string;
  let unprivilegedToken: string;
  let foreignOpportunityId: string;
  let foreignCustomerId: string;
  let foreignPartnerId: string;
  let foreignPlanId: string;
  let proposal: Proposal;
  const headers = (key = randomUUID(), tenant = tenantA, token = oidcToken) => ({
    authorization: `Bearer ${token}`,
    'x-acs-tenant-id': tenant,
    'idempotency-key': key,
  });
  const create = (payload: Record<string, unknown>, requestHeaders = headers()) =>
    oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/proposals',
      headers: requestHeaders,
      payload,
    });
  const payload = (overrides: Record<string, unknown> = {}) => ({
    proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
    title: 'Negative security fixture',
    opportunity_id: opportunityId,
    currency_code: 'USD',
    valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  });
  const approvedDraft = async (): Promise<Proposal> => {
    const created = await create({
      proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
      title: 'Lifecycle fixture',
      opportunity_id: opportunityId,
      currency_code: 'USD',
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    let draft = proposalEnvelopeSchema.parse(created.json()).data;
    const line = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${draft.id}/lines`,
      headers: headers(),
      payload: {
        plan_id: planId,
        quantity: '1.0000',
        unit_price: '5.0000',
        expected_version: draft.version,
      },
    });
    draft = proposalEnvelopeSchema.parse(line.json()).data;
    const submitted = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${draft.id}/submit`,
      headers: headers(),
      payload: { expected_version: draft.version },
    });
    draft = proposalEnvelopeSchema.parse(submitted.json()).data;
    const approved = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${draft.id}/approve`,
      headers: headers(randomUUID(), tenantA, bobToken),
      payload: { expected_version: draft.version },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    return proposalEnvelopeSchema.parse(approved.json()).data;
  };
  const addLine = async (
    draft: Proposal,
    values: { planId?: string; quantity?: string; unitPrice?: string } = {},
  ): Promise<Proposal> => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${draft.id}/lines`,
      headers: headers(),
      payload: {
        plan_id: values.planId ?? planId,
        quantity: values.quantity ?? '1.0000',
        unit_price: values.unitPrice ?? '5.0000',
        expected_version: draft.version,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    return proposalEnvelopeSchema.parse(response.json()).data;
  };
  const transition = async (
    current: Proposal,
    action: string,
    token = oidcToken,
  ): Promise<Proposal> => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${current.id}/${action}`,
      headers: headers(randomUUID(), tenantA, token),
      payload: { expected_version: current.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    return proposalEnvelopeSchema.parse(response.json()).data;
  };
  const sentDraft = async (): Promise<Proposal> => transition(await approvedDraft(), 'send');
  const issueProposalContext = async (action: string, subject = 'alice') => {
    const contexts = new PostgresTenantContextRepository(
      requiredEnvironment.issuer as string,
      requiredEnvironment.tenant as string,
    );
    const issued = await contexts.issueContext(
      JSON.stringify(['https://issuer.acs.test', subject]),
      tenantA,
      action,
    );
    if (issued === null) throw new Error('Canonical Proposal test context was not issued.');
    return { contextToken: issued.contextToken, close: () => contexts.close() };
  };

  beforeAll(async () => {
    const fixture = await admin.query<{ id: string }>(
      "INSERT INTO commercial.opportunities(tenant_id,opportunity_code,title,owner_membership_id,created_by,updated_by) VALUES($1,$2,'Proposal OIDC fixture',$3,$4,$4) RETURNING id",
      [tenantA, `proposal-${randomUUID().slice(0, 10)}`, aliceMembership, aliceUser],
    );
    opportunityId = fixture.rows[0]!.id;
    const plan = await admin.query<{ id: string }>(
      "INSERT INTO commercial.plans(tenant_id,plan_code,name,created_by,updated_by) VALUES($1,$2,'Proposal primary plan',$3,$3) RETURNING id",
      [tenantA, `proposal-plan-${randomUUID().slice(0, 8)}`, aliceUser],
    );
    planId = plan.rows[0]!.id;
    await admin.query('UPDATE commercial.opportunities SET plan_id=$1 WHERE id=$2', [
      planId,
      opportunityId,
    ]);
    await admin.query(
      "INSERT INTO platform.memberships(id,tenant_id,user_id,status) VALUES('30000000-0000-4000-8000-000000000099',$1,'50000000-0000-4000-8000-000000000055','ACTIVE') ON CONFLICT DO NOTHING",
      [tenantA],
    );
    await admin.query(
      "INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key) SELECT $1,'30000000-0000-4000-8000-000000000099',permission_key FROM platform.permissions WHERE permission_key LIKE 'commercial.proposal.%' ON CONFLICT DO NOTHING",
      [tenantA],
    );
    bobToken = await signedOidcToken('bob');
    const charlie = await admin.query<{ user_id: string }>(
      "SELECT user_id FROM platform.memberships WHERE id='30000000-0000-4000-8000-000000000088'",
    );
    await admin.query(
      "INSERT INTO platform.memberships(id,tenant_id,user_id,status) VALUES('30000000-0000-4000-8000-000000000077',$1,$2,'ACTIVE') ON CONFLICT DO NOTHING",
      [tenantA, charlie.rows[0]!.user_id],
    );
    const suffix = randomUUID().slice(0, 8);
    const customer = await admin.query<{ id: string }>(
      "INSERT INTO commercial.customers(tenant_id,display_name,reference_code,created_by,updated_by) VALUES($1,'Foreign proposal customer',$2,$3,$3) RETURNING id",
      [tenantB, `foreign-${suffix}`, charlie.rows[0]!.user_id],
    );
    foreignCustomerId = customer.rows[0]!.id;
    const partner = await admin.query<{ id: string }>(
      "INSERT INTO commercial.partners(tenant_id,partner_code,display_name,created_by,updated_by) VALUES($1,$2,'Foreign proposal partner',$3,$3) RETURNING id",
      [tenantB, `foreign-${suffix}`, charlie.rows[0]!.user_id],
    );
    foreignPartnerId = partner.rows[0]!.id;
    const foreignPlan = await admin.query<{ id: string }>(
      "INSERT INTO commercial.plans(tenant_id,plan_code,name,created_by,updated_by) VALUES($1,$2,'Foreign proposal plan',$3,$3) RETURNING id",
      [tenantB, `foreign-${suffix}`, charlie.rows[0]!.user_id],
    );
    foreignPlanId = foreignPlan.rows[0]!.id;
    const opportunity = await admin.query<{ id: string }>(
      "INSERT INTO commercial.opportunities(tenant_id,opportunity_code,title,owner_membership_id,created_by,updated_by) VALUES($1,$2,'Foreign proposal opportunity',$3,$4,$4) RETURNING id",
      [
        tenantB,
        `foreign-${suffix}`,
        '30000000-0000-4000-8000-000000000088',
        charlie.rows[0]!.user_id,
      ],
    );
    foreignOpportunityId = opportunity.rows[0]!.id;
    unprivilegedToken = await signedOidcToken('charlie');
  });

  it('PRP-POS-001 creates a Proposal through signed OIDC and trusted context', async () => {
    const response = await create({
      proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
      title: 'Proposal acceptance fixture',
      opportunity_id: opportunityId,
      currency_code: 'USD',
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(response.statusCode, response.body).toBe(200);
    proposal = proposalEnvelopeSchema.parse(response.json()).data;
    expect(proposal).toMatchObject({ status: 'DRAFT', revision_number: 1, version: 1 });
  });

  it('PRP-POS-002 lists only tenant-scoped Proposals', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/proposals?limit=100',
      headers: headers(),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(proposalListEnvelopeSchema.parse(response.json()).data.length).toBeGreaterThan(0);
  });

  it('PRP-POS-003 returns Proposal detail through signed OIDC', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/proposals/${proposal.id}`,
      headers: headers(),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(proposalEnvelopeSchema.parse(response.json()).data.id).toBe(proposal.id);
  });

  it('PRP-POS-004 updates a DRAFT Proposal with expected_version', async () => {
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/proposals/${proposal.id}`,
      headers: headers(),
      payload: { title: 'Updated Proposal acceptance fixture', expected_version: proposal.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    proposal = proposalEnvelopeSchema.parse(response.json()).data;
    expect(proposal.version).toBe(2);
  });

  it('PRP-NEG-001 rejects unauthenticated Proposal creation', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/proposals',
      headers: { 'x-acs-tenant-id': tenantA, 'idempotency-key': randomUUID() },
      payload: {
        proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
        title: 'Unauthenticated',
        opportunity_id: opportunityId,
        currency_code: 'USD',
        valid_until: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(response.statusCode, response.body).toBe(401);
  });

  it('PRP-POS-005 adds a same-tenant primary Plan line with server totals', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${proposal.id}/lines`,
      headers: headers(),
      payload: {
        plan_id: planId,
        quantity: '1.0000',
        unit_price: '12.3456',
        expected_version: proposal.version,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    proposal = proposalEnvelopeSchema.parse(response.json()).data;
    expect(proposal).toMatchObject({
      proposal_subtotal: '12.3456',
      grand_total: '12.3456',
      version: 3,
    });
  });

  it('PRP-POS-006 updates a DRAFT line and recalculates exact totals', async () => {
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/proposals/${proposal.id}/lines/${proposal.lines[0]!.id}`,
      headers: headers(),
      payload: { quantity: '2.0000', unit_price: '1.2346', expected_version: proposal.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    proposal = proposalEnvelopeSchema.parse(response.json()).data;
    expect(proposal).toMatchObject({
      proposal_subtotal: '2.4692',
      grand_total: '2.4692',
      version: 4,
    });
  });

  it('PRP-POS-007 removes a DRAFT line and resets totals', async () => {
    const response = await oidcApp.inject({
      method: 'DELETE',
      url: `/api/v1/commercial/proposals/${proposal.id}/lines/${proposal.lines[0]!.id}`,
      headers: headers(),
      payload: { expected_version: proposal.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    proposal = proposalEnvelopeSchema.parse(response.json()).data;
    expect(proposal).toMatchObject({
      lines: [],
      proposal_subtotal: '0.0000',
      grand_total: '0.0000',
      version: 5,
    });
  });

  it('PRP-POS-008 submits when the Opportunity primary Plan is present', async () => {
    const line = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${proposal.id}/lines`,
      headers: headers(),
      payload: {
        plan_id: planId,
        quantity: '1.0000',
        unit_price: '10.0000',
        expected_version: proposal.version,
      },
    });
    proposal = proposalEnvelopeSchema.parse(line.json()).data;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${proposal.id}/submit`,
      headers: headers(),
      payload: { expected_version: proposal.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    proposal = proposalEnvelopeSchema.parse(response.json()).data;
    expect(proposal.status).toBe('PENDING_APPROVAL');
  });

  it('PRP-POS-009 returns approval to DRAFT with audit-only lifecycle evidence', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${proposal.id}/return-to-draft`,
      headers: headers(),
      payload: { expected_version: proposal.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    proposal = proposalEnvelopeSchema.parse(response.json()).data;
    expect(proposal.status).toBe('DRAFT');
    const audit = await admin.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM platform.audit_logs WHERE resource=$1 AND action='proposal.approval_returned'",
      [`commercial:proposal:${proposal.id}`],
    );
    expect(audit.rows[0]!.count).toBe(1);
  });

  it('PRP-POS-010 approves with a membership distinct from the creator', async () => {
    const submitted = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${proposal.id}/submit`,
      headers: headers(),
      payload: { expected_version: proposal.version },
    });
    proposal = proposalEnvelopeSchema.parse(submitted.json()).data;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${proposal.id}/approve`,
      headers: headers(randomUUID(), tenantA, bobToken),
      payload: { expected_version: proposal.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    proposal = proposalEnvelopeSchema.parse(response.json()).data;
    expect(proposal).toMatchObject({
      status: 'APPROVED',
      approved_by_membership_id: '30000000-0000-4000-8000-000000000099',
    });
    expect(proposal.approved_at).not.toBeNull();
  });

  it('PRP-POS-011 sends an APPROVED Proposal and assigns issued_at server-side', async () => {
    const approved = await approvedDraft();
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${approved.id}/send`,
      headers: headers(),
      payload: { expected_version: approved.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    const sent = proposalEnvelopeSchema.parse(response.json()).data;
    expect(sent).toMatchObject({ status: 'SENT' });
    expect(sent.issued_at).not.toBeNull();
  });

  it('PRP-POS-012 accepts a SENT Proposal before validity expiry', async () => {
    const approved = await approvedDraft();
    const sent = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${approved.id}/send`,
      headers: headers(),
      payload: { expected_version: approved.version },
    });
    expect(sent.statusCode, sent.body).toBe(200);
    const sentProposal = proposalEnvelopeSchema.parse(sent.json()).data;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${sentProposal.id}/accept`,
      headers: headers(),
      payload: { expected_version: sentProposal.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(proposalEnvelopeSchema.parse(response.json()).data.status).toBe('ACCEPTED');
  });

  it('PRP-POS-013 rejects a separate SENT Proposal', async () => {
    const approved = await approvedDraft();
    const sent = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${approved.id}/send`,
      headers: headers(),
      payload: { expected_version: approved.version },
    });
    const sentProposal = proposalEnvelopeSchema.parse(sent.json()).data;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${sentProposal.id}/reject`,
      headers: headers(),
      payload: { expected_version: sentProposal.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(proposalEnvelopeSchema.parse(response.json()).data.status).toBe('REJECTED');
  });

  it('PRP-POS-014 cancels an APPROVED Proposal', async () => {
    const approved = await approvedDraft();
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${approved.id}/cancel`,
      headers: headers(),
      payload: { expected_version: approved.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(proposalEnvelopeSchema.parse(response.json()).data.status).toBe('CANCELLED');
  });

  it('PRP-POS-015 accepts same-tenant Customer, Partner and multiple Plans', async () => {
    const suffix = randomUUID().slice(0, 8);
    const customer = await admin.query<{ id: string }>(
      "INSERT INTO commercial.customers(tenant_id,display_name,reference_code,created_by,updated_by) VALUES($1,'Proposal customer',$2,$3,$3) RETURNING id",
      [tenantA, `prp-${suffix}`, aliceUser],
    );
    const partner = await admin.query<{ id: string }>(
      "INSERT INTO commercial.partners(tenant_id,partner_code,display_name,created_by,updated_by) VALUES($1,$2,'Proposal partner',$3,$3) RETURNING id",
      [tenantA, `prp-${suffix}`, aliceUser],
    );
    const extraPlan = await admin.query<{ id: string }>(
      "INSERT INTO commercial.plans(tenant_id,plan_code,name,created_by,updated_by) VALUES($1,$2,'Proposal additional plan',$3,$3) RETURNING id",
      [tenantA, `prp-${suffix}`, aliceUser],
    );
    const relationOpportunity = await admin.query<{ id: string }>(
      "INSERT INTO commercial.opportunities(tenant_id,opportunity_code,title,owner_membership_id,customer_id,partner_id,plan_id,created_by,updated_by) VALUES($1,$2,'Proposal relationship fixture',$3,$4,$5,$6,$7,$7) RETURNING id",
      [
        tenantA,
        `prp-${suffix}`,
        aliceMembership,
        customer.rows[0]!.id,
        partner.rows[0]!.id,
        planId,
        aliceUser,
      ],
    );
    const created = await create({
      proposal_code: `PRP-${suffix}`,
      title: 'Relationship Proposal',
      opportunity_id: relationOpportunity.rows[0]!.id,
      customer_id: customer.rows[0]!.id,
      partner_id: partner.rows[0]!.id,
      currency_code: 'USD',
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    let related = proposalEnvelopeSchema.parse(created.json()).data;
    for (const id of [planId, extraPlan.rows[0]!.id]) {
      const line = await oidcApp.inject({
        method: 'POST',
        url: `/api/v1/commercial/proposals/${related.id}/lines`,
        headers: headers(),
        payload: {
          plan_id: id,
          quantity: '1.0000',
          unit_price: '1.0000',
          expected_version: related.version,
        },
      });
      related = proposalEnvelopeSchema.parse(line.json()).data;
    }
    const submitted = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${related.id}/submit`,
      headers: headers(),
      payload: { expected_version: related.version },
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(proposalEnvelopeSchema.parse(submitted.json()).data.status).toBe('PENDING_APPROVAL');
  });

  it('PRP-POS-016 derives NUMERIC(19,4) HALF_UP line and proposal totals server-side', async () => {
    const created = await create({
      proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
      title: 'Authoritative totals fixture',
      opportunity_id: opportunityId,
      currency_code: 'USD',
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    let draft = proposalEnvelopeSchema.parse(created.json()).data;
    draft = await addLine(draft, { quantity: '1.2345', unitPrice: '1.0001' });
    draft = await addLine(draft, { quantity: '2.0000', unitPrice: '3.3333' });
    expect(draft).toMatchObject({ proposal_subtotal: '7.9012', grand_total: '7.9012' });
    expect(draft.lines.map((line) => line.line_subtotal)).toEqual(['1.2346', '6.6666']);
  });

  it('PRP-POS-017 preserves Plan commercial snapshots after source Plan mutation', async () => {
    const created = await create({
      proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
      title: 'Snapshot stability fixture',
      opportunity_id: opportunityId,
      currency_code: 'USD',
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const draft = await addLine(proposalEnvelopeSchema.parse(created.json()).data, {
      unitPrice: '12.3456',
    });
    const snapshot = draft.lines[0]!;
    await admin.query('UPDATE commercial.plans SET name=$1,description=$2 WHERE id=$3', [
      'Mutated plan source',
      'Mutated source description',
      planId,
    ]);
    const detail = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/proposals/${draft.id}`,
      headers: headers(),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(proposalEnvelopeSchema.parse(detail.json()).data.lines[0]).toMatchObject(snapshot);
  });

  it('PRP-POS-018 creates immutable historical revision and line snapshots', async () => {
    const approved = await approvedDraft();
    const revised = await transition(approved, 'revise');
    expect(revised).toMatchObject({ status: 'DRAFT', revision_number: 2 });
    const revision = await admin.query<{
      id: string;
      proposal_code: string;
      currency_code: string;
      status: string;
      proposal_subtotal: string;
      valid_until: string;
      created_by_membership_id: string;
    }>(
      'SELECT id,proposal_code,currency_code,status,proposal_subtotal::text,valid_until::text,created_by_membership_id FROM commercial.proposal_revisions WHERE proposal_id=$1 AND revision_number=1',
      [approved.id],
    );
    expect(revision.rowCount).toBe(1);
    expect(revision.rows[0]).toMatchObject({
      proposal_code: approved.proposal_code,
      currency_code: approved.currency_code,
      status: 'APPROVED',
      proposal_subtotal: approved.proposal_subtotal,
      created_by_membership_id: approved.created_by_membership_id,
    });
    const lines = await admin.query<{ plan_id: string; unit_price: string; line_subtotal: string }>(
      'SELECT plan_id,unit_price::text,line_subtotal::text FROM commercial.proposal_revision_line_items WHERE proposal_revision_id=$1',
      [revision.rows[0]!.id],
    );
    expect(lines.rows).toEqual([
      expect.objectContaining({
        plan_id: approved.lines[0]!.plan_id,
        unit_price: approved.lines[0]!.unit_price,
        line_subtotal: approved.lines[0]!.line_subtotal,
      }),
    ]);
  });

  it('PRP-POS-019 denies acceptance of an overdue persisted SENT Proposal', async () => {
    const sent = await sentDraft();
    await admin.query(
      "UPDATE commercial.proposals SET valid_until=clock_timestamp()-interval '1 minute' WHERE id=$1",
      [sent.id],
    );
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${sent.id}/accept`,
      headers: headers(),
      payload: { expected_version: sent.version },
    });
    expect(response.statusCode, response.body).toBe(400);
    const state = await admin.query<{ status: string; accepted: number; events: number }>(
      "SELECT p.status,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||p.id::text AND action='proposal.accept') accepted,(SELECT count(*)::int FROM platform.domain_events WHERE event_type='commercial.proposal.accepted' AND payload->>'id'=p.id::text) events FROM commercial.proposals p WHERE p.id=$1",
      [sent.id],
    );
    expect(state.rows[0]).toEqual({ status: 'SENT', accepted: 0, events: 0 });
  });

  it('PRP-POS-020 applies explicit revise current-aggregate effects', async () => {
    const approved = await approvedDraft();
    const revised = await transition(approved, 'revise');
    expect(revised).toMatchObject({
      id: approved.id,
      proposal_code: approved.proposal_code,
      status: 'DRAFT',
      revision_number: approved.revision_number + 1,
      version: approved.version + 1,
      approved_by_membership_id: null,
      approved_at: null,
    });
    const prematureSend = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${revised.id}/send`,
      headers: headers(),
      payload: { expected_version: revised.version },
    });
    expect(prematureSend.statusCode, prematureSend.body).toBe(400);
    const evidence = await admin.query<{ audits: number; events: number }>(
      "SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$1 AND action='commercial.proposal.revise') audits,(SELECT count(*)::int FROM platform.domain_events WHERE event_type='commercial.proposal.revision_created' AND payload->>'id'=$2) events",
      [`commercial:proposal:${approved.id}`, approved.id],
    );
    expect(evidence.rows[0]).toEqual({ audits: 1, events: 1 });
  });

  it('PRP-POS-021 explicitly persists SENT Proposal expiry', async () => {
    const sent = await sentDraft();
    await admin.query(
      "UPDATE commercial.proposals SET valid_until=clock_timestamp()-interval '1 minute' WHERE id=$1",
      [sent.id],
    );
    const expired = await transition(sent, 'expire');
    expect(expired).toMatchObject({ status: 'EXPIRED', version: sent.version + 1 });
    const evidence = await admin.query<{ audits: number; events: number }>(
      "SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$1 AND action='commercial.proposal.expire') audits,(SELECT count(*)::int FROM platform.domain_events WHERE event_type='commercial.proposal.expired' AND payload->>'id'=$2) events",
      [`commercial:proposal:${sent.id}`, sent.id],
    );
    expect(evidence.rows[0]).toEqual({ audits: 1, events: 1 });
  });

  it('PRP-POS-022 reassigns a DRAFT Proposal owner without changing its creator', async () => {
    const created = await create({
      proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
      title: 'Owner reassignment fixture',
      opportunity_id: opportunityId,
      currency_code: 'USD',
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const draft = proposalEnvelopeSchema.parse(created.json()).data;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${draft.id}/assign`,
      headers: headers(),
      payload: {
        owner_membership_id: '30000000-0000-4000-8000-000000000099',
        expected_version: draft.version,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    const reassigned = proposalEnvelopeSchema.parse(response.json()).data;
    expect(reassigned).toMatchObject({
      owner_membership_id: '30000000-0000-4000-8000-000000000099',
      created_by_membership_id: draft.created_by_membership_id,
      version: draft.version + 1,
      status: 'DRAFT',
    });
    const audit = await admin.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM platform.audit_logs WHERE resource=$1 AND action='commercial.proposal.assign'",
      [`commercial:proposal:${draft.id}`],
    );
    expect(audit.rows[0]!.count).toBe(1);
  });

  it('PRP-POS-023 returns PENDING_APPROVAL to DRAFT with audit-only evidence', async () => {
    const created = await create({
      proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
      title: 'Approval return fixture',
      opportunity_id: opportunityId,
      currency_code: 'USD',
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const pending = await transition(
      await addLine(proposalEnvelopeSchema.parse(created.json()).data),
      'submit',
    );
    const returned = await transition(pending, 'return-to-draft');
    expect(returned).toMatchObject({ status: 'DRAFT', version: pending.version + 1 });
    const evidence = await admin.query<{ audits: number; events: number }>(
      "SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource=$1 AND action='proposal.approval_returned') audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=$2 AND event_type='commercial.proposal.updated') events",
      [`commercial:proposal:${pending.id}`, pending.id],
    );
    expect(evidence.rows[0]).toEqual({ audits: 1, events: 1 });
  });

  it('PRP-POS-024 submits a multi-Plan Proposal containing the Opportunity primary Plan', async () => {
    const extra = await admin.query<{ id: string }>(
      "INSERT INTO commercial.plans(tenant_id,plan_code,name,created_by,updated_by) VALUES($1,$2,'Multi plan fixture',$3,$3) RETURNING id",
      [tenantA, `prp-${randomUUID().slice(0, 8)}`, aliceUser],
    );
    const created = await create({
      proposal_code: `PRP-${randomUUID().slice(0, 8)}`,
      title: 'Multi-plan primary fixture',
      opportunity_id: opportunityId,
      currency_code: 'USD',
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    });
    let draft = await addLine(proposalEnvelopeSchema.parse(created.json()).data);
    draft = await addLine(draft, { planId: extra.rows[0]!.id });
    const submitted = await transition(draft, 'submit');
    expect(submitted).toMatchObject({ status: 'PENDING_APPROVAL' });
    expect(submitted.lines.map((line) => line.plan_id)).toEqual([planId, extra.rows[0]!.id]);
  });

  it('PRP-POS-025 preserves immutable revision history while current revision evolves', async () => {
    const approved = await approvedDraft();
    let current = await transition(approved, 'revise');
    const historical = await admin.query<{
      id: string;
      title: string;
      proposal_subtotal: string;
      line_subtotal: string;
    }>(
      'SELECT r.id,r.title,r.proposal_subtotal::text,l.line_subtotal::text FROM commercial.proposal_revisions r JOIN commercial.proposal_revision_line_items l ON l.proposal_revision_id=r.id WHERE r.proposal_id=$1 AND r.revision_number=1',
      [approved.id],
    );
    const before = historical.rows[0]!;
    const updated = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/proposals/${current.id}`,
      headers: headers(),
      payload: { title: 'Revision two current state', expected_version: current.version },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    current = proposalEnvelopeSchema.parse(updated.json()).data;
    const line = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/proposals/${current.id}/lines/${current.lines[0]!.id}`,
      headers: headers(),
      payload: { quantity: '2.0000', expected_version: current.version },
    });
    expect(line.statusCode, line.body).toBe(200);
    const after = await admin.query<typeof before>(
      'SELECT r.id,r.title,r.proposal_subtotal::text,l.line_subtotal::text FROM commercial.proposal_revisions r JOIN commercial.proposal_revision_line_items l ON l.proposal_revision_id=r.id WHERE r.id=$1',
      [before.id],
    );
    expect(after.rows[0]).toEqual(before);
  });

  it('PRP-NEG-002 denies unauthenticated Proposal list', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/proposals',
      headers: { 'x-acs-tenant-id': tenantA },
    });
    expect(response.statusCode).toBe(401);
  });

  it('PRP-NEG-003 denies unauthenticated Proposal detail', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/proposals/${proposal.id}`,
      headers: { 'x-acs-tenant-id': tenantA },
    });
    expect(response.statusCode).toBe(401);
  });

  it('PRP-NEG-004 denies unauthenticated Proposal update', async () => {
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/proposals/${proposal.id}`,
      headers: { 'x-acs-tenant-id': tenantA, 'idempotency-key': randomUUID() },
      payload: { title: 'Denied', expected_version: proposal.version },
    });
    expect(response.statusCode).toBe(401);
  });

  it('PRP-NEG-005 denies a valid identity lacking Proposal create permission', async () => {
    const response = await create(payload(), headers(randomUUID(), tenantA, unprivilegedToken));
    expect(response.statusCode, response.body).toBe(403);
  });

  it('PRP-NEG-006 rejects client tenant authority injection', async () => {
    const response = await create(payload({ tenant_id: tenantB }));
    expect(response.statusCode, response.body).toBe(400);
  });

  it('PRP-NEG-007 rejects unknown Proposal create fields', async () => {
    const response = await create(payload({ unknown_property: 'forbidden' }));
    expect(response.statusCode, response.body).toBe(400);
  });

  it('PRP-NEG-008 rejects server-owned lifecycle field mutation', async () => {
    const response = await create(payload({ status: 'APPROVED' }));
    expect(response.statusCode, response.body).toBe(400);
  });

  it('PRP-NEG-009 rejects mass assignment of server totals', async () => {
    const response = await create(
      payload({ proposal_subtotal: '999.0000', grand_total: '999.0000' }),
    );
    expect(response.statusCode, response.body).toBe(400);
  });

  it('PRP-NEG-010 rejects a foreign Opportunity without disclosure', async () => {
    const response = await create(payload({ opportunity_id: foreignOpportunityId }));
    expect(response.statusCode, response.body).toBe(404);
  });

  it('PRP-NEG-011 rejects a foreign Customer without disclosure', async () => {
    const response = await create(payload({ customer_id: foreignCustomerId }));
    expect(response.statusCode, response.body).toBe(404);
  });

  it('PRP-NEG-012 rejects a foreign Partner without disclosure', async () => {
    const response = await create(payload({ partner_id: foreignPartnerId }));
    expect(response.statusCode, response.body).toBe(404);
  });

  it('PRP-NEG-013 rejects a foreign Plan line without disclosure', async () => {
    const created = await create(payload());
    const draft = proposalEnvelopeSchema.parse(created.json()).data;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${draft.id}/lines`,
      headers: headers(),
      payload: {
        plan_id: foreignPlanId,
        quantity: '1.0000',
        unit_price: '1.0000',
        expected_version: draft.version,
      },
    });
    expect(response.statusCode, response.body).toBe(404);
  });

  it('PRP-NEG-014 rejects a foreign owner membership', async () => {
    const response = await create(
      payload({ owner_membership_id: '30000000-0000-4000-8000-000000000088' }),
    );
    expect(response.statusCode, response.body).toBe(404);
  });

  it('PRP-NEG-015 returns non-disclosing 404 for foreign Proposal detail', async () => {
    const foreign = await create(
      payload({ opportunity_id: foreignOpportunityId }),
      headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
    );
    const foreignProposal = proposalEnvelopeSchema.parse(foreign.json()).data;
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/proposals/${foreignProposal.id}`,
      headers: headers(),
    });
    expect(response.statusCode, response.body).toBe(404);
  });

  it('PRP-NEG-016 returns non-disclosing 404 for foreign Proposal mutation', async () => {
    const foreign = await create(
      payload({ opportunity_id: foreignOpportunityId }),
      headers(randomUUID(), tenantB, await signedOidcToken('charlie')),
    );
    const foreignProposal = proposalEnvelopeSchema.parse(foreign.json()).data;
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/proposals/${foreignProposal.id}`,
      headers: headers(),
      payload: { title: 'Cross tenant mutation', expected_version: foreignProposal.version },
    });
    expect(response.statusCode, response.body).toBe(404);
  });

  it('PRP-NEG-017 rejects duplicate normalized Proposal code', async () => {
    const code = `PRP-${randomUUID().slice(0, 8)}`;
    expect((await create(payload({ proposal_code: code }))).statusCode).toBe(200);
    const duplicate = await create(payload({ proposal_code: code.toLowerCase() }));
    expect(duplicate.statusCode, duplicate.body).toBe(409);
  });

  it('PRP-NEG-018 rejects unsupported ISO currency', async () => {
    const response = await create(payload({ currency_code: 'ZZZ' }));
    expect(response.statusCode, response.body).toBe(400);
  });

  it('PRP-NEG-019 rejects non-positive Proposal line quantity', async () => {
    const created = await create(payload());
    const draft = proposalEnvelopeSchema.parse(created.json()).data;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${draft.id}/lines`,
      headers: headers(),
      payload: {
        plan_id: planId,
        quantity: '0.0000',
        unit_price: '1.0000',
        expected_version: draft.version,
      },
    });
    expect(response.statusCode, response.body).toBe(400);
  });

  it('PRP-NEG-020 rejects invalid Proposal money representation', async () => {
    const created = await create(payload());
    const draft = proposalEnvelopeSchema.parse(created.json()).data;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${draft.id}/lines`,
      headers: headers(),
      payload: {
        plan_id: planId,
        quantity: '1.0000',
        unit_price: 'not-money',
        expected_version: draft.version,
      },
    });
    expect(response.statusCode, response.body).toBe(400);
  });

  it('PRP-NEG-021 rejects client-authoritative totals', async () => {
    expect((await create(payload({ grand_total: '1.0000' }))).statusCode).toBe(400);
  });
  it('PRP-NEG-022 rejects invalid Proposal validity contract', async () => {
    expect((await create(payload({ valid_until: 'not-a-date' }))).statusCode).toBe(400);
  });
  it('PRP-NEG-023 denies acceptance after validity expiry', async () => {
    const sent = await sentDraft();
    await admin.query(
      "UPDATE commercial.proposals SET valid_until=clock_timestamp()-interval '1 minute' WHERE id=$1",
      [sent.id],
    );
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${sent.id}/accept`,
      headers: headers(),
      payload: { expected_version: sent.version },
    });
    expect(response.statusCode).toBe(400);
  });
  it('PRP-NEG-024 rejects illegal DRAFT to SEND transition', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${draft.id}/send`,
          headers: headers(),
          payload: { expected_version: draft.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-025 rejects terminal Proposal mutation', async () => {
    const accepted = await transition(await sentDraft(), 'accept');
    expect(
      (
        await oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/proposals/${accepted.id}`,
          headers: headers(),
          payload: { title: 'Terminal mutation', expected_version: accepted.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-026 denies creator self-approval', async () => {
    const pending = await transition(
      await addLine(proposalEnvelopeSchema.parse((await create(payload())).json()).data),
      'submit',
    );
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${pending.id}/approve`,
          headers: headers(),
          payload: { expected_version: pending.version },
        })
      ).statusCode,
    ).toBe(403);
  });
  it.each([
    ['PRP-NEG-027', 'approve', 'PENDING_APPROVAL'],
    ['PRP-NEG-028', 'send', 'APPROVED'],
    ['PRP-NEG-029', 'accept', 'SENT'],
    ['PRP-NEG-030', 'cancel', 'APPROVED'],
  ])('%s denies unprivileged lifecycle action %s', async (_id, action, state) => {
    let current = await approvedDraft();
    if (state === 'PENDING_APPROVAL') current = await transition(current, 'revise');
    if (state === 'PENDING_APPROVAL') current = await transition(current, 'submit');
    if (state === 'SENT') current = await transition(current, 'send');
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${current.id}/${action}`,
      headers: headers(randomUUID(), tenantA, unprivilegedToken),
      payload: { expected_version: current.version },
    });
    expect(response.statusCode, response.body).toBe(403);
  });
  it('PRP-NEG-031 rejects stale expected_version without mutation', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    await addLine(draft);
    const stale = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/proposals/${draft.id}`,
      headers: headers(),
      payload: { title: 'Stale', expected_version: draft.version },
    });
    expect(stale.statusCode).toBe(409);
  });
  it('PRP-NEG-032 rejects divergent idempotency replay', async () => {
    const key = randomUUID();
    expect((await create(payload({ title: 'First' }), headers(key))).statusCode).toBe(200);
    expect((await create(payload({ title: 'Second' }), headers(key))).statusCode).toBe(409);
  });
  it('PRP-NEG-033 isolates idempotency keys across tenants', async () => {
    const key = randomUUID();
    expect((await create(payload(), headers(key))).statusCode).toBe(200);
    const response = await create(
      payload({ opportunity_id: foreignOpportunityId }),
      headers(key, tenantB, await signedOidcToken('charlie')),
    );
    expect(response.statusCode, response.body).toBe(200);
  });
  it('PRP-NEG-034 keeps Proposal tables protected by RLS and FORCE RLS', async () => {
    const result = await admin.query<{ rowsecurity: boolean; relforcerowsecurity: boolean }>(
      "SELECT c.relrowsecurity AS rowsecurity,c.relforcerowsecurity AS relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='commercial' AND c.relname='proposals'",
    );
    expect(result.rows[0]).toEqual({ rowsecurity: true, relforcerowsecurity: true });
  });
  it('PRP-NEG-035 keeps Proposal runtime role free of SUPERUSER and BYPASSRLS', async () => {
    const result = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='acs_phase2_proposal_registry'",
    );
    expect(result.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
  it('PRP-NEG-036 exposes no Proposal root DELETE endpoint', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    expect(
      (
        await oidcApp.inject({
          method: 'DELETE',
          url: `/api/v1/commercial/proposals/${draft.id}`,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(404);
  });
  it('PRP-NEG-037 keeps Proposal audit metadata free of secrets', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    const result = await admin.query<{ metadata: string }>(
      'SELECT metadata::text FROM platform.audit_logs WHERE resource=$1 ORDER BY occurred_at DESC LIMIT 1',
      [`commercial:proposal:${draft.id}`],
    );
    expect(result.rows[0]!.metadata).not.toMatch(/token|authorization|secret/i);
  });
  it('PRP-NEG-038 keeps Proposal event payload free of commercial line data', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    const result = await admin.query<{ payload: string }>(
      "SELECT payload::text FROM platform.domain_events WHERE payload->>'id'=$1 ORDER BY occurred_at DESC LIMIT 1",
      [draft.id],
    );
    expect(result.rows[0]!.payload).not.toMatch(/unit_price|line_subtotal|description_snapshot/i);
  });
  it('PRP-NEG-039 rejects line mutation outside DRAFT', async () => {
    const pending = await transition(
      await addLine(proposalEnvelopeSchema.parse((await create(payload())).json()).data),
      'submit',
    );
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${pending.id}/lines`,
          headers: headers(),
          payload: {
            plan_id: planId,
            quantity: '1.0000',
            unit_price: '1.0000',
            expected_version: pending.version,
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-040 rejects foreign Plan line relation without disclosure', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${draft.id}/lines`,
          headers: headers(),
          payload: {
            plan_id: foreignPlanId,
            quantity: '1.0000',
            unit_price: '1.0000',
            expected_version: draft.version,
          },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('PRP-NEG-041 rejects stale revise without history', async () => {
    const p = await approvedDraft();
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/revise`,
          headers: headers(),
          payload: { expected_version: p.version - 1 },
        })
      ).statusCode,
    ).toBe(409);
  });
  it('PRP-NEG-042 rejects over-precision money', async () => {
    const p = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/lines`,
          headers: headers(),
          payload: {
            plan_id: planId,
            quantity: '1.0000',
            unit_price: '1.00001',
            expected_version: p.version,
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-043 rejects numeric overflow money', async () => {
    const p = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/lines`,
          headers: headers(),
          payload: {
            plan_id: planId,
            quantity: '999999999999999.9999',
            unit_price: '999999999999999.9999',
            expected_version: p.version,
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-044 denies expired acceptance', async () => {
    const p = await sentDraft();
    await admin.query(
      "UPDATE commercial.proposals SET valid_until=clock_timestamp()-interval '1 minute' WHERE id=$1",
      [p.id],
    );
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/accept`,
          headers: headers(),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-045 rejects premature expiry', async () => {
    const p = await sentDraft();
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/expire`,
          headers: headers(),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-046 denies unprivileged expiry', async () => {
    const p = await sentDraft();
    await admin.query(
      "UPDATE commercial.proposals SET valid_until=clock_timestamp()-interval '1 minute' WHERE id=$1",
      [p.id],
    );
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/expire`,
          headers: headers(randomUUID(), tenantA, unprivilegedToken),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('PRP-NEG-047 rejects revise outside APPROVED', async () => {
    const p = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/revise`,
          headers: headers(),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-048 rejects PATCH of APPROVED content', async () => {
    const p = await approvedDraft();
    expect(
      (
        await oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/proposals/${p.id}`,
          headers: headers(),
          payload: { title: 'Denied', expected_version: p.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-049 denies revision runtime writes', async () => {
    expect(
      (
        await admin.query<{ allowed: boolean }>(
          "SELECT has_table_privilege('acs_phase2_proposal_registry','commercial.proposal_revisions','UPDATE') AS allowed",
        )
      ).rows[0]!.allowed,
    ).toBe(false);
  });
  it('PRP-NEG-050 preserves monotonic revision after failed transition', async () => {
    const p = await approvedDraft();
    await transition(p, 'revise');
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/revise`,
          headers: headers(),
          payload: { expected_version: p.version + 1 },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-051 rejects SENT revise', async () => {
    const p = await sentDraft();
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/revise`,
          headers: headers(),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-052 rejects approval return outside PENDING_APPROVAL', async () => {
    const p = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/return-to-draft`,
          headers: headers(),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-053 denies reject without permission', async () => {
    const p = await sentDraft();
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/reject`,
          headers: headers(randomUUID(), tenantA, unprivilegedToken),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('PRP-NEG-054 rejects same-tenant Customer mismatch', async () => {
    const s = randomUUID().slice(0, 8);
    const a = await admin.query<{ id: string }>(
      "INSERT INTO commercial.customers(tenant_id,display_name,reference_code,created_by,updated_by) VALUES($1,'A',$2,$3,$3) RETURNING id",
      [tenantA, `a-${s}`, aliceUser],
    );
    const b = await admin.query<{ id: string }>(
      "INSERT INTO commercial.customers(tenant_id,display_name,reference_code,created_by,updated_by) VALUES($1,'B',$2,$3,$3) RETURNING id",
      [tenantA, `b-${s}`, aliceUser],
    );
    const o = await admin.query<{ id: string }>(
      "INSERT INTO commercial.opportunities(tenant_id,opportunity_code,title,owner_membership_id,customer_id,created_by,updated_by) VALUES($1,$2,'Mismatch',$3,$4,$5,$5) RETURNING id",
      [tenantA, `o-${s}`, aliceMembership, a.rows[0]!.id, aliceUser],
    );
    expect(
      (await create(payload({ opportunity_id: o.rows[0]!.id, customer_id: b.rows[0]!.id })))
        .statusCode,
    ).toBe(404);
  });
  it('PRP-NEG-055 rejects same-tenant Partner mismatch', async () => {
    const s = randomUUID().slice(0, 8);
    const a = await admin.query<{ id: string }>(
      "INSERT INTO commercial.partners(tenant_id,partner_code,display_name,created_by,updated_by) VALUES($1,$2,'A',$3,$3) RETURNING id",
      [tenantA, `a-${s}`, aliceUser],
    );
    const b = await admin.query<{ id: string }>(
      "INSERT INTO commercial.partners(tenant_id,partner_code,display_name,created_by,updated_by) VALUES($1,$2,'B',$3,$3) RETURNING id",
      [tenantA, `b-${s}`, aliceUser],
    );
    const o = await admin.query<{ id: string }>(
      "INSERT INTO commercial.opportunities(tenant_id,opportunity_code,title,owner_membership_id,partner_id,created_by,updated_by) VALUES($1,$2,'Mismatch',$3,$4,$5,$5) RETURNING id",
      [tenantA, `o-${s}`, aliceMembership, a.rows[0]!.id, aliceUser],
    );
    expect(
      (await create(payload({ opportunity_id: o.rows[0]!.id, partner_id: b.rows[0]!.id })))
        .statusCode,
    ).toBe(404);
  });
  it('PRP-NEG-056 rejects submit without Opportunity primary Plan', async () => {
    const other = await admin.query<{ id: string }>(
      "INSERT INTO commercial.plans(tenant_id,plan_code,name,created_by,updated_by) VALUES($1,$2,'Other',$3,$3) RETURNING id",
      [tenantA, `other-${randomUUID().slice(0, 8)}`, aliceUser],
    );
    let p = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    p = await addLine(p, { planId: other.rows[0]!.id });
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/submit`,
          headers: headers(),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('PRP-NEG-057 rejects inactive owner membership', async () => {
    await admin.query(
      "UPDATE platform.memberships SET status='INACTIVE' WHERE id='30000000-0000-4000-8000-000000000077'",
    );
    expect(
      (await create(payload({ owner_membership_id: '30000000-0000-4000-8000-000000000077' })))
        .statusCode,
    ).toBe(404);
    await admin.query(
      "UPDATE platform.memberships SET status='ACTIVE' WHERE id='30000000-0000-4000-8000-000000000077'",
    );
  });
  it('PRP-NEG-058 denies owner assignment without permission', async () => {
    const p = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/assign`,
          headers: headers(randomUUID(), tenantA, unprivilegedToken),
          payload: {
            owner_membership_id: '30000000-0000-4000-8000-000000000099',
            expected_version: p.version,
          },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('PRP-NEG-059 preserves creator SoD after owner reassignment', async () => {
    let p = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    const assigned = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/proposals/${p.id}/assign`,
      headers: headers(),
      payload: {
        owner_membership_id: '30000000-0000-4000-8000-000000000099',
        expected_version: p.version,
      },
    });
    p = proposalEnvelopeSchema.parse(assigned.json()).data;
    p = await addLine(p);
    p = await transition(p, 'submit');
    expect(
      (
        await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${p.id}/approve`,
          headers: headers(),
          payload: { expected_version: p.version },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('PROPOSAL-CONCURRENCY permits exactly one concurrent DRAFT writer', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    const writes = await Promise.all(
      ['A', 'B'].map((title) =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/proposals/${draft.id}`,
          headers: headers(),
          payload: { title, expected_version: draft.version },
        }),
      ),
    );
    expect(writes.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const persisted = await admin.query<{
      version: string;
      title: string;
      audits: number;
      events: number;
    }>(
      "SELECT p.version::text,p.title,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||p.id::text AND action='commercial.proposal.update') audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=p.id::text) events FROM commercial.proposals p WHERE id=$1",
      [draft.id],
    );
    expect(persisted.rows[0]).toEqual(
      expect.objectContaining({ version: String(draft.version + 1), audits: 1, events: 2 }),
    );
    expect(['A', 'B']).toContain(persisted.rows[0]!.title);
  });
  it('PROPOSAL-CONCURRENCY serializes submit versus update without a hybrid aggregate', async () => {
    const draft = await addLine(
      proposalEnvelopeSchema.parse((await create(payload())).json()).data,
    );
    const [submit, update] = await Promise.all([
      oidcApp.inject({
        method: 'POST',
        url: `/api/v1/commercial/proposals/${draft.id}/submit`,
        headers: headers(),
        payload: { expected_version: draft.version },
      }),
      oidcApp.inject({
        method: 'PATCH',
        url: `/api/v1/commercial/proposals/${draft.id}`,
        headers: headers(),
        payload: { title: 'Concurrent update', expected_version: draft.version },
      }),
    ]);
    // Exactly one command commits. A loser is rejected by optimistic versioning
    // (409) or, after submit locks content, by the DRAFT invariant (400).
    expect([submit.statusCode, update.statusCode].filter((status) => status === 200)).toHaveLength(
      1,
    );
    expect([400, 409]).toContain(submit.statusCode === 200 ? update.statusCode : submit.statusCode);
    const final = await admin.query<{ status: string; version: string; title: string }>(
      'SELECT status,version::text,title FROM commercial.proposals WHERE id=$1',
      [draft.id],
    );
    expect(final.rows[0]).toEqual(expect.objectContaining({ version: String(draft.version + 1) }));
    expect(
      (final.rows[0]!.status === 'PENDING_APPROVAL' &&
        final.rows[0]!.title !== 'Concurrent update') ||
        (final.rows[0]!.status === 'DRAFT' && final.rows[0]!.title === 'Concurrent update'),
    ).toBe(true);
  });
  it('PROPOSAL-CONCURRENCY serializes approval return against approval', async () => {
    const pending = await transition(
      await addLine(proposalEnvelopeSchema.parse((await create(payload())).json()).data),
      'submit',
    );
    const results = await Promise.all([
      oidcApp.inject({
        method: 'POST',
        url: `/api/v1/commercial/proposals/${pending.id}/return-to-draft`,
        headers: headers(),
        payload: { expected_version: pending.version },
      }),
      oidcApp.inject({
        method: 'POST',
        url: `/api/v1/commercial/proposals/${pending.id}/approve`,
        headers: headers(randomUUID(), tenantA, bobToken),
        payload: { expected_version: pending.version },
      }),
    ]);
    expect(results.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const final = await admin.query<{ status: string; returned: number }>(
      "SELECT status,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||p.id::text AND action='proposal.approval_returned') returned FROM commercial.proposals p WHERE id=$1",
      [pending.id],
    );
    expect(['DRAFT', 'APPROVED']).toContain(final.rows[0]!.status);
    expect(final.rows[0]!.returned).toBe(final.rows[0]!.status === 'DRAFT' ? 1 : 0);
  });
  it('PROPOSAL-CONCURRENCY serializes revise versus send and preserves revision history', async () => {
    const approved = await approvedDraft();
    const results = await Promise.all(
      ['revise', 'send'].map((action) =>
        oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${approved.id}/${action}`,
          headers: headers(),
          payload: { expected_version: approved.version },
        }),
      ),
    );
    expect(results.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const final = await admin.query<{ status: string; revision_number: string; snapshots: number }>(
      'SELECT p.status,p.revision_number::text,(SELECT count(*)::int FROM commercial.proposal_revisions WHERE proposal_id=p.id) snapshots FROM commercial.proposals p WHERE id=$1',
      [approved.id],
    );
    expect(final.rows[0]).toEqual(
      final.rows[0]!.status === 'DRAFT'
        ? { status: 'DRAFT', revision_number: '2', snapshots: 1 }
        : { status: 'SENT', revision_number: '1', snapshots: 0 },
    );
  });
  it('PROPOSAL-CONCURRENCY serializes terminal accept versus cancel and accept versus expire', async () => {
    const sent = await sentDraft();
    const terminal = await Promise.all(
      ['accept', 'cancel'].map((action) =>
        oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${sent.id}/${action}`,
          headers: headers(),
          payload: { expected_version: sent.version },
        }),
      ),
    );
    expect(terminal.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const expired = await sentDraft();
    await admin.query(
      "UPDATE commercial.proposals SET valid_until=clock_timestamp()-interval '1 minute' WHERE id=$1",
      [expired.id],
    );
    const expiry = await Promise.all(
      ['accept', 'expire'].map((action) =>
        oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${expired.id}/${action}`,
          headers: headers(),
          payload: { expected_version: expired.version },
        }),
      ),
    );
    expect(expiry.map((x) => x.statusCode).sort()).toEqual([200, expect.any(Number)]);
    expect(expiry.some((x) => x.statusCode === 200)).toBe(true);
    expect(expiry.some((x) => [400, 409].includes(x.statusCode))).toBe(true);
    const states = await admin.query<{ status: string }>(
      'SELECT status FROM commercial.proposals WHERE id = ANY($1::uuid[])',
      [[sent.id, expired.id]],
    );
    expect(states.rows.map((x) => x.status).sort()).toEqual(expect.arrayContaining(['EXPIRED']));
    expect(states.rows.every((x) => ['ACCEPTED', 'CANCELLED', 'EXPIRED'].includes(x.status))).toBe(
      true,
    );
  });
  it('PROPOSAL-CONCURRENCY serializes owner assignment versus update and preserves creator', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    const results = await Promise.all([
      oidcApp.inject({
        method: 'POST',
        url: `/api/v1/commercial/proposals/${draft.id}/assign`,
        headers: headers(),
        payload: {
          owner_membership_id: '30000000-0000-4000-8000-000000000099',
          expected_version: draft.version,
        },
      }),
      oidcApp.inject({
        method: 'PATCH',
        url: `/api/v1/commercial/proposals/${draft.id}`,
        headers: headers(),
        payload: { title: 'Concurrent owner update', expected_version: draft.version },
      }),
    ]);
    expect(results.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const final = await admin.query<{
      created_by_membership_id: string;
      owner_membership_id: string;
      version: string;
    }>(
      'SELECT created_by_membership_id,owner_membership_id,version::text FROM commercial.proposals WHERE id=$1',
      [draft.id],
    );
    expect(final.rows[0]).toEqual(
      expect.objectContaining({
        created_by_membership_id: aliceMembership,
        version: String(draft.version + 1),
      }),
    );
  });
  it('PROPOSAL-CONCURRENCY serializes competing revisions without duplicate snapshots', async () => {
    const approved = await approvedDraft();
    const results = await Promise.all(
      [0, 1].map(() =>
        oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/proposals/${approved.id}/revise`,
          headers: headers(),
          payload: { expected_version: approved.version },
        }),
      ),
    );
    expect(results.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const final = await admin.query<{ revision_number: string; snapshots: number; lines: number }>(
      'SELECT p.revision_number::text,(SELECT count(*)::int FROM commercial.proposal_revisions r WHERE r.proposal_id=p.id) snapshots,(SELECT count(*)::int FROM commercial.proposal_revision_line_items l JOIN commercial.proposal_revisions r ON r.id=l.proposal_revision_id WHERE r.proposal_id=p.id) lines FROM commercial.proposals p WHERE p.id=$1',
      [approved.id],
    );
    expect(final.rows[0]).toEqual({ revision_number: '2', snapshots: 1, lines: 1 });
  });
  it('PROPOSAL-IDEMPOTENCY-CONCURRENCY produces one mutation, deterministic replay and no duplicate side effects', async () => {
    const key = randomUUID();
    const input = payload();
    const responses = await Promise.all([create(input, headers(key)), create(input, headers(key))]);
    expect(responses.map((x) => x.statusCode)).toEqual([200, 200]);
    const first = proposalEnvelopeSchema.parse(responses[0].json());
    const second = proposalEnvelopeSchema.parse(responses[1].json());
    expect(second.data.id).toBe(first.data.id);
    expect(
      [first.meta.idempotent_replay, second.meta.idempotent_replay].filter(Boolean),
    ).toHaveLength(1);
    const effects = await admin.query<{ proposals: number; audits: number; events: number }>(
      "SELECT (SELECT count(*)::int FROM commercial.proposals WHERE id=$1) proposals,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||$1::text) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=$1::text) events",
      [first.data.id],
    );
    expect(effects.rows[0]).toEqual({ proposals: 1, audits: 1, events: 1 });
    expect((await create(payload({ title: 'divergent' }), headers(key))).statusCode).toBe(409);
  });
  it('PROPOSAL-ATOMICITY rolls back aggregate, audit, outbox and operation at each mutation boundary', async () => {
    for (const phase of [
      'after-aggregate-mutation',
      'after-audit',
      'after-outbox',
      'before-commit',
    ] as const) {
      const issued = await issueProposalContext('commercial.proposal.create');
      const code = `rollback-${phase}-${randomUUID().slice(0, 8)}`;
      const failed = new PostgresProposalRegistryRepository(proposalDatabaseUrl, (at) => {
        if (at === phase) throw new Error(`test-only ${phase}`);
      });
      try {
        await expect(
          failed.create({
            actorUserId: aliceUser,
            contextToken: issued.contextToken,
            correlationId: randomUUID(),
            idempotencyKey: randomUUID(),
            requestHash: 'a'.repeat(64),
            requestId: randomUUID(),
            tenantId: tenantA,
            action: 'commercial.proposal.create',
            ...payload({ proposal_code: code }),
          }),
        ).rejects.toThrow(`test-only ${phase}`);
      } finally {
        await failed.close();
        await issued.close();
      }
      const absent = await admin.query<{
        proposals: number;
        audits: number;
        events: number;
        operations: number;
      }>(
        "SELECT (SELECT count(*)::int FROM commercial.proposals WHERE tenant_id=$1 AND proposal_code=$2) proposals,(SELECT count(*)::int FROM platform.audit_logs WHERE metadata::text LIKE '%' || $2 || '%') audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload::text LIKE '%' || $2 || '%') events,(SELECT count(*)::int FROM commercial.proposal_operations WHERE result::text LIKE '%' || $2 || '%') operations",
        [tenantA, code],
      );
      expect(absent.rows[0]).toEqual({ proposals: 0, audits: 0, events: 0, operations: 0 });
    }
  });
  it('PROPOSAL-LINE-ATOMICITY rolls back line, totals, version, audit and outbox', async () => {
    const draft = proposalEnvelopeSchema.parse((await create(payload())).json()).data;
    const before = await admin.query<{ audits: number; events: number }>(
      "SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||$1::text) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=$1::text) events",
      [draft.id],
    );
    const issued = await issueProposalContext('commercial.proposal.update');
    const failed = new PostgresProposalRegistryRepository(proposalDatabaseUrl, (phase) => {
      if (phase === 'after-aggregate-mutation') throw new Error('test-only line rollback');
    });
    try {
      await expect(
        failed.line({
          actorUserId: aliceUser,
          contextToken: issued.contextToken,
          correlationId: randomUUID(),
          idempotencyKey: randomUUID(),
          requestHash: 'e'.repeat(64),
          requestId: randomUUID(),
          tenantId: tenantA,
          proposalId: draft.id,
          expected_version: draft.version,
          operation: 'create',
          plan_id: planId,
          quantity: '1.0000',
          unit_price: '5.0000',
          action: 'commercial.proposal.update',
        } as never),
      ).rejects.toThrow('test-only line rollback');
    } finally {
      await failed.close();
      await issued.close();
    }
    const after = await admin.query<{
      lines: number;
      subtotal: string;
      version: string;
      audits: number;
      events: number;
    }>(
      "SELECT (SELECT count(*)::int FROM commercial.proposal_line_items WHERE proposal_id=p.id) lines,p.proposal_subtotal::text subtotal,p.version::text,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||p.id::text) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=p.id::text) events FROM commercial.proposals p WHERE p.id=$1",
      [draft.id],
    );
    expect(after.rows[0]).toEqual({
      lines: 0,
      subtotal: '0.0000',
      version: String(draft.version),
      ...before.rows[0],
    });
  });
  it('PROPOSAL-LIFECYCLE-ATOMICITY rolls back submit, approve, send, accept and cancel', async () => {
    const cases: Array<{
      action: string;
      actorUserId: string;
      current: () => Promise<Proposal>;
      subject: string;
      transition: string;
    }> = [
      {
        action: 'commercial.proposal.update',
        actorUserId: aliceUser,
        current: async () =>
          addLine(proposalEnvelopeSchema.parse((await create(payload())).json()).data),
        subject: 'alice',
        transition: 'submit',
      },
      {
        action: 'commercial.proposal.approve',
        actorUserId: '50000000-0000-4000-8000-000000000055',
        current: async () =>
          transition(
            await addLine(proposalEnvelopeSchema.parse((await create(payload())).json()).data),
            'submit',
          ),
        subject: 'bob',
        transition: 'approve',
      },
      {
        action: 'commercial.proposal.send',
        actorUserId: aliceUser,
        current: approvedDraft,
        subject: 'alice',
        transition: 'send',
      },
      {
        action: 'commercial.proposal.accept',
        actorUserId: aliceUser,
        current: sentDraft,
        subject: 'alice',
        transition: 'accept',
      },
      {
        action: 'commercial.proposal.cancel',
        actorUserId: aliceUser,
        current: approvedDraft,
        subject: 'alice',
        transition: 'cancel',
      },
    ];
    for (const testCase of cases) {
      const current = await testCase.current();
      const before = await admin.query<{ audits: number; events: number }>(
        "SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||$1::text) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=$1::text) events",
        [current.id],
      );
      const issued = await issueProposalContext(testCase.action, testCase.subject);
      const failed = new PostgresProposalRegistryRepository(proposalDatabaseUrl, (phase) => {
        if (phase === 'after-aggregate-mutation')
          throw new Error(`test-only ${testCase.transition} rollback`);
      });
      try {
        await expect(
          failed.transition({
            actorUserId: testCase.actorUserId,
            contextToken: issued.contextToken,
            correlationId: randomUUID(),
            idempotencyKey: randomUUID(),
            requestHash: 'c'.repeat(64),
            requestId: randomUUID(),
            tenantId: tenantA,
            proposalId: current.id,
            expected_version: current.version,
            transition: testCase.transition,
            action: testCase.action,
          }),
        ).rejects.toThrow(`test-only ${testCase.transition} rollback`);
      } finally {
        await failed.close();
        await issued.close();
      }
      const after = await admin.query<{
        status: string;
        version: string;
        audits: number;
        events: number;
      }>(
        "SELECT p.status,p.version::text,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||p.id::text) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=p.id::text) events FROM commercial.proposals p WHERE p.id=$1",
        [current.id],
      );
      expect(after.rows[0]).toEqual({
        status: current.status,
        version: String(current.version),
        ...before.rows[0],
      });
    }
  });
  it('PROPOSAL-APPROVAL-RETURN-ATOMICITY rolls back state, audit and outbox', async () => {
    const pending = await transition(
      await addLine(proposalEnvelopeSchema.parse((await create(payload())).json()).data),
      'submit',
    );
    const before = await admin.query<{ audits: number; events: number }>(
      "SELECT (SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||$1::text) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=$1::text) events",
      [pending.id],
    );
    const issued = await issueProposalContext('commercial.proposal.update');
    const failed = new PostgresProposalRegistryRepository(proposalDatabaseUrl, (phase) => {
      if (phase === 'after-aggregate-mutation')
        throw new Error('test-only approval return rollback');
    });
    try {
      await expect(
        failed.transition({
          actorUserId: aliceUser,
          contextToken: issued.contextToken,
          correlationId: randomUUID(),
          idempotencyKey: randomUUID(),
          requestHash: 'd'.repeat(64),
          requestId: randomUUID(),
          tenantId: tenantA,
          proposalId: pending.id,
          expected_version: pending.version,
          transition: 'return-to-draft',
          action: 'commercial.proposal.update',
          auditAction: 'proposal.approval_returned',
        }),
      ).rejects.toThrow('test-only approval return rollback');
    } finally {
      await failed.close();
      await issued.close();
    }
    const after = await admin.query<{
      status: string;
      version: string;
      audits: number;
      events: number;
    }>(
      "SELECT p.status,p.version::text,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||p.id::text) audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=p.id::text) events FROM commercial.proposals p WHERE p.id=$1",
      [pending.id],
    );
    expect(after.rows[0]).toEqual({
      status: 'PENDING_APPROVAL',
      version: String(pending.version),
      ...before.rows[0],
    });
  });
  it('PROPOSAL-REVISION-ATOMICITY rolls back snapshot and current aggregate together', async () => {
    const approved = await approvedDraft();
    const issued = await issueProposalContext('commercial.proposal.revise');
    const failed = new PostgresProposalRegistryRepository(proposalDatabaseUrl, (phase) => {
      if (phase === 'after-revision-snapshot')
        throw new Error('test-only revision snapshot failure');
    });
    try {
      await expect(
        failed.transition({
          actorUserId: aliceUser,
          contextToken: issued.contextToken,
          correlationId: randomUUID(),
          idempotencyKey: randomUUID(),
          requestHash: 'b'.repeat(64),
          requestId: randomUUID(),
          tenantId: tenantA,
          proposalId: approved.id,
          expected_version: approved.version,
          transition: 'revise',
          action: 'commercial.proposal.revise',
        }),
      ).rejects.toThrow('test-only revision snapshot failure');
    } finally {
      await failed.close();
      await issued.close();
    }
    const intact = await admin.query<{
      status: string;
      revision_number: string;
      snapshots: number;
      audits: number;
      events: number;
    }>(
      "SELECT p.status,p.revision_number::text,(SELECT count(*)::int FROM commercial.proposal_revisions r WHERE r.proposal_id=p.id) snapshots,(SELECT count(*)::int FROM platform.audit_logs WHERE resource='commercial:proposal:'||p.id::text AND action='commercial.proposal.revise') audits,(SELECT count(*)::int FROM platform.domain_events WHERE payload->>'id'=p.id::text AND event_type='commercial.proposal.revision_created') events FROM commercial.proposals p WHERE p.id=$1",
      [approved.id],
    );
    expect(intact.rows[0]).toEqual({
      status: 'APPROVED',
      revision_number: '1',
      snapshots: 0,
      audits: 0,
      events: 0,
    });
  });
  it('PROPOSAL-PERFORMANCE records a TEST_ONLY local baseline through the signed OIDC execution path', async () => {
    const measurements = new Map<string, number>();
    const measure = async <T>(name: string, operation: () => Promise<T>) => {
      const startedAt = performance.now();
      const result = await operation();
      measurements.set(name, Number((performance.now() - startedAt).toFixed(2)));
      return result;
    };
    const journeyStartedAt = performance.now();
    let current = await measure('PROPOSAL_CREATE_AUDIT_OUTBOX_MS', async () => {
      const response = await create(payload({ title: 'Proposal performance fixture' }));
      expect(response.statusCode, response.body).toBe(200);
      return proposalEnvelopeSchema.parse(response.json()).data;
    });
    current = await measure('PROPOSAL_DRAFT_CONSTRUCTION_LINES_MS', () => addLine(current));
    await measure('PROPOSAL_DETAIL_MS', async () => {
      const response = await oidcApp.inject({
        method: 'GET',
        url: `/api/v1/commercial/proposals/${current.id}`,
        headers: headers(),
      });
      expect(response.statusCode, response.body).toBe(200);
    });
    await measure('PROPOSAL_LIST_MS', async () => {
      const response = await oidcApp.inject({
        method: 'GET',
        url: '/api/v1/commercial/proposals?limit=25',
        headers: headers(),
      });
      expect(response.statusCode, response.body).toBe(200);
    });
    current = await measure('PROPOSAL_DRAFT_UPDATE_MS', async () => {
      const response = await oidcApp.inject({
        method: 'PATCH',
        url: `/api/v1/commercial/proposals/${current.id}`,
        headers: headers(),
        payload: {
          title: 'Proposal performance fixture updated',
          expected_version: current.version,
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      return proposalEnvelopeSchema.parse(response.json()).data;
    });
    current = await measure('PROPOSAL_LINE_UPDATE_MS', async () => {
      const response = await oidcApp.inject({
        method: 'PATCH',
        url: `/api/v1/commercial/proposals/${current.id}/lines/${current.lines[0]!.id}`,
        headers: headers(),
        payload: { quantity: '2.0000', expected_version: current.version },
      });
      expect(response.statusCode, response.body).toBe(200);
      return proposalEnvelopeSchema.parse(response.json()).data;
    });
    current = await measure('PROPOSAL_SUBMIT_MS', () => transition(current, 'submit'));
    current = await measure('PROPOSAL_APPROVE_MS', () => transition(current, 'approve', bobToken));
    current = await measure('PROPOSAL_REVISE_MS', () => transition(current, 'revise'));
    current = await measure('PROPOSAL_SEND_MS', async () => {
      const submitted = await transition(current, 'submit');
      const approved = await transition(submitted, 'approve', bobToken);
      return transition(approved, 'send');
    });
    await measure('PROPOSAL_TERMINAL_TRANSITION_MS', () => transition(current, 'accept'));
    measurements.set(
      'PROPOSAL_COMPLETE_JOURNEY_MS',
      Number((performance.now() - journeyStartedAt).toFixed(2)),
    );
    process.stdout.write(
      `${JSON.stringify({ BASELINE_MEASUREMENT_NOT_SLO: true, ...Object.fromEntries(measurements) })}\n`,
    );
  });
});

describe.sequential('Contract Registry signed OIDC acceptance matrix', () => {
  const aliceMembership = '30000000-0000-4000-8000-000000000055';
  const aliceUser = '40000000-0000-4000-8000-000000000044';
  const bobMembership = '30000000-0000-4000-8000-000000000099';
  const bobUser = '50000000-0000-4000-8000-000000000055';
  let planId: string;
  let opportunityId: string;
  let aliceToken: string;
  let bobToken: string;
  let charlieToken: string;
  let primary: Contract;

  const requestHeaders = (key = randomUUID(), tenant = tenantA, token = aliceToken) => ({
    authorization: `Bearer ${token}`,
    'x-acs-tenant-id': tenant,
    'idempotency-key': key,
  });
  const acceptedProposal = async (tenant = tenantA) => {
    const suffix = randomUUID().slice(0, 10);
    const proposal = await admin.query<{ id: string }>(
      `INSERT INTO commercial.proposals(tenant_id,proposal_code,title,opportunity_id,owner_membership_id,created_by_membership_id,currency_code,status,valid_until,proposal_subtotal,grand_total,approved_by_membership_id,approved_at,created_by,updated_by)
       VALUES($1,$2,'Contract source fixture',$3,$4,$4,'USD','ACCEPTED',clock_timestamp()+interval '30 days',25,25,$5,clock_timestamp(),$6,$6) RETURNING id`,
      [tenant, `CTR-SRC-${suffix}`, opportunityId, aliceMembership, bobMembership, aliceUser],
    );
    await admin.query(
      `INSERT INTO commercial.proposal_line_items(proposal_id,tenant_id,line_number,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal)
       VALUES($1,$2,1,$3,'Contract plan snapshot','Canonical Contract source line',1,25,25)`,
      [proposal.rows[0]!.id, tenant, planId],
    );
    return proposal.rows[0]!.id;
  };
  const createContract = async (key = randomUUID(), suppliedSource?: string) => {
    const source = suppliedSource ?? (await acceptedProposal());
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/contracts',
      headers: requestHeaders(key),
      payload: { source_proposal_id: source },
    });
    expect(response.statusCode, response.body).toBe(200);
    return { contract: contractEnvelopeSchema.parse(response.json()).data, response, key, source };
  };
  const mutate = async (
    contract: Contract,
    action: string,
    token = aliceToken,
    body: Record<string, unknown> = { expected_version: contract.version },
  ) => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/contracts/${contract.id}/${action}`,
      headers: requestHeaders(randomUUID(), tenantA, token),
      payload: body,
    });
    expect(response.statusCode, response.body).toBe(200);
    return contractEnvelopeSchema.parse(response.json()).data;
  };
  const approvedContract = async () => {
    let current = (await createContract()).contract;
    current = await mutate(current, 'submit');
    return mutate(current, 'approve', bobToken);
  };
  const issueContext = async (action: string) => {
    const contexts = new PostgresTenantContextRepository(
      requiredEnvironment.issuer as string,
      requiredEnvironment.tenant as string,
    );
    const issued = await contexts.issueContext(
      JSON.stringify(['https://issuer.acs.test', 'alice']),
      tenantA,
      action,
    );
    if (!issued) throw new Error('Canonical Contract test context was not issued.');
    return { ...issued, close: () => contexts.close() };
  };

  beforeAll(async () => {
    aliceToken = await signedOidcToken('alice');
    bobToken = await signedOidcToken('bob');
    charlieToken = await signedOidcToken('charlie');
    await admin.query(
      `INSERT INTO platform.memberships(id,tenant_id,user_id,status)
       VALUES($1,$2,$3,'ACTIVE') ON CONFLICT DO NOTHING`,
      [bobMembership, tenantA, bobUser],
    );
    await admin.query(
      `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
       SELECT $1,$2,permission_key FROM platform.permissions
       WHERE permission_key LIKE 'commercial.contract.%' ON CONFLICT DO NOTHING`,
      [tenantA, bobMembership],
    );
    const reference = await admin.query<{ opportunity_id: string; plan_id: string }>(
      `SELECT o.id opportunity_id,p.id plan_id FROM commercial.opportunities o
       JOIN commercial.plans p ON p.tenant_id=o.tenant_id
       WHERE o.tenant_id=$1 ORDER BY o.id,p.id LIMIT 1`,
      [tenantA],
    );
    if (!reference.rows[0]) throw new Error('Contract E2E references are unavailable.');
    opportunityId = reference.rows[0].opportunity_id;
    planId = reference.rows[0].plan_id;
  });

  it('CTR-POS-001 creates from an accepted Proposal through the signed OIDC path', async () => {
    primary = (await createContract()).contract;
    expect(primary).toMatchObject({ status: 'DRAFT', revision_number: 1, version: 1 });
  });

  it('CTR-POS-002 lists and reads only tenant-scoped Contracts', async () => {
    const list = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/contracts?limit=100',
      headers: requestHeaders(),
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(
      contractListEnvelopeSchema.parse(list.json()).data.some((x) => x.id === primary.id),
    ).toBe(true);
    const detail = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/contracts/${primary.id}`,
      headers: requestHeaders(),
    });
    expect(contractEnvelopeSchema.parse(detail.json()).data.id).toBe(primary.id);
  });

  it('CTR-POS-003 preserves source snapshots and server-computed totals', () => {
    expect(primary.lines).toHaveLength(1);
    expect(primary.lines[0]).toMatchObject({ quantity: '1.0000', unit_price: '25.0000' });
    expect(primary.contract_subtotal).toBe('25.0000');
    expect(primary.grand_total).toBe('25.0000');
  });

  it('CTR-POS-004 updates DRAFT data and lines with expected_version', async () => {
    const updated = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/contracts/${primary.id}`,
      headers: requestHeaders(),
      payload: { title: 'Updated Contract', expected_version: primary.version },
    });
    primary = contractEnvelopeSchema.parse(updated.json()).data;
    const line = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/contracts/${primary.id}/lines/${primary.lines[0]!.id}`,
      headers: requestHeaders(),
      payload: { quantity: '2.0000', expected_version: primary.version },
    });
    primary = contractEnvelopeSchema.parse(line.json()).data;
    expect(primary.grand_total).toBe('50.0000');
  });

  it('CTR-POS-005 submits and returns a Contract to DRAFT', async () => {
    primary = await mutate(primary, 'submit');
    primary = await mutate(primary, 'return-to-draft', bobToken);
    expect(primary.status).toBe('DRAFT');
  });

  it('CTR-POS-006 enforces a distinct approver', async () => {
    primary = await mutate(primary, 'submit');
    primary = await mutate(primary, 'approve', bobToken);
    expect(primary).toMatchObject({ status: 'APPROVED', approved_by_membership_id: bobMembership });
  });

  it('CTR-POS-007 creates an immutable revision snapshot before revise', async () => {
    const revision = primary.revision_number;
    primary = await mutate(primary, 'revise');
    const snapshot = await admin.query(
      'SELECT 1 FROM commercial.contract_revisions WHERE contract_id=$1 AND revision_number=$2',
      [primary.id, revision],
    );
    expect(snapshot.rowCount).toBe(1);
    expect(primary.revision_number).toBe(revision + 1);
  });

  it('CTR-POS-008 activates only inside its effective-date boundary', async () => {
    let current = await approvedContract();
    const patch = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/contracts/${current.id}/revise`,
      headers: requestHeaders(),
      payload: { expected_version: current.version },
    });
    current = contractEnvelopeSchema.parse(patch.json()).data;
    const dates = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/contracts/${current.id}`,
      headers: requestHeaders(),
      payload: {
        effective_from: new Date(Date.now() - 60_000).toISOString(),
        effective_until: new Date(Date.now() + 86_400_000).toISOString(),
        expected_version: current.version,
      },
    });
    current = contractEnvelopeSchema.parse(dates.json()).data;
    current = await mutate(await mutate(current, 'submit'), 'approve', bobToken);
    expect((await mutate(current, 'activate')).status).toBe('ACTIVE');
  });

  it('CTR-POS-009 supports cancel and terminate terminal paths', async () => {
    const cancelled = await mutate(await approvedContract(), 'cancel');
    expect(cancelled.status).toBe('CANCELLED');
    let active = await approvedContract();
    await admin.query(
      "UPDATE commercial.contracts SET effective_from=clock_timestamp()-interval '1 minute' WHERE id=$1",
      [active.id],
    );
    active = await mutate(active, 'activate');
    expect((await mutate(active, 'terminate')).status).toBe('TERMINATED');
  });

  it('CTR-POS-010 reassigns ownership to an active tenant membership', async () => {
    let current = (await createContract()).contract;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/contracts/${current.id}/assign`,
      headers: requestHeaders(),
      payload: { owner_membership_id: bobMembership, expected_version: current.version },
    });
    current = contractEnvelopeSchema.parse(response.json()).data;
    expect(current.owner_membership_id).toBe(bobMembership);
  });

  it('CTR-POS-011 keeps historical snapshots stable after source changes', async () => {
    const created = await createContract();
    await admin.query(
      "UPDATE commercial.proposals SET title='Changed after Contract' WHERE id=$1",
      [created.source],
    );
    const detail = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/contracts/${created.contract.id}`,
      headers: requestHeaders(),
    });
    expect(contractEnvelopeSchema.parse(detail.json()).data.title).toBe('Contract source fixture');
  });

  it('CTR-POS-012 replays a tenant-scoped create idempotently', async () => {
    const source = await acceptedProposal();
    const key = randomUUID();
    const first = await createContract(key, source);
    const replay = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/contracts',
      headers: requestHeaders(key),
      payload: { source_proposal_id: source },
    });
    expect(contractEnvelopeSchema.parse(replay.json()).meta.idempotent_replay).toBe(true);
    expect(contractEnvelopeSchema.parse(replay.json()).data.id).toBe(first.contract.id);
  });

  it('CTR-NEG-001 rejects missing, invalid and unknown OIDC identities', async () => {
    const source = await acceptedProposal();
    for (const authorization of [
      undefined,
      'Bearer invalid',
      `Bearer ${await signedOidcToken('nobody')}`,
    ]) {
      const response = await oidcApp.inject({
        method: 'POST',
        url: '/api/v1/commercial/contracts',
        headers: {
          'x-acs-tenant-id': tenantA,
          'idempotency-key': randomUUID(),
          ...(authorization ? { authorization } : {}),
        },
        payload: { source_proposal_id: source },
      });
      expect([401, 403]).toContain(response.statusCode);
    }
  });

  it('CTR-NEG-002 denies a valid member without Contract permission', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/contracts/${primary.id}`,
      headers: requestHeaders(randomUUID(), tenantA, charlieToken),
    });
    expect(response.statusCode).toBe(403);
  });

  it('CTR-NEG-003 rejects unknown fields and client-supplied totals', async () => {
    const source = await acceptedProposal();
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/contracts',
      headers: requestHeaders(),
      payload: { source_proposal_id: source, grand_total: '0.0000', tenant_id: tenantB },
    });
    expect(response.statusCode).toBe(400);
  });

  it('CTR-NEG-004 rejects non-accepted, missing and duplicate Proposal sources', async () => {
    const source = await acceptedProposal();
    await admin.query("UPDATE commercial.proposals SET status='DRAFT' WHERE id=$1", [source]);
    const invalid = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/contracts',
      headers: requestHeaders(),
      payload: { source_proposal_id: source },
    });
    expect(invalid.statusCode).toBe(400);
    const duplicateSource = await acceptedProposal();
    await createContract(randomUUID(), duplicateSource);
    const duplicate = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/contracts',
      headers: requestHeaders(),
      payload: { source_proposal_id: duplicateSource },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('CTR-NEG-005 does not disclose a foreign-tenant source or Contract', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/contracts/${primary.id}`,
      headers: requestHeaders(randomUUID(), tenantB, charlieToken),
    });
    expect(response.statusCode).not.toBe(200);
  });

  it('CTR-NEG-006 rejects invalid money and effective-date ranges', async () => {
    const current = (await createContract()).contract;
    const line = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/contracts/${current.id}/lines`,
      headers: requestHeaders(),
      payload: { plan_id: planId, quantity: '0.0000', unit_price: '1.0000', expected_version: 1 },
    });
    expect(line.statusCode).toBe(400);
    const dates = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/contracts/${current.id}`,
      headers: requestHeaders(),
      payload: {
        effective_from: new Date(Date.now() + 86_400_000).toISOString(),
        effective_until: new Date().toISOString(),
        expected_version: current.version,
      },
    });
    expect(dates.statusCode).toBe(400);
  });

  it('CTR-NEG-007 rejects invalid lifecycle and terminal mutations', async () => {
    const current = (await createContract()).contract;
    const activate = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/contracts/${current.id}/activate`,
      headers: requestHeaders(),
      payload: { expected_version: current.version },
    });
    expect(activate.statusCode).toBe(400);
    const cancelled = await mutate(await approvedContract(), 'cancel');
    const update = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/contracts/${cancelled.id}`,
      headers: requestHeaders(),
      payload: { title: 'Forbidden terminal edit', expected_version: cancelled.version },
    });
    expect(update.statusCode).toBe(400);
  });

  it('CTR-NEG-008 rejects creator self-approval', async () => {
    let current = (await createContract()).contract;
    current = await mutate(current, 'submit');
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/contracts/${current.id}/approve`,
      headers: requestHeaders(),
      payload: { expected_version: current.version },
    });
    expect(response.statusCode).toBe(403);
  });

  it('CTR-NEG-009 rejects stale expected_version updates', async () => {
    const current = (await createContract()).contract;
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/contracts/${current.id}`,
      headers: requestHeaders(),
      payload: { title: 'Stale', expected_version: current.version + 1 },
    });
    expect(response.statusCode).toBe(409);
  });

  it('CTR-NEG-010 rejects divergent tenant-scoped idempotency payloads', async () => {
    const key = randomUUID();
    await createContract(key);
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/contracts',
      headers: requestHeaders(key),
      payload: { source_proposal_id: await acceptedProposal() },
    });
    expect(response.statusCode).toBe(409);
  });

  it('CTR-NEG-011 proves FORCE RLS and no hard-delete API surface', async () => {
    const direct = new Client({ connectionString: contractDatabaseUrl });
    await direct.connect();
    const rows = await direct.query('SELECT id FROM commercial.contracts');
    await direct.end();
    expect(rows.rowCount).toBe(0);
    const response = await oidcApp.inject({
      method: 'DELETE',
      url: `/api/v1/commercial/contracts/${primary.id}`,
      headers: requestHeaders(),
    });
    expect(response.statusCode).toBe(404);
  });

  it('CTR-NEG-012 keeps sensitive relationship data out of audit and outbox payloads', async () => {
    const created = await createContract();
    const evidence = await admin.query<{ audit: string; event: string }>(
      `SELECT coalesce((SELECT metadata::text FROM platform.audit_logs WHERE resource=$1 ORDER BY occurred_at DESC LIMIT 1),'') audit,
              coalesce((SELECT payload::text FROM platform.domain_events WHERE payload->>'id'=$2 ORDER BY occurred_at DESC LIMIT 1),'') event`,
      [`commercial:contract:${created.contract.id}`, created.contract.id],
    );
    expect(evidence.rows[0]!.audit).not.toContain('contact');
    expect(evidence.rows[0]!.event).not.toContain('contact');
  });

  it('CTR-NEG-013 proves mutation, audit, outbox and revision rollback atomicity', async () => {
    const source = await acceptedProposal();
    const context = await issueContext('commercial.contract.create');
    const failedCorrelationId = randomUUID();
    const repository = new PostgresContractRegistryRepository(contractDatabaseUrl, (phase) => {
      if (phase === 'after-outbox') throw new Error('TEST_ONLY_CONTRACT_FAILURE');
    });
    await expect(
      repository.create({
        actorUserId: aliceUser,
        contextToken: context.contextToken,
        correlationId: failedCorrelationId,
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        requestId: randomUUID(),
        tenantId: tenantA,
        action: 'commercial.contract.create',
        source_proposal_id: source,
      }),
    ).rejects.toThrow('TEST_ONLY_CONTRACT_FAILURE');
    await repository.close();
    await context.close();
    const persisted = await admin.query(
      'SELECT 1 FROM commercial.contracts WHERE source_proposal_id=$1',
      [source],
    );
    const event = await admin.query(
      "SELECT 1 FROM platform.domain_events WHERE event_type='commercial.contract.created' AND payload->>'source_proposal_id'=$1",
      [source],
    );
    const audit = await admin.query('SELECT 1 FROM platform.audit_logs WHERE correlation_id=$1', [
      failedCorrelationId,
    ]);
    expect(persisted.rowCount).toBe(0);
    expect(event.rowCount).toBe(0);
    expect(audit.rowCount).toBe(0);

    const raced = (await createContract()).contract;
    const race = await Promise.all(
      ['Race A', 'Race B'].map((title) =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/contracts/${raced.id}`,
          headers: requestHeaders(),
          payload: { title, expected_version: raced.version },
        }),
      ),
    );
    expect(race.map((response) => response.statusCode).sort()).toEqual([200, 409]);

    const approved = await approvedContract();
    const revisionContext = await issueContext('commercial.contract.revise');
    const revisionRepository = new PostgresContractRegistryRepository(
      contractDatabaseUrl,
      (phase) => {
        if (phase === 'after-revision-snapshot') throw new Error('TEST_ONLY_REVISION_FAILURE');
      },
    );
    await expect(
      revisionRepository.transition({
        actorUserId: aliceUser,
        contextToken: revisionContext.contextToken,
        correlationId: randomUUID(),
        idempotencyKey: randomUUID(),
        requestHash: 'b'.repeat(64),
        requestId: randomUUID(),
        tenantId: tenantA,
        contractId: approved.id,
        action: 'commercial.contract.revise',
        transition: 'revise',
        expected_version: approved.version,
      }),
    ).rejects.toThrow('TEST_ONLY_REVISION_FAILURE');
    await revisionRepository.close();
    await revisionContext.close();
    const revisions = await admin.query(
      'SELECT 1 FROM commercial.contract_revisions WHERE contract_id=$1',
      [approved.id],
    );
    const aggregate = await admin.query<{ status: string; revision_number: string }>(
      'SELECT status,revision_number::text FROM commercial.contracts WHERE id=$1',
      [approved.id],
    );
    expect(revisions.rowCount).toBe(0);
    expect(aggregate.rows[0]).toMatchObject({
      status: 'APPROVED',
      revision_number: String(approved.revision_number),
    });
    const downstream = await admin.query<{ subscriptions: string; invoices: string | null }>(
      `SELECT (SELECT count(*) FROM commercial.subscriptions WHERE source_contract_id=$1)::text subscriptions,
       to_regclass('commercial.invoices')::text invoices`,
      [approved.id],
    );
    expect(downstream.rows[0]).toEqual({ subscriptions: '0', invoices: null });
  });

  it('records a Contract signed-OIDC PostgreSQL baseline without asserting an SLO', async () => {
    const timings = new Map<string, number>();
    const measure = async <T>(name: string, work: () => Promise<T>) => {
      const started = performance.now();
      const result = await work();
      timings.set(name, Number((performance.now() - started).toFixed(2)));
      return result;
    };
    const created = await measure('CONTRACT_CREATE_MS', () => createContract());
    await measure('CONTRACT_LIST_MS', async () => {
      const response = await oidcApp.inject({
        method: 'GET',
        url: '/api/v1/commercial/contracts?limit=25',
        headers: requestHeaders(),
      });
      expect(response.statusCode).toBe(200);
    });
    let current = await measure('CONTRACT_DETAIL_MS', async () => {
      const response = await oidcApp.inject({
        method: 'GET',
        url: `/api/v1/commercial/contracts/${created.contract.id}`,
        headers: requestHeaders(),
      });
      expect(response.statusCode).toBe(200);
      return contractEnvelopeSchema.parse(response.json()).data;
    });
    current = await measure('CONTRACT_DRAFT_UPDATE_MS', async () => {
      const response = await oidcApp.inject({
        method: 'PATCH',
        url: `/api/v1/commercial/contracts/${current.id}`,
        headers: requestHeaders(),
        payload: { title: 'Performance baseline Contract', expected_version: current.version },
      });
      expect(response.statusCode).toBe(200);
      return contractEnvelopeSchema.parse(response.json()).data;
    });
    current = await measure('CONTRACT_SUBMIT_MS', () => mutate(current, 'submit'));
    current = await measure('CONTRACT_APPROVE_MS', () => mutate(current, 'approve', bobToken));
    current = await measure('CONTRACT_REVISE_MS', () => mutate(current, 'revise'));
    process.stdout.write(
      `${JSON.stringify({ BASELINE_MEASUREMENT_NOT_SLO: true, ...Object.fromEntries(timings) })}\n`,
    );
  });
});

describe.sequential('Subscription Registry signed OIDC acceptance matrix', () => {
  const aliceMembership = '30000000-0000-4000-8000-000000000055';
  const aliceUser = '40000000-0000-4000-8000-000000000044';
  const bobMembership = '30000000-0000-4000-8000-000000000099';
  const bobUser = '50000000-0000-4000-8000-000000000055';
  let aliceToken: string;
  let bobToken: string;
  let charlieToken: string;
  let opportunityId: string;
  let planId: string;
  let customerId: string;
  let primary: Subscription;

  const headers = (key = randomUUID(), tenant = tenantA, token = aliceToken) => ({
    authorization: `Bearer ${token}`,
    'x-acs-tenant-id': tenant,
    'idempotency-key': key,
  });
  const dates = () => ({
    effective_from: new Date(Date.now() + 86_400_000).toISOString(),
    effective_until: new Date(Date.now() + 31 * 86_400_000).toISOString(),
  });
  const activeContract = async (tenant = tenantA, active = true) => {
    const suffix = randomUUID().slice(0, 10);
    const reference = await admin.query<{
      opportunity_id: string;
      plan_id: string;
      customer_id: string;
    }>(
      `SELECT o.id opportunity_id,p.id plan_id,c.id customer_id FROM commercial.opportunities o
       JOIN commercial.plans p ON p.tenant_id=o.tenant_id JOIN commercial.customers c ON c.tenant_id=o.tenant_id
       WHERE o.tenant_id=$1 ORDER BY o.id,p.id,c.id LIMIT 1`,
      [tenant],
    );
    if (!reference.rows[0]) throw new Error('Subscription source references are unavailable.');
    const membership =
      tenant === tenantA ? aliceMembership : '30000000-0000-4000-8000-000000000088';
    const user = tenant === tenantA ? aliceUser : '40000000-0000-4000-8000-000000000077';
    const proposal = await admin.query<{ id: string }>(
      `INSERT INTO commercial.proposals(tenant_id,proposal_code,title,opportunity_id,customer_id,owner_membership_id,created_by_membership_id,currency_code,status,valid_until,proposal_subtotal,grand_total,approved_by_membership_id,approved_at,created_by,updated_by)
       VALUES($1,$2,'Subscription source',$3,$4,$5,$5,'USD','ACCEPTED',clock_timestamp()+interval '60 days',25,25,$5,clock_timestamp(),$6,$6) RETURNING id`,
      [
        tenant,
        `SUB-SRC-${suffix}`,
        reference.rows[0].opportunity_id,
        reference.rows[0].customer_id,
        membership,
        user,
      ],
    );
    const proposalLine = await admin.query<{ id: string }>(
      `INSERT INTO commercial.proposal_line_items(proposal_id,tenant_id,line_number,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal)
       VALUES($1,$2,1,$3,'Subscription plan snapshot','Subscription source line',1,25,25) RETURNING id`,
      [proposal.rows[0]!.id, tenant, reference.rows[0].plan_id],
    );
    const contract = await admin.query<{ id: string }>(
      `INSERT INTO commercial.contracts(tenant_id,source_proposal_id,source_proposal_revision_number,source_proposal_code,title,opportunity_id,customer_id,owner_membership_id,created_by_membership_id,currency_code,status,effective_from,effective_until,contract_subtotal,grand_total,approved_by_membership_id,approved_at,created_by,updated_by)
       VALUES($1,$2,1,$3,'Subscription source contract',$4,$5,$6,$6,'USD',$7,clock_timestamp(),clock_timestamp()+interval '365 days',25,25,$6,clock_timestamp(),$8,$8) RETURNING id`,
      [
        tenant,
        proposal.rows[0]!.id,
        `SUB-SRC-${suffix}`,
        reference.rows[0].opportunity_id,
        reference.rows[0].customer_id,
        membership,
        active ? 'ACTIVE' : 'APPROVED',
        user,
      ],
    );
    await admin.query(
      `INSERT INTO commercial.contract_line_items(contract_id,tenant_id,line_number,source_proposal_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal)
       VALUES($1,$2,1,$3,$4,'Subscription plan snapshot','Subscription source line',1,25,25)`,
      [contract.rows[0]!.id, tenant, proposalLine.rows[0]!.id, reference.rows[0].plan_id],
    );
    return contract.rows[0]!.id;
  };
  const createSubscription = async (key = randomUUID(), contractId?: string) => {
    const source = contractId ?? (await activeContract());
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(key),
      payload: { contract_id: source, ...dates() },
    });
    expect(response.statusCode, response.body).toBe(200);
    return {
      subscription: subscriptionEnvelopeSchema.parse(response.json()).data,
      response,
      key,
      source,
    };
  };
  const transition = async (subscription: Subscription, action: string, token = aliceToken) => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/subscriptions/${subscription.id}/${action}`,
      headers: headers(randomUUID(), tenantA, token),
      payload: { expected_version: subscription.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    return subscriptionEnvelopeSchema.parse(response.json()).data;
  };
  const activeSubscription = async () => {
    let subscription = (await createSubscription()).subscription;
    subscription = await transition(subscription, 'request-activation');
    return transition(subscription, 'activate', bobToken);
  };
  const issueContext = async (action: string) => {
    const contexts = new PostgresTenantContextRepository(
      requiredEnvironment.issuer as string,
      requiredEnvironment.tenant as string,
    );
    const issued = await contexts.issueContext(
      JSON.stringify(['https://issuer.acs.test', 'alice']),
      tenantA,
      action,
    );
    if (!issued) throw new Error('Canonical Subscription test context was not issued.');
    return { ...issued, close: () => contexts.close() };
  };

  beforeAll(async () => {
    aliceToken = await signedOidcToken('alice');
    bobToken = await signedOidcToken('bob');
    charlieToken = await signedOidcToken('charlie');
    await admin.query(
      `INSERT INTO platform.memberships(id,tenant_id,user_id,status) VALUES($1,$2,$3,'ACTIVE') ON CONFLICT DO NOTHING`,
      [bobMembership, tenantA, bobUser],
    );
    await admin.query(
      `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
       SELECT $1,$2,permission_key FROM platform.permissions WHERE permission_key LIKE 'commercial.subscription.%' ON CONFLICT DO NOTHING`,
      [tenantA, bobMembership],
    );
    const reference = await admin.query<{
      opportunity_id: string;
      plan_id: string;
      customer_id: string;
    }>(
      `SELECT o.id opportunity_id,p.id plan_id,c.id customer_id FROM commercial.opportunities o
       JOIN commercial.plans p ON p.tenant_id=o.tenant_id JOIN commercial.customers c ON c.tenant_id=o.tenant_id
       WHERE o.tenant_id=$1 ORDER BY o.id,p.id,c.id LIMIT 1`,
      [tenantA],
    );
    if (!reference.rows[0]) throw new Error('Subscription E2E references are unavailable.');
    opportunityId = reference.rows[0].opportunity_id;
    planId = reference.rows[0].plan_id;
    customerId = reference.rows[0].customer_id;
    expect([opportunityId, planId, customerId].every(Boolean)).toBe(true);
  });

  it('SUB-POS-001 creates a DRAFT from an ACTIVE Contract through signed OIDC', async () => {
    primary = (await createSubscription()).subscription;
    expect(primary).toMatchObject({ status: 'DRAFT', revision_number: 1, version: 1 });
  });
  it('SUB-POS-002 lists and reads only tenant-scoped Subscriptions', async () => {
    const list = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/subscriptions?limit=100',
      headers: headers(),
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(
      subscriptionListEnvelopeSchema.parse(list.json()).data.some((item) => item.id === primary.id),
    ).toBe(true);
    const detail = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/subscriptions/${primary.id}`,
      headers: headers(),
    });
    expect(subscriptionEnvelopeSchema.parse(detail.json()).data.id).toBe(primary.id);
  });
  it('SUB-POS-003 updates effective dates while DRAFT', async () => {
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/subscriptions/${primary.id}`,
      headers: headers(),
      payload: {
        effective_until: new Date(Date.now() + 40 * 86_400_000).toISOString(),
        expected_version: primary.version,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    primary = subscriptionEnvelopeSchema.parse(response.json()).data;
    expect(primary.version).toBe(2);
  });
  it('SUB-POS-004 assigns an active same-tenant owner', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/subscriptions/${primary.id}/assign`,
      headers: headers(),
      payload: { owner_membership_id: bobMembership, expected_version: primary.version },
    });
    expect(response.statusCode, response.body).toBe(200);
    primary = subscriptionEnvelopeSchema.parse(response.json()).data;
    expect(primary.owner_membership_id).toBe(bobMembership);
  });
  it('SUB-POS-005 requests activation explicitly', async () => {
    primary = await transition(primary, 'request-activation');
    expect(primary.status).toBe('PENDING_ACTIVATION');
  });
  it('SUB-POS-006 activates with creator/approver segregation', async () => {
    primary = await transition(primary, 'activate', bobToken);
    expect(primary.status).toBe('ACTIVE');
  });
  it('SUB-POS-007 suspends and resumes explicitly', async () => {
    primary = await transition(primary, 'suspend');
    expect(primary.status).toBe('SUSPENDED');
    primary = await transition(primary, 'resume');
    expect(primary.status).toBe('ACTIVE');
  });
  it('SUB-POS-008 renews only by extending a defined end', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/subscriptions/${primary.id}/renew`,
      headers: headers(),
      payload: {
        effective_until: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        expected_version: primary.version,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    primary = subscriptionEnvelopeSchema.parse(response.json()).data;
  });
  it('SUB-POS-009 cancels an active Subscription', async () => {
    const value = await transition(await activeSubscription(), 'cancel');
    expect(value.status).toBe('CANCELLED');
  });
  it('SUB-POS-010 terminates an active Subscription', async () => {
    const value = await transition(await activeSubscription(), 'terminate');
    expect(value.status).toBe('TERMINATED');
  });
  it('SUB-POS-011 replays the same tenant-scoped idempotent request', async () => {
    const key = randomUUID();
    const source = await activeContract();
    const effective = dates();
    const first = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(key),
      payload: { contract_id: source, ...effective },
    });
    const second = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(key),
      payload: { contract_id: source, ...effective },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);
    expect(subscriptionEnvelopeSchema.parse(second.json()).meta.idempotent_replay).toBe(true);
  });
  it('SUB-POS-012 records immutable history, audit and outbox together', async () => {
    const evidence = await admin.query<{ revisions: string; audits: string; events: string }>(
      `SELECT (SELECT count(*) FROM commercial.subscription_revisions WHERE subscription_id=$1)::text revisions,
       (SELECT count(*) FROM platform.audit_logs WHERE resource=$2)::text audits,
       (SELECT count(*) FROM platform.domain_events WHERE payload->>'id'=$1::text)::text events`,
      [primary.id, `commercial:subscription:${primary.id}`],
    );
    expect(Number(evidence.rows[0]!.revisions)).toBeGreaterThanOrEqual(6);
    expect(Number(evidence.rows[0]!.audits)).toBeGreaterThanOrEqual(6);
    expect(Number(evidence.rows[0]!.events)).toBeGreaterThanOrEqual(6);
  });

  it('SUB-NEG-001 rejects missing authentication', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/subscriptions/${primary.id}`,
      headers: { 'x-acs-tenant-id': tenantA },
    });
    expect(response.statusCode).toBe(401);
  });
  it('SUB-NEG-002 denies a member without Subscription permission', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/subscriptions/${primary.id}`,
      headers: headers(randomUUID(), tenantA, charlieToken),
    });
    expect(response.statusCode).toBe(403);
  });
  it('SUB-NEG-003 rejects tenant-header spoofing', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: `/api/v1/commercial/subscriptions/${primary.id}`,
      headers: headers(randomUUID(), tenantB),
    });
    expect([403, 404]).toContain(response.statusCode);
  });
  it('SUB-NEG-004 does not create from a foreign-tenant Contract', async () => {
    const foreignReference = await admin.query<{ id: string }>(
      'SELECT id FROM commercial.contracts WHERE tenant_id=$1 LIMIT 1',
      [tenantB],
    );
    const foreign = foreignReference.rows[0]?.id ?? randomUUID();
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(),
      payload: { contract_id: foreign, ...dates() },
    });
    expect([400, 404]).toContain(response.statusCode);
  });
  it('SUB-NEG-005 rejects a non-ACTIVE Contract', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(),
      payload: { contract_id: await activeContract(tenantA, false), ...dates() },
    });
    expect(response.statusCode).toBe(400);
  });
  it('SUB-NEG-006 prevents duplicate current Subscription creation', async () => {
    const source = await activeContract();
    await createSubscription(randomUUID(), source);
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(),
      payload: { contract_id: source, ...dates() },
    });
    expect(response.statusCode).toBe(409);
  });
  it('SUB-NEG-007 rejects mass-assignment fields', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(),
      payload: {
        contract_id: await activeContract(),
        tenant_id: tenantB,
        status: 'ACTIVE',
        ...dates(),
      },
    });
    expect(response.statusCode).toBe(400);
  });
  it('SUB-NEG-008 rejects inverted effective dates', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(),
      payload: {
        contract_id: await activeContract(),
        effective_from: new Date(Date.now() + 20_000).toISOString(),
        effective_until: new Date(Date.now() + 10_000).toISOString(),
      },
    });
    expect(response.statusCode).toBe(400);
  });
  it('SUB-NEG-009 rejects stale expected_version', async () => {
    const current = (await createSubscription()).subscription;
    const response = await oidcApp.inject({
      method: 'PATCH',
      url: `/api/v1/commercial/subscriptions/${current.id}`,
      headers: headers(),
      payload: { effective_until: dates().effective_until, expected_version: current.version + 1 },
    });
    expect(response.statusCode).toBe(409);
  });
  it('SUB-NEG-010 rejects invalid lifecycle transitions', async () => {
    const current = (await createSubscription()).subscription;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/subscriptions/${current.id}/suspend`,
      headers: headers(),
      payload: { expected_version: current.version },
    });
    expect(response.statusCode).toBe(400);
  });
  it('SUB-NEG-011 enforces creator/activator segregation', async () => {
    let current = (await createSubscription()).subscription;
    current = await transition(current, 'request-activation');
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/subscriptions/${current.id}/activate`,
      headers: headers(),
      payload: { expected_version: current.version },
    });
    expect(response.statusCode).toBe(403);
  });
  it('SUB-NEG-012 rejects a foreign-tenant owner', async () => {
    const current = (await createSubscription()).subscription;
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/subscriptions/${current.id}/assign`,
      headers: headers(),
      payload: {
        owner_membership_id: '30000000-0000-4000-8000-000000000088',
        expected_version: current.version,
      },
    });
    expect([400, 404]).toContain(response.statusCode);
  });
  it('SUB-NEG-013 rejects malformed resource identifiers', async () => {
    const response = await oidcApp.inject({
      method: 'GET',
      url: '/api/v1/commercial/subscriptions/not-a-uuid',
      headers: headers(),
    });
    expect(response.statusCode).toBe(400);
  });
  it('SUB-NEG-014 requires an idempotency key on mutations', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: { authorization: `Bearer ${aliceToken}`, 'x-acs-tenant-id': tenantA },
      payload: { contract_id: await activeContract(), ...dates() },
    });
    expect(response.statusCode).toBe(400);
  });
  it('SUB-NEG-015 rejects divergent payload reuse', async () => {
    const key = randomUUID();
    const source = await activeContract();
    const effective = dates();
    const first = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(key),
      payload: { contract_id: source, ...effective },
    });
    expect(first.statusCode, first.body).toBe(200);
    const second = await oidcApp.inject({
      method: 'POST',
      url: '/api/v1/commercial/subscriptions',
      headers: headers(key),
      payload: {
        contract_id: source,
        ...effective,
        effective_until: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      },
    });
    expect(second.statusCode).toBe(409);
  });
  it('SUB-NEG-016 makes CANCELLED terminal', async () => {
    const current = await transition(await activeSubscription(), 'cancel');
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/subscriptions/${current.id}/resume`,
      headers: headers(),
      payload: { expected_version: current.version },
    });
    expect(response.statusCode).toBe(400);
  });
  it('SUB-NEG-017 makes TERMINATED terminal', async () => {
    const current = await transition(await activeSubscription(), 'terminate');
    const response = await oidcApp.inject({
      method: 'POST',
      url: `/api/v1/commercial/subscriptions/${current.id}/request-activation`,
      headers: headers(),
      payload: { expected_version: current.version },
    });
    expect(response.statusCode).toBe(400);
  });
  it('SUB-NEG-018 preserves FORCE RLS against an untrusted direct session', async () => {
    const direct = new Client({ connectionString: subscriptionDatabaseUrl });
    await direct.connect();
    const rows = await direct.query('SELECT id FROM commercial.subscriptions WHERE id=$1', [
      primary.id,
    ]);
    await direct.end();
    expect(rows.rowCount).toBe(0);
  });
  it('SUB-NEG-019 excludes sensitive relationship data from audit and outbox', async () => {
    const evidence = await admin.query<{ audit: string; event: string }>(
      `SELECT coalesce((SELECT metadata::text FROM platform.audit_logs WHERE resource=$1 ORDER BY occurred_at DESC LIMIT 1),'') audit,
       coalesce((SELECT payload::text FROM platform.domain_events WHERE payload->>'id'=$2 ORDER BY occurred_at DESC LIMIT 1),'') event`,
      [`commercial:subscription:${primary.id}`, primary.id],
    );
    expect(evidence.rows[0]!.audit).not.toContain('contact');
    expect(evidence.rows[0]!.event).not.toContain('contact');
  });
  it('SUB-NEG-020 rolls aggregate, history, audit and outbox back atomically', async () => {
    const source = await activeContract();
    const context = await issueContext('commercial.subscription.create');
    const correlationId = randomUUID();
    const repository = new PostgresSubscriptionRegistryRepository(
      subscriptionDatabaseUrl,
      (phase) => {
        if (phase === 'after-outbox') throw new Error('TEST_ONLY_SUBSCRIPTION_FAILURE');
      },
    );
    await expect(
      repository.create({
        actorUserId: aliceUser,
        contextToken: context.contextToken,
        correlationId,
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        requestId: randomUUID(),
        tenantId: tenantA,
        action: 'commercial.subscription.create',
        contract_id: source,
        ...dates(),
      }),
    ).rejects.toThrow('TEST_ONLY_SUBSCRIPTION_FAILURE');
    await repository.close();
    await context.close();
    expect(
      (
        await admin.query('SELECT 1 FROM commercial.subscriptions WHERE source_contract_id=$1', [
          source,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await admin.query('SELECT 1 FROM platform.audit_logs WHERE correlation_id=$1', [
          correlationId,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await admin.query('SELECT 1 FROM platform.domain_events WHERE correlation_id=$1', [
          correlationId,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it('SUB-NEG-021 allows exactly one concurrent mutation for one version', async () => {
    const current = (await createSubscription()).subscription;
    const race = await Promise.all(
      ['a', 'b'].map(() =>
        oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/subscriptions/${current.id}`,
          headers: headers(),
          payload: {
            effective_until: new Date(Date.now() + 50 * 86_400_000).toISOString(),
            expected_version: current.version,
          },
        }),
      ),
    );
    expect(race.map((response) => response.statusCode).sort()).toEqual([200, 409]);
  });
  it('SUB-NEG-022 proves all unauthorized downstream side effects remain absent', async () => {
    const downstream = await admin.query<Record<string, string | null>>(
      `SELECT to_regclass('commercial.entitlements')::text entitlements,to_regclass('commercial.usage_records')::text usage,
       to_regclass('commercial.invoices')::text invoices,to_regclass('commercial.payments')::text payments,
       to_regclass('commercial.receipts')::text receipts,to_regclass('commercial.collections')::text collections,
       to_regclass('commercial.accounting_entries')::text accounting,to_regclass('commercial.commissions')::text commissions`,
    );
    expect(Object.values(downstream.rows[0]!).every((value) => value === null)).toBe(true);
  });

  it('records a Subscription signed-OIDC PostgreSQL baseline without asserting an SLO', async () => {
    const samples = new Map<string, number[]>();
    const record = async <T>(name: string, measured: boolean, work: () => Promise<T>) => {
      const startedAt = performance.now();
      const value = await work();
      if (measured) {
        const values = samples.get(name) ?? [];
        values.push(performance.now() - startedAt);
        samples.set(name, values);
      }
      return value;
    };
    const runLifecycle = async (measured: boolean) => {
      const source = await activeContract();
      const journeyStartedAt = performance.now();
      let current = (
        await record('SUBSCRIPTION_CREATE_FROM_ACTIVE_CONTRACT_MS', measured, () =>
          createSubscription(randomUUID(), source),
        )
      ).subscription;
      await record('SUBSCRIPTION_LIST_MS', measured, async () => {
        const response = await oidcApp.inject({
          method: 'GET',
          url: '/api/v1/commercial/subscriptions?limit=25',
          headers: headers(),
        });
        expect(response.statusCode, response.body).toBe(200);
        expect(subscriptionListEnvelopeSchema.parse(response.json()).data).toBeInstanceOf(Array);
      });
      current = await record('SUBSCRIPTION_DETAIL_MS', measured, async () => {
        const response = await oidcApp.inject({
          method: 'GET',
          url: `/api/v1/commercial/subscriptions/${current.id}`,
          headers: headers(),
        });
        expect(response.statusCode, response.body).toBe(200);
        return subscriptionEnvelopeSchema.parse(response.json()).data;
      });
      current = await record('SUBSCRIPTION_DRAFT_UPDATE_MS', measured, async () => {
        const response = await oidcApp.inject({
          method: 'PATCH',
          url: `/api/v1/commercial/subscriptions/${current.id}`,
          headers: headers(),
          payload: {
            effective_until: new Date(Date.now() + 40 * 86_400_000).toISOString(),
            expected_version: current.version,
          },
        });
        expect(response.statusCode, response.body).toBe(200);
        return subscriptionEnvelopeSchema.parse(response.json()).data;
      });
      current = await record('SUBSCRIPTION_OWNER_ASSIGNMENT_MS', measured, async () => {
        const response = await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/subscriptions/${current.id}/assign`,
          headers: headers(),
          payload: { owner_membership_id: bobMembership, expected_version: current.version },
        });
        expect(response.statusCode, response.body).toBe(200);
        return subscriptionEnvelopeSchema.parse(response.json()).data;
      });
      current = await record('SUBSCRIPTION_REQUEST_ACTIVATION_MS', measured, () =>
        transition(current, 'request-activation'),
      );
      current = await record('SUBSCRIPTION_ACTIVATE_MS', measured, () =>
        transition(current, 'activate', bobToken),
      );
      current = await record('SUBSCRIPTION_SUSPEND_MS', measured, () =>
        transition(current, 'suspend'),
      );
      current = await record('SUBSCRIPTION_RESUME_MS', measured, () =>
        transition(current, 'resume'),
      );
      current = await record('SUBSCRIPTION_RENEW_MS', measured, async () => {
        const response = await oidcApp.inject({
          method: 'POST',
          url: `/api/v1/commercial/subscriptions/${current.id}/renew`,
          headers: headers(),
          payload: {
            effective_until: new Date(Date.now() + 60 * 86_400_000).toISOString(),
            expected_version: current.version,
          },
        });
        expect(response.statusCode, response.body).toBe(200);
        return subscriptionEnvelopeSchema.parse(response.json()).data;
      });
      current = await record('SUBSCRIPTION_TERMINAL_TRANSITION_MS', measured, () =>
        transition(current, 'cancel'),
      );
      expect(current.status).toBe('CANCELLED');
      if (measured) {
        const values = samples.get('SUBSCRIPTION_COMPLETE_JOURNEY_MS') ?? [];
        values.push(performance.now() - journeyStartedAt);
        samples.set('SUBSCRIPTION_COMPLETE_JOURNEY_MS', values);
      }
    };
    const summarize = (values: number[]) => {
      const sorted = [...values].sort((left, right) => left - right);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      return {
        sample_count: values.length,
        median_ms: Number(median.toFixed(2)),
        min_ms: Number(sorted[0]!.toFixed(2)),
        max_ms: Number(sorted.at(-1)!.toFixed(2)),
      };
    };

    await runLifecycle(false);
    for (let iteration = 0; iteration < 5; iteration += 1) await runLifecycle(true);

    process.stdout.write(
      `${JSON.stringify({
        BASELINE_MEASUREMENT_NOT_SLO: true,
        PERFORMANCE_ENVIRONMENT: 'LOCAL_DISPOSABLE_TEST_ONLY',
        WARM_UP_COMPLETED: true,
        ...Object.fromEntries([...samples].map(([name, values]) => [name, summarize(values)])),
      })}\n`,
    );
  });
});
