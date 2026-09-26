import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EvidenceReferenceValidator } from './evidence-reference-validator.js';
import { DevelopmentHeaderIdentityAdapter } from './identity.js';
import { MachineAuthenticationService } from './machine-service-auth.js';
import { RepositoryAuthorizationPort } from './platform-context.js';
import { PostgresEvidenceChainOfCustodyRepository } from './postgres-evidence-chain-of-custody.js';
import { PostgresMachineAuthenticationRepository } from './postgres-machine-service-auth.js';
import { PostgresTenantContextRepository } from './postgres-platform-context.js';

const { Client } = pg;
const required = {
  admin: process.env.DATABASE_URL,
  resolver: process.env.ACS_CONTEXT_RESOLVER_DATABASE_URL,
  tenant: process.env.ACS_TENANT_DATABASE_URL,
  authentication: process.env.ACS_MACHINE_AUTH_DATABASE_URL,
  issuer: process.env.ACS_MACHINE_CONTEXT_ISSUER_DATABASE_URL,
};
for (const [name, value] of Object.entries(required))
  if (!value) throw new Error(`${name} disposable XCAP-005 reference database URL is required.`);

const tenantA = '00000000-0000-4000-8000-000000000011';
const tenantB = '00000000-0000-4000-8000-000000000022';
const actorUser = '10000000-0000-4000-8000-000000000011';
const membership = '30000000-0000-4000-8000-000000000011';
const header = 'Bearer dev:oidc|alice';
const metadata = () => ({ requestId: randomUUID(), correlationId: randomUUID() });

function evidenceRuntimeUrl() {
  const url = new URL(required.admin as string);
  url.username = 'acs_xcap005_evidence_login_test';
  url.password = 'acs_phase1_test_only';
  return url.toString();
}

describe.sequential('XCAP-005 internal reference validation on real PostgreSQL 17', () => {
  const admin = new Client({ connectionString: required.admin });
  const contexts = new PostgresTenantContextRepository(
    required.resolver as string,
    required.tenant as string,
  );
  const machineRepository = new PostgresMachineAuthenticationRepository(
    required.authentication as string,
    required.issuer as string,
  );
  const machine = new MachineAuthenticationService(
    new DevelopmentHeaderIdentityAdapter(),
    new RepositoryAuthorizationPort(contexts),
    contexts,
    machineRepository,
  );
  const evidence = new PostgresEvidenceChainOfCustodyRepository(evidenceRuntimeUrl());
  const validator = new EvidenceReferenceValidator(machine, evidence);
  let principalId: string;
  let credentialId: string;
  let credential: string;
  let evidenceId: string;
  let foreignEvidenceId: string;

  const request = (reference: string, tenantId = tenantA) => ({
    credentialId,
    credential,
    tenantId,
    evidenceReference: reference,
    ...metadata(),
  });

  async function freshCredential() {
    const created = await machine.provision(
      header,
      tenantA,
      'SERVICE',
      `xcap005-reference:${randomUUID()}`,
      metadata(),
    );
    await machine.setPermission(
      header,
      tenantA,
      created.principalId,
      'cyberdefense.evidence.reference.validate',
      true,
      metadata(),
    );
    return {
      ...request(evidenceId),
      credentialId: created.credential.credentialId,
      credential: created.credential.credential,
    };
  }

  async function insertEvidence(tenantId: string, sourcePrincipalId: string) {
    const sourceId = randomUUID();
    const blobId = randomUUID();
    const recordId = randomUUID();
    const bytes = Buffer.from('bounded test evidence');
    await admin.query(
      `INSERT INTO cyberdefense.evidence_sources
       (source_id,tenant_id,machine_principal_id,source_type,connector_type,external_binding,
        credential_reference,trust_classification,ingestion_policy_version,created_by)
       VALUES($1,$2,$3,'TEST','DIRECT',$4,'test-only','TRUSTED','1.0.0',$5)`,
      [sourceId, tenantId, sourcePrincipalId, `reference:${sourceId}`, actorUser],
    );
    await admin.query(
      `INSERT INTO cyberdefense.evidence_blob_references
       (blob_reference_id,tenant_id,raw_bytes,media_type,size_bytes,content_sha256)
       VALUES($1,$2,$3,'application/octet-stream',$4,$5)`,
      [blobId, tenantId, bytes, bytes.length, createHash('sha256').update(bytes).digest('hex')],
    );
    await admin.query(
      `INSERT INTO cyberdefense.evidence_records
       (evidence_id,tenant_id,evidence_source_id,blob_reference_id,source_event_id,
        canonicalization_version,canonical_metadata,metadata_sha256,ingestion_request_hash,
        classification_at_ingest,retention_policy_id,observed_at,collected_by,request_id,correlation_id)
       VALUES($1,$2,$3,$4,$5,'xcap005-evidence-metadata-v1','{}'::jsonb,$6,$7,
              'INTERNAL','xcap005-test-short',clock_timestamp(),$8,$9,$10)`,
      [
        recordId,
        tenantId,
        sourceId,
        blobId,
        `reference:${recordId}`,
        createHash('sha256').update('{}').digest('hex'),
        createHash('sha256').update(recordId).digest('hex'),
        actorUser,
        randomUUID(),
        randomUUID(),
      ],
    );
    return recordId;
  }

  beforeAll(async () => {
    await admin.connect();
    await admin.query(
      `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
       VALUES ($1,$2,'platform.machine_principals.provision'),
              ($1,$2,'platform.machine_credentials.manage'),
              ($1,$2,'platform.machine_permissions.manage') ON CONFLICT DO NOTHING`,
      [tenantA, membership],
    );
    const created = await machine.provision(
      header,
      tenantA,
      'SERVICE',
      `xcap005-reference:${randomUUID()}`,
      metadata(),
    );
    principalId = created.principalId;
    credentialId = created.credential.credentialId;
    credential = created.credential.credential;
    await machine.setPermission(
      header,
      tenantA,
      principalId,
      'cyberdefense.evidence.reference.validate',
      true,
      metadata(),
    );
    evidenceId = await insertEvidence(tenantA, principalId);
    const other = await admin.query<{ id: string }>(
      `INSERT INTO platform.machine_principals(tenant_id,principal_type,external_binding)
       VALUES($1,'SERVICE',$2) RETURNING id`,
      [tenantB, `xcap005-reference-foreign:${randomUUID()}`],
    );
    foreignEvidenceId = await insertEvidence(tenantB, other.rows[0]!.id);
  });

  afterAll(async () => {
    await Promise.all([evidence.close(), machineRepository.close(), contexts.close(), admin.end()]);
  });

  it('returns only VALID and leaves evidence/custody unchanged across repeat calls', async () => {
    const before = await admin.query<{ evidence: string; custody: string; audit: string }>(
      `SELECT (SELECT count(*) FROM cyberdefense.evidence_records WHERE evidence_id=$1) evidence,
              (SELECT count(*) FROM cyberdefense.evidence_custody_entries WHERE evidence_id=$1) custody,
              (SELECT count(*) FROM platform.audit_logs
               WHERE action='cyberdefense.evidence.reference.validate' AND machine_principal_id=$2) audit`,
      [evidenceId, principalId],
    );
    expect(await validator.validate(request(evidenceId))).toBe('VALID');
    expect(await validator.validate(request(evidenceId))).toBe('VALID');
    const after = await admin.query<{ evidence: string; custody: string; audit: string }>(
      `SELECT (SELECT count(*) FROM cyberdefense.evidence_records WHERE evidence_id=$1) evidence,
              (SELECT count(*) FROM cyberdefense.evidence_custody_entries WHERE evidence_id=$1) custody,
              (SELECT count(*) FROM platform.audit_logs
               WHERE action='cyberdefense.evidence.reference.validate' AND machine_principal_id=$2) audit`,
      [evidenceId, principalId],
    );
    expect(after.rows[0]?.evidence).toBe(before.rows[0]?.evidence);
    expect(after.rows[0]?.custody).toBe(before.rows[0]?.custody);
    expect(Number(after.rows[0]?.audit)).toBe(Number(before.rows[0]?.audit) + 2);
  });

  it('collapses foreign-tenant, nonexistent and malformed references to INVALID', async () => {
    expect(await validator.validate(request(foreignEvidenceId))).toBe('INVALID');
    expect(await validator.validate(request(randomUUID()))).toBe('INVALID');
    expect(await validator.validate(request('not-a-uuid'))).toBe('INVALID');
  });

  it('does not grant direct evidence-record SELECT under the validation permission', async () => {
    const identity = await machine.authenticate(credentialId, credential);
    const token = await machine.issueTenantContext(
      identity,
      tenantA,
      'cyberdefense.evidence.reference.validate',
    );
    const direct = new Client({ connectionString: evidenceRuntimeUrl() });
    await direct.connect();
    try {
      await direct.query('BEGIN');
      await direct.query('SELECT * FROM platform.activate_tenant_context($1,$2)', [
        token,
        'cyberdefense.evidence.reference.validate',
      ]);
      const rows = await direct.query('SELECT evidence_id FROM cyberdefense.evidence_records');
      expect(rows.rows).toEqual([]);
    } finally {
      await direct.query('ROLLBACK');
      await direct.end();
    }
  });

  it('denies wrong tenant, missing permission, revoked and expired credentials', async () => {
    await expect(validator.validate(request(evidenceId, tenantB))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await machine.setPermission(
      header,
      tenantA,
      principalId,
      'cyberdefense.evidence.reference.validate',
      false,
      metadata(),
    );
    await expect(validator.validate(request(evidenceId))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await machine.setPermission(
      header,
      tenantA,
      principalId,
      'cyberdefense.evidence.reference.validate',
      true,
      metadata(),
    );
    await admin.query(
      "UPDATE platform.machine_credentials SET created_at=clock_timestamp()-interval '2 days', expires_at=clock_timestamp()-interval '1 second' WHERE credential_id=$1",
      [credentialId],
    );
    await expect(validator.validate(request(evidenceId))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await admin.query(
      "UPDATE platform.machine_credentials SET created_at=clock_timestamp(), expires_at=clock_timestamp()+interval '1 day' WHERE credential_id=$1",
      [credentialId],
    );
    await machine.revoke(header, tenantA, principalId, credentialId, metadata());
    await expect(validator.validate(request(evidenceId))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('denies a disabled canonical machine principal', async () => {
    const input = await freshCredential();
    const identity = await machine.authenticate(input.credentialId, input.credential);
    await machine.disable(header, tenantA, identity.principalId, metadata());
    await expect(validator.validate(input)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('fails closed when the real XCAP-005 repository is unavailable', async () => {
    const input = await freshCredential();
    const unavailable = new URL(evidenceRuntimeUrl());
    unavailable.port = '1';
    const broken = new PostgresEvidenceChainOfCustodyRepository(unavailable.toString());
    try {
      const failure = new EvidenceReferenceValidator(machine, broken);
      await expect(failure.validate(input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    } finally {
      await broken.close();
    }
  });

  it('fails closed on real machine-authentication and context-issuer outages', async () => {
    const input = await freshCredential();
    const authenticationUrl = new URL(required.authentication as string);
    authenticationUrl.port = '1';
    const authDown = new PostgresMachineAuthenticationRepository(
      authenticationUrl.toString(),
      required.issuer as string,
    );
    const issuerUrl = new URL(required.issuer as string);
    issuerUrl.port = '1';
    const issuerDown = new PostgresMachineAuthenticationRepository(
      required.authentication as string,
      issuerUrl.toString(),
    );
    try {
      const unauthenticated = new EvidenceReferenceValidator(
        new MachineAuthenticationService(
          new DevelopmentHeaderIdentityAdapter(),
          new RepositoryAuthorizationPort(contexts),
          contexts,
          authDown,
        ),
        evidence,
      );
      await expect(unauthenticated.validate(input)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
      const unavailable = new EvidenceReferenceValidator(
        new MachineAuthenticationService(
          new DevelopmentHeaderIdentityAdapter(),
          new RepositoryAuthorizationPort(contexts),
          contexts,
          issuerDown,
        ),
        evidence,
      );
      await expect(unavailable.validate(input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    } finally {
      await Promise.all([authDown.close(), issuerDown.close()]);
    }
  });

  it('fails closed and rolls back the read transaction when canonical audit persistence fails', async () => {
    const input = await freshCredential();
    const before = await admin.query<{ count: string }>(
      `SELECT count(*) FROM platform.audit_logs
       WHERE action='cyberdefense.evidence.reference.validate'`,
    );
    await admin.query(`CREATE FUNCTION platform.test_fail_evidence_reference_audit()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action='cyberdefense.evidence.reference.validate' THEN
          RAISE EXCEPTION 'injected audit failure';
        END IF;
        RETURN NEW;
      END $$`);
    await admin.query(`CREATE TRIGGER test_fail_evidence_reference_audit
      BEFORE INSERT ON platform.audit_logs FOR EACH ROW
      EXECUTE FUNCTION platform.test_fail_evidence_reference_audit()`);
    try {
      await expect(validator.validate(input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      const after = await admin.query<{ count: string }>(
        `SELECT count(*) FROM platform.audit_logs
         WHERE action='cyberdefense.evidence.reference.validate'`,
      );
      expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    } finally {
      await admin.query('DROP TRIGGER test_fail_evidence_reference_audit ON platform.audit_logs');
      await admin.query('DROP FUNCTION platform.test_fail_evidence_reference_audit()');
    }
  });
});
