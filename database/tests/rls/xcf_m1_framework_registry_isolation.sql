DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['publishers','frameworks','framework_sources','source_artifacts',
  'framework_releases','framework_objects','release_supersessions','revocations','command_results'] LOOP
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
          WHERE oid=format('xcf.%I',table_name)::regclass) THEN
   RAISE EXCEPTION 'XCF M1 % RLS/FORCE RLS is not enabled',table_name;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='acs_xcf_m1_registry'
   AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
  RAISE EXCEPTION 'XCF M1 capability role violates least privilege';
 END IF;
 IF has_table_privilege('acs_xcf_m1_registry','platform.memberships','SELECT') THEN
  RAISE EXCEPTION 'XCF M1 runtime role must not read memberships directly';
 END IF;
 IF has_table_privilege('public','xcf.framework_releases','SELECT')
    OR has_function_privilege('public','xcf.has_registry_context(uuid,text[])','EXECUTE') THEN
  RAISE EXCEPTION 'PUBLIC has XCF M1 data-plane access';
 END IF;
 IF (SELECT count(*) FROM platform.permissions WHERE permission_key LIKE 'xcf.%')<>12 THEN
  RAISE EXCEPTION 'XCF M1 must register exactly its 12 frozen permissions';
 END IF;
 IF EXISTS(SELECT 1 FROM platform.permissions
           WHERE permission_key LIKE 'xcf.mapping.%'
              OR permission_key LIKE 'xcf.vulnerability.%'
              OR permission_key LIKE 'xcf.attack_graph.%') THEN
  RAISE EXCEPTION 'Unauthorized XCF M2/M3 permissions were registered';
 END IF;
 IF (SELECT count(*) FROM platform.mpa_policies WHERE policy_id LIKE 'xcf.%')<>4
    OR (SELECT count(*) FROM platform.mpa_policy_authority_requirements
        WHERE policy_id LIKE 'xcf.%')<>8 THEN
  RAISE EXCEPTION 'XCF M1 protected transitions do not have the frozen compound MPA policy';
 END IF;
END $$;

BEGIN;
SELECT set_config('test.xcf_context_b',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|charlie','00000000-0000-4000-8000-000000000022','xcf.publisher.administer')),true);
SET LOCAL ROLE acs_xcf_m1_registry;
SELECT * FROM platform.activate_tenant_context(current_setting('test.xcf_context_b')::uuid,'xcf.publisher.administer');
INSERT INTO xcf.publishers(governance_tenant_id,publisher_id,publisher_key,legal_name,trust_status,created_by)
VALUES('00000000-0000-4000-8000-000000000022','91000000-0000-4000-8000-000000000022',
 'tenant-b-publisher','Tenant B publisher','TRUSTED','30000000-0000-4000-8000-000000000033');
COMMIT;

BEGIN;
SELECT set_config('test.xcf_context_a',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','xcf.publisher.administer')),true);
SET LOCAL ROLE acs_xcf_m1_registry;
SELECT * FROM platform.activate_tenant_context(current_setting('test.xcf_context_a')::uuid,'xcf.publisher.administer');
INSERT INTO xcf.publishers(governance_tenant_id,publisher_id,publisher_key,legal_name,trust_status,created_by)
VALUES('00000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000011',
 'nist','NIST','TRUSTED','10000000-0000-4000-8000-000000000011');
COMMIT;

BEGIN;
SELECT set_config('test.xcf_context_register',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','xcf.framework_source.register')),true);
SET LOCAL ROLE acs_xcf_m1_registry;
SELECT * FROM platform.activate_tenant_context(current_setting('test.xcf_context_register')::uuid,'xcf.framework_source.register');
INSERT INTO xcf.frameworks(governance_tenant_id,framework_id,publisher_id,framework_key,framework_name,created_by)
VALUES('00000000-0000-4000-8000-000000000011','92000000-0000-4000-8000-000000000011',
 '91000000-0000-4000-8000-000000000011','nist-csf-2','NIST CSF 2.0','10000000-0000-4000-8000-000000000011');
INSERT INTO xcf.framework_sources(
 governance_tenant_id,source_id,publisher_id,framework_id,framework_key,framework_name,
 canonical_uri,allowed_uri_prefixes,source_format,authentication_method,signature_policy,
 trusted_key_reference,hash_algorithm,license,license_version,license_state,
 license_allowed_use,license_activation_compatible,redistribution_constraints,status,
 review_due_at,created_by)
VALUES('00000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000011',
 '91000000-0000-4000-8000-000000000011','92000000-0000-4000-8000-000000000011',
 'nist-csf-2','NIST CSF 2.0','https://csrc.nist.gov/csf','{https://csrc.nist.gov/}',
 'JSON','HTTPS','DETACHED_ED25519','key:nist:csf','SHA-256','NIST-PD','1.0','ACTIVE',
 'ACS_INTERNAL',true,'governed-test-only','VALIDATED',clock_timestamp()+interval '30 days',
 '10000000-0000-4000-8000-000000000011');
COMMIT;

BEGIN;
SELECT set_config('test.xcf_context_read',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','xcf.framework_source.read')),true);
SET LOCAL ROLE acs_xcf_m1_registry;
SELECT * FROM platform.activate_tenant_context(current_setting('test.xcf_context_read')::uuid,'xcf.framework_source.read');
DO $$ BEGIN
 IF (SELECT count(*) FROM xcf.publishers)<>1 THEN
  RAISE EXCEPTION 'XCF M1 tenant isolation failed';
 END IF;
 IF EXISTS(SELECT 1 FROM xcf.publishers WHERE governance_tenant_id='00000000-0000-4000-8000-000000000022') THEN
  RAISE EXCEPTION 'XCF M1 cross-tenant read succeeded';
 END IF;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.xcf_context_suspend',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','xcf.framework_source.suspend')),true);
SET LOCAL ROLE acs_xcf_m1_registry;
SELECT * FROM platform.activate_tenant_context(current_setting('test.xcf_context_suspend')::uuid,'xcf.framework_source.suspend');
DO $$ BEGIN
 UPDATE xcf.framework_sources SET status='SUSPENDED',status_reason_reference='cross-tenant-test'
 WHERE governance_tenant_id='00000000-0000-4000-8000-000000000022';
 IF FOUND THEN RAISE EXCEPTION 'XCF M1 cross-tenant update succeeded'; END IF;
 BEGIN
  INSERT INTO xcf.publishers(governance_tenant_id,publisher_id,publisher_key,legal_name,trust_status,created_by)
  VALUES('00000000-0000-4000-8000-000000000022',gen_random_uuid(),'spoofed','Spoofed','TRUSTED',
   '10000000-0000-4000-8000-000000000011');
  RAISE EXCEPTION 'XCF M1 cross-tenant insert succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
