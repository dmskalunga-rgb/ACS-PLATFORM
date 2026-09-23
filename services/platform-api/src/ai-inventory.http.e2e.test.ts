import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { aiInventoryMutationEnvelopeSchema, errorEnvelopeSchema } from '@acs/contracts';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';

const adminUrl = process.env.DATABASE_URL;
const issuerUrl = process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL;
const tenantUrl = process.env.ACS_TENANT_DATABASE_URL;
const auditUrl = process.env.ACS_SECURITY_AUDIT_DATABASE_URL;
const inventoryUrl = process.env.ACS_AIGOV_M0A_DATABASE_URL;
if (!adminUrl || !issuerUrl || !tenantUrl || !auditUrl || !inventoryUrl)
  throw new Error('Disposable AIGOV M0A HTTP E2E database URLs are required.');

const tenantId = '00000000-0000-4000-8000-000000000011';
const otherTenantId = '00000000-0000-4000-8000-000000000022';
const membershipId = '30000000-0000-4000-8000-000000000055';
const evidenceId = 'e3000000-0000-4000-8000-000000000011';
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: pg.Client;
let jwks: Server;
let token: string;
let assetId: string;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(
    `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
     SELECT $1::uuid,$2::uuid,permission_key FROM platform.permissions
     WHERE permission_key LIKE 'aigov.%' ON CONFLICT DO NOTHING`,
    [tenantId, membershipId],
  );
  const keys = await generateKeyPair('RS256');
  const publicJwk = {
    ...(await exportJWK(keys.publicKey)),
    alg: 'RS256',
    kid: 'aigov-m0a-e2e',
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
    .setProtectedHeader({ alg: 'RS256', kid: 'aigov-m0a-e2e' })
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
    aiGovM0aDatabaseUrl: inventoryUrl,
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
  system_key: `signed-oidc-${randomUUID().slice(0, 8)}`,
  name: 'Signed OIDC Inventory',
  purpose: 'HTTP integration qualification',
  owner_reference: 'owner:risk',
  classification: 'INTERNAL',
  evidence_reference: evidenceId,
});

describe.sequential('AIGOV M0A signed-OIDC HTTP and real PostgreSQL acceptance', () => {
  it('registers, reads and updates a system with canonical server authority', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems`,
      headers: headers(),
      payload: payload(),
    });
    expect(created.statusCode, created.body).toBe(201);
    assetId = aiInventoryMutationEnvelopeSchema.parse(created.json()).data.asset_id;
    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems/${assetId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode, read.body).toBe(200);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems/${assetId}`,
      headers: headers(),
      payload: {
        expected_version: 1,
        name: 'Governed Update',
        reason_reference: 'change:approved',
        evidence_reference: evidenceId,
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(aiInventoryMutationEnvelopeSchema.parse(updated.json()).data).toMatchObject({
      version: 2,
    });
  });

  it('returns bounded canonical errors for stale writes and invalid evidence', async () => {
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems/${assetId}`,
      headers: headers(),
      payload: {
        expected_version: 1,
        name: 'Stale Update',
        reason_reference: 'change:stale',
        evidence_reference: evidenceId,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(stale.json()).error.code).toBe('STALE_VERSION');
    const wrongEvidence = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems`,
      headers: headers(),
      payload: { ...payload(), evidence_reference: 'e3000000-0000-4000-8000-000000000022' },
    });
    expect(wrongEvidence.statusCode).toBe(422);
    expect(errorEnvelopeSchema.parse(wrongEvidence.json()).error.code).toBe('INVALID_REFERENCE');
  });

  it('rejects cross-tenant reuse, unknown fields and missing authentication', async () => {
    const crossTenant = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${otherTenantId}/ai-systems`,
      headers: headers(),
      payload: payload(),
    });
    expect(crossTenant.statusCode).toBe(403);
    const massAssignment = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems`,
      headers: headers(),
      payload: { ...payload(), status: 'ACTIVE' },
    });
    expect(massAssignment.statusCode).toBe(400);
    const missingAuth = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems`,
      headers: { 'idempotency-key': randomUUID() },
      payload: payload(),
    });
    expect(missingAuth.statusCode).toBe(401);
  });
});
