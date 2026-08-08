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

await client.connect();
try {
  await client.query(await readFile(rollbackPath, 'utf8'));
  await client.query(await readFile(migrationPath, 'utf8'));
  const existingRole = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'acs_phase0_tenant_test'",
  );
  if (existingRole.rowCount === 1) {
    await client.query('DROP OWNED BY acs_phase0_tenant_test');
    await client.query('DROP ROLE acs_phase0_tenant_test');
  }
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
  process.stdout.write(
    `${JSON.stringify({ component: 'FOUNDATION', migration: 'VERIFIED', rls: 'VERIFIED', tenant_isolation: 'VERIFIED' })}\n`,
  );
} finally {
  const existingRole = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'acs_phase0_tenant_test'",
  );
  if (existingRole.rowCount === 1) {
    await client.query('DROP OWNED BY acs_phase0_tenant_test');
    await client.query('DROP ROLE acs_phase0_tenant_test');
  }
  await client.end();
}
