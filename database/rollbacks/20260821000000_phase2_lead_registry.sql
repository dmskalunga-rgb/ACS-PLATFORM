BEGIN;
-- Remove only Lead Registry dependants before their permission parents.
DELETE FROM platform.tenant_context_grants WHERE permission_key LIKE 'commercial.lead.%';
DELETE FROM platform.role_permissions WHERE permission_key LIKE 'commercial.lead.%';
DELETE FROM platform.membership_permissions WHERE permission_key LIKE 'commercial.lead.%';
DROP POLICY IF EXISTS domain_events_lead_insert ON platform.domain_events;
DROP POLICY IF EXISTS audit_logs_lead_insert ON platform.audit_logs;
DROP TABLE IF EXISTS commercial.lead_operations;
DROP TABLE IF EXISTS commercial.leads;
DELETE FROM platform.permissions WHERE permission_key LIKE 'commercial.lead.%';
COMMIT;
