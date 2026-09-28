import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { DevelopmentHeaderIdentityAdapter } from './identity.js';
import { EvidenceReferenceValidator } from './evidence-reference-validator.js';
import { HumanEvidenceReferenceAdapter } from './human-evidence-reference.js';
import { MachineAuthenticationService } from './machine-service-auth.js';
import { RepositoryAuthorizationPort } from './platform-context.js';
import { PostgresEvidenceChainOfCustodyRepository } from './postgres-evidence-chain-of-custody.js';
import { PostgresMachineAuthenticationRepository } from './postgres-machine-service-auth.js';
import { PostgresTenantContextRepository } from './postgres-platform-context.js';

const databaseUrl = process.env.DATABASE_URL;
const disposableDatabase = databaseUrl?.endsWith('/acs_foundation') === true;
const tenantId = '00000000-0000-4000-8000-000000000011';
const otherTenantId = '00000000-0000-4000-8000-000000000022';
const evidenceId = 'e3000000-0000-4000-8000-000000000011';

(disposableDatabase ? describe : describe.skip)('Human → XCAP-005 internal validator', () => {
  it('authenticates a dedicated service, returns only VALID/INVALID, and denies cross-tenant use', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const machineRepository = new PostgresMachineAuthenticationRepository(
      databaseUrl!,
      databaseUrl!,
    );
    const contextRepository = new PostgresTenantContextRepository(databaseUrl!, databaseUrl!);
    const evidenceRepository = new PostgresEvidenceChainOfCustodyRepository(databaseUrl!);
    try {
      const principalId = randomUUID();
      const credentialId = randomUUID();
      const secret = randomBytes(32).toString('base64url');
      const verifier = createHash('sha256').update(secret).digest('hex');
      await client.query(
        `INSERT INTO platform.machine_principals(
            id,tenant_id,principal_type,external_binding,status
          ) VALUES($1,$2,'SERVICE',$3,'ACTIVE')`,
        [principalId, tenantId, `human-principal-evidence-validator-${randomUUID()}`],
      );
      await client.query(
        `INSERT INTO platform.machine_credentials(
            credential_id,tenant_id,machine_principal_id,verifier_sha256,expires_at,created_by
          ) VALUES($1,$2,$3,$4,now()+interval '1 hour',$5)`,
        [credentialId, tenantId, principalId, verifier, '10000000-0000-4000-8000-000000000011'],
      );
      await client.query(
        `INSERT INTO platform.machine_principal_permissions(
            tenant_id,machine_principal_id,permission_key
          ) VALUES($1,$2,'cyberdefense.evidence.reference.validate')`,
        [tenantId, principalId],
      );
      const broader = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM platform.machine_principal_permissions
           WHERE tenant_id=$1 AND machine_principal_id=$2
             AND permission_key IN ('cyberdefense.evidence.read',
               'cyberdefense.evidence.write')`,
        [tenantId, principalId],
      );
      expect(broader.rows[0]?.count).toBe('0');
      const machine = new MachineAuthenticationService(
        new DevelopmentHeaderIdentityAdapter(),
        new RepositoryAuthorizationPort(contextRepository),
        contextRepository,
        machineRepository,
      );
      const validator = new EvidenceReferenceValidator(machine, evidenceRepository);
      const adapter = new HumanEvidenceReferenceAdapter(validator, credentialId, secret);
      const metadata = { requestId: randomUUID(), correlationId: randomUUID() };
      await expect(
        adapter.validate({ tenantId, evidenceReference: evidenceId, ...metadata }),
      ).resolves.toBe('VALID');
      await expect(
        adapter.validate({ tenantId, evidenceReference: randomUUID(), ...metadata }),
      ).resolves.toBe('INVALID');
      await expect(
        adapter.validate({ tenantId: otherTenantId, evidenceReference: evidenceId, ...metadata }),
      ).rejects.toThrow();
      await expect(
        new HumanEvidenceReferenceAdapter(
          validator,
          credentialId,
          randomBytes(32).toString('base64url'),
        ).validate({ tenantId, evidenceReference: evidenceId, ...metadata }),
      ).rejects.toThrow();
    } finally {
      await Promise.all([
        machineRepository.close(),
        contextRepository.close(),
        evidenceRepository.close(),
      ]);
      await client.end();
    }
  });
});
