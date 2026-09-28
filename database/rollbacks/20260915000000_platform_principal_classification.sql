BEGIN;
DROP FUNCTION IF EXISTS platform.complete_human_genesis(
  uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,timestamptz,jsonb,uuid,uuid);
DROP TABLE IF EXISTS platform.human_genesis_ceremonies;
DROP FUNCTION IF EXISTS platform.verify_human_operation_attestation(
  uuid,uuid,text,uuid,uuid);
DROP FUNCTION IF EXISTS platform.verify_human_classification(uuid,uuid,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS platform.transition_human_classification(
  uuid,uuid,uuid,text,text,uuid,bigint,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS platform.pending_human_classification_evidence(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS platform.request_human_classification(
  uuid,uuid,uuid,uuid,text,bigint,uuid,uuid);
DROP FUNCTION IF EXISTS platform.issue_human_operation_attestation(
  uuid,uuid,uuid,uuid,bigint,uuid,uuid);
DROP TABLE IF EXISTS platform.human_operation_attestations;
DROP TABLE IF EXISTS platform.principal_classification_requests;
DROP TABLE IF EXISTS platform.principal_classification_lifecycle;
DROP FUNCTION IF EXISTS platform.set_principal_classification(
  uuid,uuid,uuid,text,text,text,uuid,bigint,uuid,uuid);
DROP TABLE IF EXISTS platform.principal_classifications;
DROP TABLE IF EXISTS platform.persons;
DROP FUNCTION IF EXISTS platform.resolve_human_governance_trust_root(text);
DROP TABLE IF EXISTS platform.human_governance_trust_roots;
-- Permission catalog entries are shared governance objects. Leave them inert rather
-- than deleting a pre-existing row that may have been reused by this migration.
COMMIT;
