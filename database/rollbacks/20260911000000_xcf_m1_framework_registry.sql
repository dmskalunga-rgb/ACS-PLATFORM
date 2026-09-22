BEGIN;

DROP POLICY IF EXISTS domain_events_xcf_m1_insert ON platform.domain_events;
DROP POLICY IF EXISTS audit_logs_xcf_m1_insert ON platform.audit_logs;

DROP TABLE IF EXISTS xcf.command_results;
DROP TABLE IF EXISTS xcf.revocations;
DROP TABLE IF EXISTS xcf.release_supersessions;
DROP TABLE IF EXISTS xcf.framework_objects;
DROP TABLE IF EXISTS xcf.framework_releases;
DROP TABLE IF EXISTS xcf.source_artifacts;
DROP TABLE IF EXISTS xcf.framework_sources;
DROP TABLE IF EXISTS xcf.frameworks;
DROP TABLE IF EXISTS xcf.publishers;
DROP FUNCTION IF EXISTS xcf.has_registry_context(uuid,text[]);
DROP SCHEMA IF EXISTS xcf;

DELETE FROM platform.mpa_policy_authority_requirements
 WHERE policy_id IN (
  'xcf.framework_source.activate.standard','xcf.framework_source.revoke.standard',
  'xcf.framework_release.activate.standard','xcf.framework_release.revoke.standard');
DELETE FROM platform.mpa_policies
 WHERE policy_id IN (
  'xcf.framework_source.activate.standard','xcf.framework_source.revoke.standard',
  'xcf.framework_release.activate.standard','xcf.framework_release.revoke.standard');
DELETE FROM platform.mpa_membership_authorities
 WHERE authority_class_id IN ('xcf.knowledge_custodian_authority','xcf.security_governance_authority');
DELETE FROM platform.mpa_authority_classes
 WHERE authority_class_id IN ('xcf.knowledge_custodian_authority','xcf.security_governance_authority')
   AND NOT EXISTS (
   SELECT 1 FROM platform.mpa_membership_authorities a
     WHERE a.authority_class_id=platform.mpa_authority_classes.authority_class_id);
DELETE FROM platform.role_permissions WHERE permission_key IN (
 'xcf.framework_source.read','xcf.framework_source.register','xcf.framework_source.activate',
 'xcf.framework_source.suspend','xcf.framework_source.revoke','xcf.publisher.read',
 'xcf.publisher.administer','xcf.framework_release.read','xcf.framework_release.ingest',
 'xcf.framework_release.approve','xcf.framework_release.activate','xcf.framework_release.revoke');
DELETE FROM platform.tenant_context_grants WHERE permission_key IN (
 'xcf.framework_source.read','xcf.framework_source.register','xcf.framework_source.activate',
 'xcf.framework_source.suspend','xcf.framework_source.revoke','xcf.publisher.read',
 'xcf.publisher.administer','xcf.framework_release.read','xcf.framework_release.ingest',
 'xcf.framework_release.approve','xcf.framework_release.activate','xcf.framework_release.revoke');
DELETE FROM platform.membership_permissions WHERE permission_key IN (
 'xcf.framework_source.read','xcf.framework_source.register','xcf.framework_source.activate',
 'xcf.framework_source.suspend','xcf.framework_source.revoke','xcf.publisher.read',
 'xcf.publisher.administer','xcf.framework_release.read','xcf.framework_release.ingest',
 'xcf.framework_release.approve','xcf.framework_release.activate','xcf.framework_release.revoke');
DELETE FROM platform.permissions WHERE permission_key IN (
 'xcf.framework_source.read','xcf.framework_source.register','xcf.framework_source.activate',
 'xcf.framework_source.suspend','xcf.framework_source.revoke','xcf.publisher.read',
 'xcf.publisher.administer','xcf.framework_release.read','xcf.framework_release.ingest',
 'xcf.framework_release.approve','xcf.framework_release.activate','xcf.framework_release.revoke');

COMMIT;
