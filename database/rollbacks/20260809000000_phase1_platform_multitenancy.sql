BEGIN;

-- PRE-ADOPTION/DISPOSABLE ENVIRONMENTS ONLY. Once persistent data exists, remediate forward.
DROP TABLE IF EXISTS platform.security_audit_logs;
DROP TABLE IF EXISTS platform.audit_logs;
DROP TABLE IF EXISTS platform.tenant_context_grants;
DROP TABLE IF EXISTS platform.membership_permissions;
DROP TABLE IF EXISTS platform.permissions;
DROP TABLE IF EXISTS platform.memberships;
DROP TABLE IF EXISTS platform.users;
DROP TABLE IF EXISTS platform.tenants;
DROP FUNCTION IF EXISTS platform.reject_audit_mutation();
DROP FUNCTION IF EXISTS platform.record_security_denial(text, uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS platform.has_trusted_tenant_context(uuid, uuid, text);
DROP FUNCTION IF EXISTS platform.activate_tenant_context(uuid, text);
DROP FUNCTION IF EXISTS platform.issue_tenant_context(text, uuid, text);
DROP FUNCTION IF EXISTS platform.is_tenant_action_authorized(uuid, uuid, text);
DROP FUNCTION IF EXISTS platform.resolve_active_tenant_membership(text, uuid);
DROP SCHEMA IF EXISTS platform;

COMMIT;
