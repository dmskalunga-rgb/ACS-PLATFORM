BEGIN;
DROP FUNCTION IF EXISTS platform.materialize_mpa_expiry(uuid,uuid,uuid,text,uuid,uuid);
DROP TABLE IF EXISTS platform.mpa_command_results;
DROP TABLE IF EXISTS platform.mpa_consumptions;
DROP TABLE IF EXISTS platform.mpa_authorization_decisions;
DROP TABLE IF EXISTS platform.mpa_authorization_envelopes;
DROP TABLE IF EXISTS platform.mpa_membership_authorities;
DROP TABLE IF EXISTS platform.mpa_policy_authority_requirements;
DROP TABLE IF EXISTS platform.mpa_authority_classes;
DROP TABLE IF EXISTS platform.mpa_policies;
DELETE FROM platform.tenant_context_grants WHERE permission_key IN (
  'platform.mpa.request','platform.mpa.read','platform.mpa.approve',
  'platform.mpa.reject','platform.mpa.revoke','platform.mpa.consume'
);
DELETE FROM platform.membership_permissions WHERE permission_key IN (
  'platform.mpa.request','platform.mpa.read','platform.mpa.approve',
  'platform.mpa.reject','platform.mpa.revoke','platform.mpa.consume'
);
DELETE FROM platform.permissions WHERE permission_key IN (
  'platform.mpa.request','platform.mpa.read','platform.mpa.approve',
  'platform.mpa.reject','platform.mpa.revoke','platform.mpa.consume'
);
COMMIT;
