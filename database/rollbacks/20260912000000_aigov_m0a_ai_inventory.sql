BEGIN;

DROP POLICY IF EXISTS domain_events_aigov_m0a_insert ON platform.domain_events;
DROP POLICY IF EXISTS audit_logs_aigov_m0a_insert ON platform.audit_logs;
DROP TABLE IF EXISTS ai_governance.command_results;
DROP TABLE IF EXISTS ai_governance.prompt_versions;
DROP TABLE IF EXISTS ai_governance.prompts;
DROP TABLE IF EXISTS ai_governance.dataset_versions;
DROP TABLE IF EXISTS ai_governance.datasets;
DROP TABLE IF EXISTS ai_governance.model_versions;
DROP TABLE IF EXISTS ai_governance.models;
DROP TABLE IF EXISTS ai_governance.ai_systems;
DROP FUNCTION IF EXISTS ai_governance.has_inventory_context(uuid,text[]);
DROP SCHEMA IF EXISTS ai_governance;

DELETE FROM platform.role_permissions WHERE permission_key LIKE 'aigov.%';
DELETE FROM platform.tenant_context_grants WHERE permission_key LIKE 'aigov.%';
DELETE FROM platform.membership_permissions WHERE permission_key LIKE 'aigov.%';
DELETE FROM platform.permissions WHERE permission_key LIKE 'aigov.%';

COMMIT;
