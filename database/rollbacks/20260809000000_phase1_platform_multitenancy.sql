BEGIN;

DROP TABLE IF EXISTS platform.audit_logs;
DROP TABLE IF EXISTS platform.memberships;
DROP TABLE IF EXISTS platform.users;
DROP TABLE IF EXISTS platform.tenants;
DROP FUNCTION IF EXISTS platform.reject_audit_mutation();
DROP FUNCTION IF EXISTS platform.resolve_tenant_context(text, uuid);
DROP FUNCTION IF EXISTS platform.current_user_id();
DROP FUNCTION IF EXISTS platform.current_tenant_id();
DROP SCHEMA IF EXISTS platform;

COMMIT;
