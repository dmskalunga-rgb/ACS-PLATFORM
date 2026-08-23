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
const customerRolesPath = resolve('database/roles/phase2_customer_registry_roles.sql');
const customerMigrationPath = resolve(
  'database/migrations/20260818010000_phase2_customer_registry.sql',
);
const customerRollbackPath = resolve(
  'database/rollbacks/20260818010000_phase2_customer_registry.sql',
);
const customerTestPath = resolve('database/tests/rls/customer_registry_isolation.sql');
const customerSeedPath = resolve('database/tests/fixtures/customer_registry_seed.sql');
const leadRolesPath = resolve('database/roles/phase2_lead_registry_roles.sql');
const leadMigrationPath = resolve('database/migrations/20260821000000_phase2_lead_registry.sql');
const leadRollbackPath = resolve('database/rollbacks/20260821000000_phase2_lead_registry.sql');
const leadTestPath = resolve('database/tests/rls/lead_registry_isolation.sql');
const leadSeedPath = resolve('database/tests/fixtures/lead_registry_seed.sql');
const planRolesPath = resolve('database/roles/phase2_plan_catalog_roles.sql');
const planMigrationPath = resolve('database/migrations/20260822000000_phase2_plan_catalog.sql');
const planRollbackPath = resolve('database/rollbacks/20260822000000_phase2_plan_catalog.sql');
const planTestPath = resolve('database/tests/rls/plan_catalog_isolation.sql');
const planSeedPath = resolve('database/tests/fixtures/plan_catalog_seed.sql');
const partnerRolesPath = resolve('database/roles/phase2_partner_registry_roles.sql');
const partnerMigrationPath = resolve(
  'database/migrations/20260823000000_phase2_partner_registry.sql',
);
const partnerRollbackPath = resolve(
  'database/rollbacks/20260823000000_phase2_partner_registry.sql',
);
const partnerTestPath = resolve('database/tests/rls/partner_registry_isolation.sql');
const partnerSeedPath = resolve('database/tests/fixtures/partner_registry_seed.sql');
const opportunityRolesPath = resolve('database/roles/phase2_opportunity_registry_roles.sql');
const opportunityMigrationPath = resolve(
  'database/migrations/20260824000000_phase2_opportunity_registry.sql',
);
const opportunityRollbackPath = resolve(
  'database/rollbacks/20260824000000_phase2_opportunity_registry.sql',
);
const opportunityTestPath = resolve('database/tests/rls/opportunity_registry_isolation.sql');
const opportunitySeedPath = resolve('database/tests/fixtures/opportunity_registry_seed.sql');
const proposalRolesPath = resolve('database/roles/phase2_proposal_roles.sql');
const proposalMigrationPath = resolve(
  'database/migrations/20260825000000_phase2_proposal_registry.sql',
);
const proposalRollbackPath = resolve(
  'database/rollbacks/20260825000000_phase2_proposal_registry.sql',
);
const proposalTestPath = resolve('database/tests/rls/proposal_registry_isolation.sql');
const proposalSeedPath = resolve('database/tests/fixtures/proposal_registry_seed.sql');
const contractRolesPath = resolve('database/roles/phase2_contract_roles.sql');
const contractMigrationPath = resolve(
  'database/migrations/20260826000000_phase2_contract_registry.sql',
);
const contractRollbackPath = resolve(
  'database/rollbacks/20260826000000_phase2_contract_registry.sql',
);
const contractTestPath = resolve('database/tests/rls/contract_registry_isolation.sql');
const contractSeedPath = resolve('database/tests/fixtures/contract_registry_seed.sql');

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
  'acs_phase2_customer_login_test',
  'acs_phase2_lead_login_test',
  'acs_phase2_plan_login_test',
  'acs_phase2_partner_login_test',
  'acs_phase2_opportunity_login_test',
  'acs_phase2_proposal_login_test',
  'acs_phase2_contract_login_test',
  'acs_phase2_customer_registry',
  'acs_phase2_lead_registry',
  'acs_phase2_plan_catalog',
  'acs_phase2_partner_registry',
  'acs_phase2_opportunity_registry',
  'acs_phase2_proposal_registry',
  'acs_phase2_contract_registry',
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
  const customerRegistryExists = await client.query(
    "SELECT to_regclass('commercial.customers') AS relation",
  );
  if (customerRegistryExists.rows[0]?.relation !== null) {
    await client.query(await readFile(contractRollbackPath, 'utf8'));
    await client.query(await readFile(proposalRollbackPath, 'utf8'));
    await client.query(await readFile(opportunityRollbackPath, 'utf8'));
    await client.query(await readFile(planRollbackPath, 'utf8'));
    await client.query(await readFile(leadRollbackPath, 'utf8'));
    await client.query(await readFile(customerRollbackPath, 'utf8'));
  }
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
  await client.query(await readFile(customerRolesPath, 'utf8'));
  await client.query(await readFile(customerMigrationPath, 'utf8'));
  await client.query(await readFile(leadRolesPath, 'utf8'));
  await client.query(await readFile(leadMigrationPath, 'utf8'));
  await client.query(await readFile(planRolesPath, 'utf8'));
  await client.query(await readFile(planMigrationPath, 'utf8'));
  await client.query(await readFile(partnerRolesPath, 'utf8'));
  await client.query(await readFile(partnerMigrationPath, 'utf8'));
  await client.query(await readFile(opportunityRolesPath, 'utf8'));
  await client.query(await readFile(opportunityMigrationPath, 'utf8'));
  await client.query(await readFile(proposalRolesPath, 'utf8'));
  await client.query(await readFile(proposalMigrationPath, 'utf8'));
  await client.query(await readFile(contractRolesPath, 'utf8'));
  await client.query(await readFile(contractMigrationPath, 'utf8'));
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
  await client.query(await readFile(customerSeedPath, 'utf8'));
  await client.query(await readFile(leadSeedPath, 'utf8'));
  await client.query(await readFile(planSeedPath, 'utf8'));
  await client.query(await readFile(partnerSeedPath, 'utf8'));
  await client.query(await readFile(opportunitySeedPath, 'utf8'));
  await client.query(await readFile(proposalSeedPath, 'utf8'));
  await client.query(await readFile(phase1TestPath, 'utf8'));
  await client.query(await readFile(tenantAdminTestPath, 'utf8'));
  await client.query(await readFile(eventTestPath, 'utf8'));
  await client.query(await readFile(customerTestPath, 'utf8'));
  await client.query(await readFile(leadTestPath, 'utf8'));
  await client.query(await readFile(planTestPath, 'utf8'));
  await client.query(await readFile(partnerTestPath, 'utf8'));
  await client.query(await readFile(opportunityTestPath, 'utf8'));
  await client.query(await readFile(proposalTestPath, 'utf8'));
  await client.query(await readFile(contractSeedPath, 'utf8'));
  await client.query(await readFile(contractTestPath, 'utf8'));
  await client.query(await readFile(contractRollbackPath, 'utf8'));
  await client.query(await readFile(contractMigrationPath, 'utf8'));
  await client.query(await readFile(contractSeedPath, 'utf8'));
  await client.query(await readFile(contractTestPath, 'utf8'));
  await client.query(await readFile(contractRollbackPath, 'utf8'));
  await client.query(await readFile(proposalRollbackPath, 'utf8'));
  await client.query(await readFile(proposalMigrationPath, 'utf8'));
  await client.query(await readFile(proposalSeedPath, 'utf8'));
  await client.query(await readFile(proposalTestPath, 'utf8'));
  await client.query(await readFile(contractMigrationPath, 'utf8'));
  await client.query(await readFile(contractSeedPath, 'utf8'));
  await client.query(await readFile(contractTestPath, 'utf8'));
  await client.query(await readFile(contractRollbackPath, 'utf8'));
  await client.query(await readFile(proposalRollbackPath, 'utf8'));
  await client.query(await readFile(opportunityRollbackPath, 'utf8'));
  await client.query(await readFile(opportunityMigrationPath, 'utf8'));
  await client.query(await readFile(opportunitySeedPath, 'utf8'));
  await client.query(await readFile(opportunityTestPath, 'utf8'));
  await client.query(await readFile(proposalMigrationPath, 'utf8'));
  await client.query(await readFile(proposalSeedPath, 'utf8'));
  await client.query(await readFile(proposalTestPath, 'utf8'));
  await client.query(await readFile(proposalRollbackPath, 'utf8'));
  await client.query(await readFile(opportunityRollbackPath, 'utf8'));
  await client.query(await readFile(partnerRollbackPath, 'utf8'));
  await client.query(await readFile(partnerMigrationPath, 'utf8'));
  await client.query(await readFile(partnerSeedPath, 'utf8'));
  await client.query(await readFile(partnerTestPath, 'utf8'));
  await client.query(await readFile(opportunityMigrationPath, 'utf8'));
  await client.query(await readFile(opportunitySeedPath, 'utf8'));
  await client.query(await readFile(opportunityTestPath, 'utf8'));
  await client.query(await readFile(opportunityRollbackPath, 'utf8'));
  await client.query(await readFile(planRollbackPath, 'utf8'));
  await client.query(await readFile(planMigrationPath, 'utf8'));
  await client.query(await readFile(planSeedPath, 'utf8'));
  await client.query(await readFile(planTestPath, 'utf8'));
  await client.query(await readFile(partnerRollbackPath, 'utf8'));
  await client.query(await readFile(partnerMigrationPath, 'utf8'));
  await client.query(await readFile(partnerSeedPath, 'utf8'));
  await client.query(await readFile(partnerTestPath, 'utf8'));
  await client.query(await readFile(leadRollbackPath, 'utf8'));
  await client.query(await readFile(leadMigrationPath, 'utf8'));
  await client.query(await readFile(leadSeedPath, 'utf8'));
  await client.query(await readFile(leadTestPath, 'utf8'));
  await client.query(await readFile(customerRollbackPath, 'utf8'));
  await client.query(await readFile(customerMigrationPath, 'utf8'));
  await client.query(await readFile(customerSeedPath, 'utf8'));
  await client.query(await readFile(customerTestPath, 'utf8'));
  // The Customer rollback drops the shared commercial schema; restore the
  // independently validated Lead artifact set for API E2E consumers.
  await client.query(await readFile(leadRollbackPath, 'utf8'));
  await client.query(await readFile(leadRolesPath, 'utf8'));
  await client.query(await readFile(leadMigrationPath, 'utf8'));
  await client.query(await readFile(leadSeedPath, 'utf8'));
  await client.query(await readFile(leadTestPath, 'utf8'));
  await client.query(await readFile(opportunityRollbackPath, 'utf8'));
  await client.query(await readFile(planRollbackPath, 'utf8'));
  await client.query(await readFile(planMigrationPath, 'utf8'));
  await client.query(await readFile(planSeedPath, 'utf8'));
  await client.query(await readFile(planTestPath, 'utf8'));
  await client.query(await readFile(eventRollbackPath, 'utf8'));
  await client.query(await readFile(eventMigrationPath, 'utf8'));
  await client.query(await readFile(eventTestPath, 'utf8'));
  // Customer rollback drops the shared commercial schema. Restore Partner only
  // after all shared Event Foundation lifecycle checks have completed.
  await client.query(await readFile(partnerRollbackPath, 'utf8'));
  await client.query(await readFile(partnerMigrationPath, 'utf8'));
  await client.query(await readFile(partnerSeedPath, 'utf8'));
  await client.query(await readFile(partnerTestPath, 'utf8'));
  // Opportunity depends on the restored Customer, Lead, Plan and Partner
  // artifacts. Leave the validated least-privilege runtime path available to
  // the canonical API E2E suites after their dependency-safe rollback checks.
  await client.query(await readFile(opportunityMigrationPath, 'utf8'));
  await client.query(await readFile(opportunitySeedPath, 'utf8'));
  await client.query(await readFile(opportunityTestPath, 'utf8'));
  // Proposal depends on all restored commercial registries. Leave its validated
  // least-privilege runtime path available to the dedicated API E2E suite.
  await client.query(await readFile(proposalMigrationPath, 'utf8'));
  await client.query(await readFile(proposalSeedPath, 'utf8'));
  await client.query(await readFile(proposalTestPath, 'utf8'));
  // Contract depends on the accepted Proposal snapshot. Leave its validated
  // least-privilege runtime path available to the dedicated API E2E suite.
  await client.query(await readFile(contractMigrationPath, 'utf8'));
  await client.query(await readFile(contractSeedPath, 'utf8'));
  await client.query(await readFile(contractTestPath, 'utf8'));
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
    CREATE ROLE acs_phase2_customer_login_test LOGIN INHERIT PASSWORD 'acs_phase2_test_only';
    GRANT acs_phase2_customer_registry TO acs_phase2_customer_login_test;
    CREATE ROLE acs_phase2_lead_login_test LOGIN INHERIT PASSWORD 'acs_phase2_test_only';
    GRANT acs_phase2_lead_registry TO acs_phase2_lead_login_test;
    CREATE ROLE acs_phase2_plan_login_test LOGIN INHERIT PASSWORD 'acs_phase2_test_only';
    GRANT acs_phase2_plan_catalog TO acs_phase2_plan_login_test;
    CREATE ROLE acs_phase2_partner_login_test LOGIN INHERIT PASSWORD 'acs_phase2_test_only';
    GRANT acs_phase2_partner_registry TO acs_phase2_partner_login_test;
    CREATE ROLE acs_phase2_opportunity_login_test LOGIN INHERIT PASSWORD 'acs_phase2_test_only';
    GRANT acs_phase2_opportunity_registry TO acs_phase2_opportunity_login_test;
    CREATE ROLE acs_phase2_proposal_login_test LOGIN INHERIT PASSWORD 'acs_phase2_test_only';
    GRANT acs_phase2_proposal_registry TO acs_phase2_proposal_login_test;
    CREATE ROLE acs_phase2_contract_login_test LOGIN INHERIT PASSWORD 'acs_phase2_test_only';
    GRANT acs_phase2_contract_registry TO acs_phase2_contract_login_test;
  `);
  process.stdout.write(
    `${JSON.stringify({ component: 'FOUNDATION_PLATFORM_COMMERCIAL_REGISTRIES_AND_CONTRACT', migration: 'VERIFIED', trusted_context: 'VERIFIED', rls: 'VERIFIED', tenant_isolation: 'VERIFIED', context_spoofing: 'VERIFIED', permission_denial: 'VERIFIED', durable_denial_audit: 'VERIFIED', audit_privileges: 'VERIFIED', audit_append_only_trigger: 'VERIFIED', event_outbox_lifecycle: 'VERIFIED', event_concurrency_claim: 'VERIFIED', event_retry_dlq_replay: 'VERIFIED', consumer_idempotency: 'VERIFIED', event_retention: 'VERIFIED', customer_registry_rls: 'VERIFIED', lead_registry_rls: 'VERIFIED', plan_catalog_rls: 'VERIFIED', partner_registry_rls: 'VERIFIED', opportunity_registry_rls: 'VERIFIED', proposal_rls: 'VERIFIED', contract_rls: 'VERIFIED' })}\n`,
  );
} finally {
  await client.end();
}
