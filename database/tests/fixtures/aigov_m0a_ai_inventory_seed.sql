DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='acs_aigov_m0a_inventory_login_test') THEN
  CREATE ROLE acs_aigov_m0a_inventory_login_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
   INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'acs_phase1_test_only';
 END IF;
END $$;
GRANT acs_aigov_m0a_inventory TO acs_aigov_m0a_inventory_login_test;

-- Test-only canonical XCAP-005 evidence identities. AI Inventory stores references,
-- never a parallel evidence blob or custody authority.
INSERT INTO platform.machine_principals(id,tenant_id,principal_type,external_binding,status)
VALUES
 ('a8000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011',
  'TEST_EVIDENCE_SOURCE','aigov-m0a-source-a','ACTIVE'),
 ('a8000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000022',
  'TEST_EVIDENCE_SOURCE','aigov-m0a-source-b','ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO cyberdefense.evidence_sources(
 tenant_id,source_id,machine_principal_id,source_type,connector_type,external_binding,
 credential_reference,trust_classification,ingestion_policy_version,created_by)
VALUES
 ('00000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000011',
  'a8000000-0000-4000-8000-000000000011','TEST','TEST','aigov-m0a-tenant-a',
  'test-only','VALIDATED','1.0.0','10000000-0000-4000-8000-000000000011'),
 ('00000000-0000-4000-8000-000000000022','e1000000-0000-4000-8000-000000000022',
  'a8000000-0000-4000-8000-000000000022','TEST','TEST','aigov-m0a-tenant-b',
  'test-only','VALIDATED','1.0.0','30000000-0000-4000-8000-000000000033')
ON CONFLICT DO NOTHING;

INSERT INTO cyberdefense.evidence_blob_references(
 tenant_id,blob_reference_id,raw_bytes,media_type,size_bytes,content_sha256)
VALUES
 ('00000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000011',
  ''::bytea,'application/octet-stream',0,
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
 ('00000000-0000-4000-8000-000000000022','e2000000-0000-4000-8000-000000000022',
  ''::bytea,'application/octet-stream',0,
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
ON CONFLICT DO NOTHING;

INSERT INTO cyberdefense.evidence_records(
 tenant_id,evidence_id,evidence_source_id,blob_reference_id,source_event_id,
 canonicalization_version,canonical_metadata,metadata_sha256,ingestion_request_hash,
 classification_at_ingest,retention_policy_id,observed_at,collected_by,request_id,correlation_id)
VALUES
 ('00000000-0000-4000-8000-000000000011','e3000000-0000-4000-8000-000000000011',
  'e1000000-0000-4000-8000-000000000011','e2000000-0000-4000-8000-000000000011',
  'aigov-m0a-tenant-a','xcap005-evidence-metadata-v1','{}'::jsonb,
  '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  repeat('a',64),'INTERNAL','xcap005-test-short',clock_timestamp(),
  '10000000-0000-4000-8000-000000000011',gen_random_uuid(),gen_random_uuid()),
 ('00000000-0000-4000-8000-000000000022','e3000000-0000-4000-8000-000000000022',
  'e1000000-0000-4000-8000-000000000022','e2000000-0000-4000-8000-000000000022',
  'aigov-m0a-tenant-b','xcap005-evidence-metadata-v1','{}'::jsonb,
  '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  repeat('b',64),'INTERNAL','xcap005-test-short',clock_timestamp(),
  '30000000-0000-4000-8000-000000000033',gen_random_uuid(),gen_random_uuid())
ON CONFLICT DO NOTHING;

INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT tenant_id,membership_id,permission_key FROM (VALUES
 ('00000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000011'::uuid),
 ('00000000-0000-4000-8000-000000000022'::uuid,'30000000-0000-4000-8000-000000000044'::uuid)
) memberships(tenant_id,membership_id) CROSS JOIN (VALUES
 ('aigov.inventory.read'),('aigov.ai_system.create'),('aigov.ai_system.update'),
 ('aigov.model.create'),('aigov.model.update'),('aigov.model_version.register'),
 ('aigov.dataset.create'),('aigov.dataset.update'),('aigov.dataset_version.register'),
 ('aigov.prompt.create'),('aigov.prompt.update'),('aigov.prompt_version.register')
) permissions(permission_key) ON CONFLICT DO NOTHING;
