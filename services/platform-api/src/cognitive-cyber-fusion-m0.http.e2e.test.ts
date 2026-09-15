import { evidenceMutationEnvelopeSchema, evidenceSourceEnvelopeSchema } from '@acs/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';

const { Client } = pg;
const adminUrl = process.env.DATABASE_URL;
const issuerUrl = process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL;
const tenantUrl = process.env.ACS_TENANT_DATABASE_URL;
const auditUrl = process.env.ACS_SECURITY_AUDIT_DATABASE_URL;
const evidenceUrl = process.env.ACS_XCAP005_EVIDENCE_DATABASE_URL;
const fusionUrl = process.env.ACS_XCAP011_DATABASE_URL;

if (!adminUrl || !issuerUrl || !tenantUrl || !auditUrl || !evidenceUrl || !fusionUrl)
  throw new Error('Disposable XCAP-011 HTTP E2E database URLs are required.');

const tenantA = '00000000-0000-4000-8000-000000000011';
const signedOidcMembership = '30000000-0000-4000-8000-000000000055';
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: pg.Client;
let jwks: Server;
let token: string;
let signToken: (subject: string) => Promise<string>;
let evidenceId: string;
let evidenceVersion: number;
let provenanceReference: string;

type ErrorBody = { readonly error: { readonly code: string } };
const errorCode = (response: { json(): unknown }) => (response.json() as ErrorBody).error.code;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(
    `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
     SELECT $1::uuid,$2::uuid,permission_key FROM (VALUES
       ('cyberdefense.fusion.request'),('cyberdefense.fusion.read'),
       ('cyberdefense.evidence.read'),('cyberdefense.evidence.collect')
     ) AS permissions(permission_key) ON CONFLICT DO NOTHING`,
    [tenantA, signedOidcMembership],
  );

  const keys = await generateKeyPair('RS256');
  const publicJwk = {
    ...(await exportJWK(keys.publicKey)),
    alg: 'RS256',
    kid: 'xcap011-e2e',
    use: 'sig',
  };
  jwks = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', resolve));
  const address = jwks.address();
  if (!address || typeof address === 'string') throw new Error('Test JWKS is unavailable.');
  signToken = (subject) =>
    new SignJWT({ amr: ['pwd', 'otp'] })
      .setProtectedHeader({ alg: 'RS256', kid: 'xcap011-e2e' })
      .setIssuer('https://issuer.acs.test')
      .setAudience('acs-platform-api')
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(keys.privateKey);
  token = await signToken('alice');
  const configuration: PlatformConfiguration = {
    environment: 'test',
    host: '127.0.0.1',
    identityMode: 'oidc',
    logLevel: 'error',
    port: 3000,
    resolverDatabaseUrl: issuerUrl,
    securityAuditDatabaseUrl: auditUrl,
    tenantDatabaseUrl: tenantUrl,
    xcap005EvidenceDatabaseUrl: evidenceUrl,
    xcap005MaximumEvidenceBytes: 1024 * 1024,
    xcap011DatabaseUrl: fusionUrl,
    xcap011ReceiptLifetimeSeconds: 300,
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

  const headers = { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
  const source = await app.inject({
    method: 'POST',
    url: `/api/v1/cyberdefense/tenants/${tenantA}/evidence-sources`,
    headers,
    payload: {
      source_type: 'TEST',
      connector_type: 'TEST',
      external_binding: `xcap011-e2e:${randomUUID()}`,
      credential_reference: `test-only:${randomUUID()}`,
      trust_classification: 'TRUSTED',
      ingestion_policy_version: '1.0.0',
    },
  });
  expect(source.statusCode, source.body).toBe(201);
  const sourceId = evidenceSourceEnvelopeSchema.parse(source.json()).data.source_id;
  const bytes = Buffer.from('acs-xcap011-m0-http-e2e', 'utf8');
  const collected = await app.inject({
    method: 'POST',
    url: `/api/v1/cyberdefense/tenants/${tenantA}/evidence`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: {
      evidence_source_id: sourceId,
      source_event_id: `xcap011-e2e-${randomUUID()}`,
      observed_at: new Date().toISOString(),
      media_type: 'text/plain',
      raw_bytes_base64: bytes.toString('base64'),
      declared_sha256: createHash('sha256').update(bytes).digest('hex'),
      classification: 'INTERNAL',
      metadata: { fixture: 'xcap011-m0' },
      retention_policy_id: 'xcap005-test-short',
    },
  });
  expect(collected.statusCode, collected.body).toBe(201);
  const collectedBody = evidenceMutationEnvelopeSchema.parse(collected.json());
  evidenceId = collectedBody.data.evidence_id;
  evidenceVersion = collectedBody.data.version;
  const custody = await admin.query<{ custody_entry_id: string }>(
    `SELECT custody_entry_id FROM cyberdefense.evidence_custody_entries
     WHERE tenant_id=$1 AND evidence_id=$2 ORDER BY sequence LIMIT 1`,
    [tenantA, evidenceId],
  );
  provenanceReference = custody.rows[0]!.custody_entry_id;
});

afterAll(async () => {
  await app.close();
  await admin.end();
  await new Promise<void>((resolve, reject) =>
    jwks.close((error) => (error ? reject(error) : resolve())),
  );
});

const fusionCommand = (idempotencyKey: string, referenceTenant = tenantA) => ({
  schema_version: '1.0.0',
  idempotency_key: idempotencyKey,
  reasoning_purpose: 'EVIDENCE_REFERENCE_VALIDATION',
  requested_reasoning_mode: 'REFERENCE_VALIDATION',
  policy_version: '1.0.0',
  evidence_references: [
    {
      reference_type: 'EVIDENCE',
      canonical_owner: 'ACS-XCAP-005',
      resource_id: evidenceId,
      tenant_id: referenceTenant,
      resource_version: String(evidenceVersion),
      provenance_reference: provenanceReference,
    },
  ],
  observable_references: [],
  entity_references: [],
  correlation_references: [],
  graph_references: [],
});

describe.sequential('ACS-XCAP-011 M0 canonical OIDC/HTTP/PostgreSQL chain', () => {
  it('executes through OIDC, AuthorizationPort, Platform Context, XCAP-005 and bounded receipt', async () => {
    const key = randomUUID();
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantA}/fusion`,
      headers: { authorization: `Bearer ${token}` },
      payload: fusionCommand(key),
    });
    expect(first.statusCode, first.body).toBe(201);
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantA}/fusion`,
      headers: { authorization: `Bearer ${token}` },
      payload: fusionCommand(key),
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const divergentCommand = {
      ...fusionCommand(key),
      reasoning_purpose: 'EVIDENCE_METADATA_SYNTHESIS',
      requested_reasoning_mode: 'DETERMINISTIC_SYNTHESIS',
    };
    const divergent = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantA}/fusion`,
      headers: { authorization: `Bearer ${token}` },
      payload: divergentCommand,
    });
    expect(divergent.statusCode, divergent.body).toBe(409);
    expect(errorCode(divergent)).toBe('IDEMPOTENCY_CONFLICT');

    const durable = await admin.query<{ receipts: number; events: number }>(
      `SELECT
        (SELECT count(*)::integer FROM cyberdefense.fusion_command_receipts
          WHERE tenant_id=$1 AND idempotency_key=$2) AS receipts,
        (SELECT count(*)::integer FROM platform.domain_events
          WHERE tenant_id=$1 AND causation_id=$2) AS events`,
      [tenantA, key],
    );
    expect(durable.rows[0]).toEqual({ receipts: 1, events: 2 });
  });

  it('denies an unauthenticated request generically', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantA}/fusion`,
      payload: fusionCommand(randomUUID()),
    });
    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTHENTICATION_REQUIRED');
  });

  it('fails closed for a cross-tenant evidence reference', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantA}/fusion`,
      headers: { authorization: `Bearer ${token}` },
      payload: fusionCommand(randomUUID(), '00000000-0000-4000-8000-000000000022'),
    });
    expect(response.statusCode).toBe(403);
  });

  it('fails closed for an unknown authenticated identity', async () => {
    const unknownToken = await signToken(`unknown-${randomUUID()}`);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantA}/fusion`,
      headers: { authorization: `Bearer ${unknownToken}` },
      payload: fusionCommand(randomUUID()),
    });
    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe('MEMBERSHIP_INACTIVE');
  });

  it('fails closed for an inactive tenant membership', async () => {
    const tenantB = '00000000-0000-4000-8000-000000000022';
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantB}/fusion`,
      headers: { authorization: `Bearer ${token}` },
      payload: fusionCommand(randomUUID(), tenantB),
    });
    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe('MEMBERSHIP_INACTIVE');
  });

  it('fails closed when the active membership lacks the fusion permission', async () => {
    await admin.query(
      `DELETE FROM platform.membership_permissions
       WHERE tenant_id=$1 AND membership_id=$2 AND permission_key='cyberdefense.fusion.request'`,
      [tenantA, signedOidcMembership],
    );
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/cyberdefense/tenants/${tenantA}/fusion`,
        headers: { authorization: `Bearer ${token}` },
        payload: fusionCommand(randomUUID()),
      });
      expect(response.statusCode).toBe(403);
      expect(errorCode(response)).toBe('AUTHORIZATION_DENIED');
    } finally {
      await admin.query(
        `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
         VALUES($1,$2,'cyberdefense.fusion.request') ON CONFLICT DO NOTHING`,
        [tenantA, signedOidcMembership],
      );
    }
  });

  it('fails closed when XCAP-005 evidence authorization is absent', async () => {
    await admin.query(
      `DELETE FROM platform.membership_permissions
       WHERE tenant_id=$1 AND membership_id=$2 AND permission_key='cyberdefense.evidence.read'`,
      [tenantA, signedOidcMembership],
    );
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/cyberdefense/tenants/${tenantA}/fusion`,
        headers: { authorization: `Bearer ${token}` },
        payload: fusionCommand(randomUUID()),
      });
      expect(response.statusCode).toBe(403);
      expect(errorCode(response)).toBe('REFERENCE_UNAUTHORIZED');
    } finally {
      await admin.query(
        `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
         VALUES($1,$2,'cyberdefense.evidence.read') ON CONFLICT DO NOTHING`,
        [tenantA, signedOidcMembership],
      );
    }
  });
});
