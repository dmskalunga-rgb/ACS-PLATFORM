BEGIN;
DROP POLICY IF EXISTS domain_events_customer_insert ON platform.domain_events;
DROP POLICY IF EXISTS audit_logs_customer_insert ON platform.audit_logs;
DROP SCHEMA IF EXISTS commercial CASCADE;
DELETE FROM platform.tenant_context_grants WHERE permission_key LIKE 'commercial.customer.%';
DELETE FROM platform.role_permissions WHERE permission_key LIKE 'commercial.customer.%';
DELETE FROM platform.membership_permissions WHERE permission_key LIKE 'commercial.customer.%';
DELETE FROM platform.permissions WHERE permission_key LIKE 'commercial.customer.%';
COMMIT;
