BEGIN;
DROP POLICY IF EXISTS domain_events_xcap005_insert ON platform.domain_events;
DROP POLICY IF EXISTS audit_logs_xcap005_insert ON platform.audit_logs;
DELETE FROM platform.tenant_context_grants WHERE permission_key LIKE 'cyberdefense.evidence.%';
DELETE FROM platform.machine_principal_permissions WHERE permission_key LIKE 'cyberdefense.evidence.%';
DELETE FROM platform.membership_permissions WHERE permission_key LIKE 'cyberdefense.evidence.%';
DELETE FROM platform.permissions WHERE permission_key IN (
 'cyberdefense.evidence.read','cyberdefense.evidence.collect','cyberdefense.evidence.verify','cyberdefense.evidence.derive',
 'cyberdefense.evidence.export','cyberdefense.evidence.retain','cyberdefense.evidence.retention_override','cyberdefense.evidence.destroy');
DROP SCHEMA IF EXISTS cyberdefense CASCADE;
COMMIT;
