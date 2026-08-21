BEGIN;
DELETE FROM platform.tenant_context_grants WHERE permission_key LIKE 'commercial.opportunity.%';
DELETE FROM platform.role_permissions WHERE permission_key LIKE 'commercial.opportunity.%';
DELETE FROM platform.membership_permissions WHERE permission_key LIKE 'commercial.opportunity.%';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_phase2_opportunity_registry') THEN
    REVOKE SELECT ON platform.memberships FROM acs_phase2_opportunity_registry;
  END IF;
END $$;
ALTER POLICY memberships_isolation ON platform.memberships USING (
  platform.has_trusted_tenant_context(tenant_id, user_id, 'platform.context.read')
);
DROP POLICY IF EXISTS domain_events_opportunity_insert ON platform.domain_events;
DROP POLICY IF EXISTS audit_logs_opportunity_insert ON platform.audit_logs;
DROP TABLE IF EXISTS commercial.opportunity_operations;
DROP TABLE IF EXISTS commercial.opportunities;
DELETE FROM platform.permissions WHERE permission_key LIKE 'commercial.opportunity.%';
COMMIT;
