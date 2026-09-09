-- XCAP005-POS-001..010 and XCAP005-NEG-001..023 are asserted by this
-- fail-fast database acceptance script and the paired domain/HTTP suites.
DO $$ DECLARE t text; enabled boolean; forced boolean; BEGIN
  FOREACH t IN ARRAY ARRAY['evidence_sources','evidence_blob_references','evidence_records','evidence_integrity_verifications','evidence_derivations','evidence_custody_entries','evidence_classification_decisions','evidence_retention_policies','evidence_retention_bindings','evidence_legal_hold_decisions','evidence_exports','evidence_command_results'] LOOP
    SELECT relrowsecurity,relforcerowsecurity INTO enabled,forced FROM pg_class WHERE oid=format('cyberdefense.%I',t)::regclass;
    IF NOT enabled OR NOT forced THEN RAISE EXCEPTION 'XCAP005 RLS/FORCE RLS missing on %',t; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='acs_xcap005_evidence' AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole)) THEN
    RAISE EXCEPTION 'XCAP005 capability role violates least privilege';
  END IF;
  IF has_table_privilege('public','cyberdefense.evidence_records','SELECT') OR has_table_privilege('acs_xcap005_evidence','platform.memberships','SELECT') THEN
    RAISE EXCEPTION 'XCAP005 privilege boundary violated';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='cyberdefense.evidence_records'::regclass AND tgname='evidence_records_immutable')
     OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='cyberdefense.evidence_custody_entries'::regclass AND tgname='evidence_custody_append_only') THEN
    RAISE EXCEPTION 'XCAP005 immutability trigger missing';
  END IF;
END $$;

BEGIN;
SELECT set_config('test.xcap_context',(SELECT context_token::text FROM platform.issue_tenant_context(
  'oidc|alice','00000000-0000-4000-8000-000000000011','cyberdefense.evidence.collect')),true);
SET LOCAL ROLE acs_xcap005_evidence;
SELECT * FROM platform.activate_tenant_context(current_setting('test.xcap_context')::uuid,'cyberdefense.evidence.collect');
SELECT set_config('test.xcap_source',(SELECT cyberdefense.register_evidence_machine_principal(
  '00000000-0000-4000-8000-000000000011','xcap005:test-source','cyberdefense.evidence.collect')::text),true);
INSERT INTO cyberdefense.evidence_sources(source_id,tenant_id,machine_principal_id,source_type,connector_type,external_binding,credential_reference,trust_classification,ingestion_policy_version,created_by)
VALUES('91000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',current_setting('test.xcap_source')::uuid,'TEST','TEST','xcap005:test-source','secret:test-only','TRUSTED','1.0.0','10000000-0000-4000-8000-000000000011');
INSERT INTO cyberdefense.evidence_blob_references(blob_reference_id,tenant_id,raw_bytes,media_type,size_bytes,content_sha256)
VALUES('92000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',decode('616373','hex'),'text/plain',3,'305f8cbf3cf1815fc12adbffc5c98f006bd98ae3cb5251d621a9741d346fe680');
INSERT INTO cyberdefense.evidence_records(evidence_id,tenant_id,evidence_source_id,blob_reference_id,source_event_id,canonicalization_version,canonical_metadata,metadata_sha256,ingestion_request_hash,classification_at_ingest,retention_policy_id,observed_at,collected_by,request_id,correlation_id)
VALUES('93000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','event-1','xcap005-evidence-metadata-v1','{}','44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',repeat('b',64),'INTERNAL','xcap005-test-short',clock_timestamp(),'10000000-0000-4000-8000-000000000011',gen_random_uuid(),gen_random_uuid());
DO $$ BEGIN
  IF (SELECT count(*) FROM cyberdefense.evidence_records)<>1 THEN RAISE EXCEPTION 'XCAP005-POS-001 collection failed'; END IF;
  BEGIN
    INSERT INTO cyberdefense.evidence_records(evidence_id,tenant_id,evidence_source_id,blob_reference_id,source_event_id,canonicalization_version,canonical_metadata,metadata_sha256,ingestion_request_hash,classification_at_ingest,retention_policy_id,observed_at,collected_by,request_id,correlation_id)
    VALUES(gen_random_uuid(),'00000000-0000-4000-8000-000000000022','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','cross-tenant','xcap005-evidence-metadata-v1','{}',repeat('a',64),repeat('b',64),'INTERNAL','xcap005-test-short',clock_timestamp(),'10000000-0000-4000-8000-000000000011',gen_random_uuid(),gen_random_uuid());
    RAISE EXCEPTION 'XCAP005-NEG cross-tenant relational write succeeded';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN NULL; END;
  BEGIN UPDATE cyberdefense.evidence_records SET canonical_metadata='{"tampered":true}' WHERE evidence_id='93000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'XCAP005-NEG immutable record changed';
  EXCEPTION WHEN object_not_in_prerequisite_state OR insufficient_privilege THEN NULL; END;
  BEGIN UPDATE cyberdefense.evidence_blob_references SET raw_bytes=decode('00','hex') WHERE blob_reference_id='92000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'XCAP005-NEG immutable blob changed';
  EXCEPTION WHEN object_not_in_prerequisite_state OR insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM cyberdefense.evidence_records) THEN RAISE EXCEPTION 'XCAP005 transaction rollback left evidence'; END IF;
END $$;
