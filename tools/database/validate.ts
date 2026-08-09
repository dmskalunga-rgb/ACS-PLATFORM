import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl === '') {
  throw new Error('DATABASE_URL is required for the Phase 0 database validation.');
}
if (process.env.ACS_ENV === 'production') {
  throw new Error('Phase 0 database validation is prohibited in production.');
}
const parsedDatabaseUrl = new URL(databaseUrl);
if (parsedDatabaseUrl.pathname !== '/acs_foundation') {
  throw new Error('Phase 0 database validation requires the disposable acs_foundation database.');
}

const client = new Client({ connectionString: databaseUrl });
const migrationPath = resolve('database/migrations/20260808000000_phase0_tenancy_foundation.sql');
const testPath = resolve('database/tests/rls/tenant_isolation.sql');
const rollbackPath = resolve('database/rollbacks/20260808000000_phase0_tenancy_foundation.sql');
const phase1MigrationPath = resolve(
  'database/migrations/20260809000000_phase1_platform_multitenancy.sql',
);
const phase1TestPath = resolve('database/tests/rls/phase1_platform_isolation.sql');
const phase1RollbackPath = resolve(
  'database/rollbacks/20260809000000_phase1_platform_multitenancy.sql',
);

const testRoles = [
  'acs_phase1_tenant_app_test',
  'acs_phase1_context_resolver_test',
  'acs_phase0_tenant_test',
];

async function dropTestRoles(): Promise<void> {
  for (const role of testRoles) {
    const existingRole = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (existingRole.rowCount === 1) {
      await client.query(`DROP OWNED BY ${role}`);
      await client.query(`DROP ROLE ${role}`);
    }
  }
}

await client.connect();
try {
  await dropTestRoles();
  await client.query(await readFile(phase1RollbackPath, 'utf8'));
  await client.query(await readFile(rollbackPath, 'utf8'));
  await client.query(await readFile(migrationPath, 'utf8'));
  await client.query(await readFile(phase1MigrationPath, 'utf8'));
  await client.query(
    'CREATE ROLE acs_phase0_tenant_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE',
  );
  await client.query('GRANT USAGE ON SCHEMA foundation TO acs_phase0_tenant_test');
  await client.query(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON foundation.tenant_isolation_probe TO acs_phase0_tenant_test',
  );
  await client.query(
    'GRANT EXECUTE ON FUNCTION foundation.current_tenant_id() TO acs_phase0_tenant_test',
  );
  await client.query(await readFile(testPath, 'utf8'));

  await client.query(
    'CREATE ROLE acs_phase1_context_resolver_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
  );
  await client.query(
    'CREATE ROLE acs_phase1_tenant_app_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
  );
  await client.query('GRANT USAGE ON SCHEMA platform TO acs_phase1_context_resolver_test');
  await client.query(
    'GRANT EXECUTE ON FUNCTION platform.resolve_tenant_context(text, uuid) TO acs_phase1_context_resolver_test',
  );
  await client.query('GRANT USAGE ON SCHEMA platform TO acs_phase1_tenant_app_test');
  await client.query(
    'GRANT SELECT ON platform.tenants, platform.memberships, platform.audit_logs TO acs_phase1_tenant_app_test',
  );
  await client.query('GRANT INSERT ON platform.audit_logs TO acs_phase1_tenant_app_test');
  await client.query(
    'GRANT EXECUTE ON FUNCTION platform.current_tenant_id(), platform.current_user_id() TO acs_phase1_tenant_app_test',
  );

  await client.query(`
    INSERT INTO platform.tenants (id, slug, display_name, status) VALUES
      ('00000000-0000-4000-8000-000000000011', 'tenant-a', 'Tenant A', 'ACTIVE'),
      ('00000000-0000-4000-8000-000000000022', 'tenant-b', 'Tenant B', 'ACTIVE'),
      ('00000000-0000-4000-8000-000000000033', 'tenant-c', 'Tenant C', 'INACTIVE');
    INSERT INTO platform.users (id, external_subject, status) VALUES
      ('10000000-0000-4000-8000-000000000011', 'oidc|alice', 'ACTIVE'),
      ('20000000-0000-4000-8000-000000000022', 'oidc|bob', 'ACTIVE');
    INSERT INTO platform.memberships (id, tenant_id, user_id, status) VALUES
      ('30000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'ACTIVE'),
      ('30000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000011', 'INACTIVE'),
      ('30000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000033', '20000000-0000-4000-8000-000000000022', 'ACTIVE');
  `);
  await client.query(await readFile(phase1TestPath, 'utf8'));
  process.stdout.write(
    `${JSON.stringify({ component: 'FOUNDATION_AND_PLATFORM', migration: 'VERIFIED', rls: 'VERIFIED', tenant_isolation: 'VERIFIED', identity_spoofing: 'VERIFIED', audit_append_only: 'VERIFIED' })}\n`,
  );
} finally {
  await dropTestRoles();
  await client.end();
}
