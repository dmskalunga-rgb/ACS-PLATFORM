import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { aiRiskRecordSchema, errorEnvelopeSchema } from '@acs/contracts';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';

const adminUrl = process.env.DATABASE_URL;
const issuerUrl = process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL;
const tenantUrl = process.env.ACS_TENANT_DATABASE_URL;
const auditUrl = process.env.ACS_SECURITY_AUDIT_DATABASE_URL;
const riskUrl = process.env.ACS_AIGOV_M0B_DATABASE_URL;
if (!adminUrl || !issuerUrl || !tenantUrl || !auditUrl || !riskUrl)
  throw new Error('Disposable AIGOV M0B signed-OIDC HTTP URLs are required.');

const tenantId = '00000000-0000-4000-8000-000000000011';
const otherTenantId = '00000000-0000-4000-8000-000000000022';
const userId = '40000000-0000-4000-8000-000000000044';
const membershipId = '30000000-0000-4000-8000-000000000055';
const evidenceId = 'e3000000-0000-4000-8000-000000000011';
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: pg.Client;
let jwks: Server;
let token: string;
let riskId: string;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(
    `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
     SELECT $1::uuid,$2::uuid,permission_key FROM platform.permissions
      WHERE permission_key LIKE 'aigov.risk.%' ON CONFLICT DO NOTHING`,
    [tenantId, membershipId],
  );
  const keys = await generateKeyPair('RS256');
  const publicJwk = {
    ...(await exportJWK(keys.publicKey)),
    alg: 'RS256',
    kid: 'aigov-m0b-e2e',
    use: 'sig',
  };
  jwks = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', resolve));
  const address = jwks.address();
  if (!address || typeof address === 'string') throw new Error('Test JWKS is unavailable.');
  token = await new SignJWT({ amr: ['pwd', 'otp'] })
    .setProtectedHeader({ alg: 'RS256', kid: 'aigov-m0b-e2e' })
    .setIssuer('https://issuer.acs.test')
    .setAudience('acs-platform-api')
    .setSubject('alice')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey);
  const configuration: PlatformConfiguration = {
    environment: 'test',
    host: '127.0.0.1',
    identityMode: 'oidc',
    logLevel: 'error',
    port: 3000,
    resolverDatabaseUrl: issuerUrl,
    tenantDatabaseUrl: tenantUrl,
    securityAuditDatabaseUrl: auditUrl,
    aiGovM0bDatabaseUrl: riskUrl,
    webOrigin: 'http://localhost:5173',
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
  };
  app = await buildApp(configuration, { logger: false });
});

afterAll(async () => {
  if (app) await app.close();
  if (jwks)
    await new Promise<void>((resolve, reject) =>
      jwks.close((error) => (error ? reject(error) : resolve())),
    );
  if (admin) await admin.end();
});

const headers = () => ({ authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() });
const payload = () => ({
  risk_code: `AIR-${randomUUID().slice(0, 8).toUpperCase()}`,
  title: 'Signed-OIDC AI risk',
  description: 'Human-governed risk registration',
  primary_category: 'AIR-T01',
  owner_user_id: userId,
  inventory: { kind: 'MODEL', id: 'a1100000-0000-4000-8000-000000000011' },
  evidence_reference: evidenceId,
});
const riskUrlFor = (id: string) => `/api/v1/ai-governance/tenants/${tenantId}/risks/${id}`;

describe.sequential('AIGOV M0B signed-OIDC HTTP and PostgreSQL acceptance', () => {
  it('registers, reads and assesses a tenant-bound AI risk', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/risks`,
      headers: headers(),
      payload: payload(),
    });
    expect(created.statusCode, created.body).toBe(201);
    riskId = z.object({ data: aiRiskRecordSchema }).parse(created.json()).data.risk_id;
    const read = await app.inject({
      method: 'GET',
      url: riskUrlFor(riskId),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(z.object({ data: aiRiskRecordSchema }).parse(read.json()).data).toMatchObject({
      risk_id: riskId,
      status: 'IDENTIFIED',
    });
    const assessed = await app.inject({
      method: 'POST',
      url: `${riskUrlFor(riskId)}/assessments`,
      headers: headers(),
      payload: {
        expected_version: 1,
        likelihood: 2,
        impact: 3,
        exposure: 4,
        detectability: 3,
        autonomy: 2,
        blast_radius: 1,
        control_strength: 0.5,
        previous_assessment_id: null,
        reason_reference: 'reason:initial',
        trigger_reference: 'trigger:initial',
        evidence_reference: evidenceId,
      },
    });
    expect(assessed.statusCode, assessed.body).toBe(201);
    expect(
      z
        .object({ data: z.object({ inherent_score: z.number(), residual_score: z.number() }) })
        .parse(assessed.json()).data,
    ).toMatchObject({
      inherent_score: 15,
      residual_score: 7.5,
    });
  });

  it('fails closed for protected decisions pending governed MPA policy', async () => {
    const before = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM platform.domain_events
        WHERE payload->>'risk_id'=$1`,
      [riskId],
    );
    const decision = await app.inject({
      method: 'POST',
      url: `${riskUrlFor(riskId)}/decision`,
      headers: headers(),
      payload: {
        expected_version: 2,
        decision: 'ACCEPT',
        review_id: randomUUID(),
        reason_reference: 'reason:not-authorized',
        evidence_reference: evidenceId,
      },
    });
    expect(decision.statusCode, decision.body).toBe(403);
    expect(errorEnvelopeSchema.parse(decision.json()).error.code).toBe(
      'NOT_AUTHORIZED_PENDING_POLICY',
    );
    const after = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM platform.domain_events
        WHERE payload->>'risk_id'=$1`,
      [riskId],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('rejects cross-tenant input, mass assignment and missing authentication', async () => {
    const crossTenant = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${otherTenantId}/risks`,
      headers: headers(),
      payload: payload(),
    });
    expect(crossTenant.statusCode).toBe(403);
    const massAssignment = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/risks`,
      headers: headers(),
      payload: { ...payload(), status: 'ACCEPTED' },
    });
    expect(massAssignment.statusCode).toBe(400);
    const missingAuth = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/risks`,
      headers: { 'idempotency-key': randomUUID() },
      payload: payload(),
    });
    expect(missingAuth.statusCode).toBe(401);
  });
});
