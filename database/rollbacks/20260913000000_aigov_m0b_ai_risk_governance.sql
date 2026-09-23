BEGIN;

DROP POLICY IF EXISTS domain_events_aigov_m0b_insert ON platform.domain_events;
DROP POLICY IF EXISTS audit_logs_aigov_m0b_insert ON platform.audit_logs;

DROP POLICY IF EXISTS ai_systems_m0b_risk_reference ON ai_governance.ai_systems;
DROP POLICY IF EXISTS models_m0b_risk_reference ON ai_governance.models;
DROP POLICY IF EXISTS model_versions_m0b_risk_reference ON ai_governance.model_versions;
DROP POLICY IF EXISTS datasets_m0b_risk_reference ON ai_governance.datasets;
DROP POLICY IF EXISTS dataset_versions_m0b_risk_reference ON ai_governance.dataset_versions;
DROP POLICY IF EXISTS prompts_m0b_risk_reference ON ai_governance.prompts;
DROP POLICY IF EXISTS prompt_versions_m0b_risk_reference ON ai_governance.prompt_versions;

DROP TABLE IF EXISTS ai_governance.risk_monitoring;
DROP TABLE IF EXISTS ai_governance.risk_command_results;
DROP TABLE IF EXISTS ai_governance.risk_residual_reviews;
DROP TABLE IF EXISTS ai_governance.risk_treatments;
DROP TABLE IF EXISTS ai_governance.risk_assessments;
DROP TABLE IF EXISTS ai_governance.risks;
DROP FUNCTION IF EXISTS ai_governance.reject_risk_identity_mutation();
DROP FUNCTION IF EXISTS ai_governance.has_risk_context(uuid,text[]);

DELETE FROM platform.role_permissions WHERE permission_key LIKE 'aigov.risk.%';
DELETE FROM platform.tenant_context_grants WHERE permission_key LIKE 'aigov.risk.%';
DELETE FROM platform.membership_permissions WHERE permission_key LIKE 'aigov.risk.%';
DELETE FROM platform.permissions WHERE permission_key LIKE 'aigov.risk.%';

COMMIT;
