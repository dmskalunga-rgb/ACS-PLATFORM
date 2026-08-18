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
const phase1RolesPath = resolve('database/roles/phase1_platform_roles.sql');
const phase1SeedPath = resolve('database/tests/fixtures/phase1_seed.sql');
const tenantAdminMigrationPath = resolve(
  'database/migrations/20260814000000_phase1_tenant_administration.sql',
);
const tenantAdminRollbackPath = resolve(
  'database/rollbacks/20260814000000_phase1_tenant_administration.sql',
);
const tenantAdminTestPath = resolve('database/tests/rls/tenant_administration_isolation.sql');
const eventRolesPath = resolve('database/roles/event_foundation_roles.sql');
const eventMigrationPath = resolve(
  'database/migrations/20260818000000_event_delivery_foundation.sql',
);
const eventRollbackPath = resolve(
  'database/rollbacks/20260818000000_event_delivery_foundation.sql',
);
const eventTestPath = resolve('database/tests/event_foundation_lifecycle.sql');

const testRoles = [
  'acs_phase1_auditor_login_test',
  'acs_phase1_tenant_login_test',
  'acs_phase1_issuer_login_test',
  'acs_phase1_audit_integrity_test',
  'acs_phase1_admin_login_test',
  'acs_phase1_tenant_admin',
  'acs_phase1_security_auditor',
  'acs_phase1_tenant_app',
  'acs_phase1_context_issuer',
  'acs_event_publisher_login_test',
  'acs_event_consumer_login_test',
  'acs_event_operator_login_test',
  'acs_event_retention_login_test',
  'acs_event_publisher',
  'acs_event_consumer',
  'acs_event_operator',
  'acs_event_retention',
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
  const eventFoundationExists = await client.query(
    "SELECT to_regclass('platform.event_deliveries') AS relation",
  );
  if (eventFoundationExists.rows[0]?.relation !== null) {
    await client.query(await readFile(eventRollbackPath, 'utf8'));
  }
  const tenantAdminExists = await client.query("SELECT to_regclass('platform.roles') AS relation");
  if (tenantAdminExists.rows[0]?.relation !== null) {
    await client.query(await readFile(tenantAdminRollbackPath, 'utf8'));
  }
  await client.query(await readFile(phase1RollbackPath, 'utf8'));
  await client.query(await readFile(rollbackPath, 'utf8'));
  await client.query(await readFile(migrationPath, 'utf8'));
  await client.query(await readFile(phase1RolesPath, 'utf8'));
  await client.query(await readFile(phase1MigrationPath, 'utf8'));
  await client.query(await readFile(tenantAdminMigrationPath, 'utf8'));
  await client.query(await readFile(eventRolesPath, 'utf8'));
  await client.query(await readFile(eventMigrationPath, 'utf8'));
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
    'CREATE ROLE acs_phase1_audit_integrity_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS',
  );
  await client.query('GRANT USAGE ON SCHEMA platform TO acs_phase1_audit_integrity_test');
  await client.query(
    'GRANT SELECT, UPDATE, DELETE ON platform.audit_logs, platform.security_audit_logs TO acs_phase1_audit_integrity_test',
  );
  await client.query(await readFile(phase1SeedPath, 'utf8'));
  await client.query(await readFile(phase1TestPath, 'utf8'));
  await client.query(await readFile(tenantAdminTestPath, 'utf8'));
  await client.query(await readFile(eventTestPath, 'utf8'));
  await client.query(await readFile(eventRollbackPath, 'utf8'));
  await client.query(await readFile(eventMigrationPath, 'utf8'));
  await client.query(await readFile(eventTestPath, 'utf8'));
  const durableDenials = await client.query(
    "SELECT count(*)::integer AS count FROM platform.security_audit_logs WHERE reason_code = 'TENANT_CONTEXT_DENIED'",
  );
  if (durableDenials.rows[0]?.count !== 1) {
    throw new Error('Durable denial audit validation failed.');
  }
  await client.query(`
    CREATE ROLE acs_phase1_issuer_login_test LOGIN INHERIT PASSWORD 'acs_phase1_test_only';
    CREATE ROLE acs_phase1_tenant_login_test LOGIN INHERIT PASSWORD 'acs_phase1_test_only';
    CREATE ROLE acs_phase1_auditor_login_test LOGIN INHERIT PASSWORD 'acs_phase1_test_only';
    CREATE ROLE acs_phase1_admin_login_test LOGIN INHERIT PASSWORD 'acs_phase1_test_only';
    GRANT acs_phase1_context_issuer TO acs_phase1_issuer_login_test;
    GRANT acs_phase1_tenant_app TO acs_phase1_tenant_login_test;
    GRANT acs_phase1_security_auditor TO acs_phase1_auditor_login_test;
    GRANT acs_phase1_tenant_admin TO acs_phase1_admin_login_test;
    CREATE ROLE acs_event_publisher_login_test LOGIN INHERIT PASSWORD 'acs_phase1_test_only';
    CREATE ROLE acs_event_consumer_login_test LOGIN INHERIT PASSWORD 'acs_phase1_test_only';
    CREATE ROLE acs_event_operator_login_test LOGIN INHERIT PASSWORD 'acs_phase1_test_only';
    CREATE ROLE acs_event_retention_login_test LOGIN INHERIT PASSWORD 'acs_phase1_test_only';
    GRANT acs_event_publisher TO acs_event_publisher_login_test;
    GRANT acs_event_consumer TO acs_event_consumer_login_test;
    GRANT acs_event_operator TO acs_event_operator_login_test;
    GRANT acs_event_retention TO acs_event_retention_login_test;
  `);
  process.stdout.write(
    `${JSON.stringify({ component: 'FOUNDATION_AND_PLATFORM', migration: 'VERIFIED', trusted_context: 'VERIFIED', rls: 'VERIFIED', tenant_isolation: 'VERIFIED', context_spoofing: 'VERIFIED', permission_denial: 'VERIFIED', durable_denial_audit: 'VERIFIED', audit_privileges: 'VERIFIED', audit_append_only_trigger: 'VERIFIED', event_outbox_lifecycle: 'VERIFIED', event_concurrency_claim: 'VERIFIED', event_retry_dlq_replay: 'VERIFIED', consumer_idempotency: 'VERIFIED', event_retention: 'VERIFIED' })}\n`,
  );
} finally {
  await client.end();
}
