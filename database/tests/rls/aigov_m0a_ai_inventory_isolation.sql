DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['ai_systems','models','model_versions','datasets',
  'dataset_versions','prompts','prompt_versions','command_results'] LOOP
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
          WHERE oid=format('ai_governance.%I',table_name)::regclass) THEN
   RAISE EXCEPTION 'AIGOV M0A % RLS/FORCE RLS is not enabled',table_name;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='acs_aigov_m0a_inventory'
   AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
  RAISE EXCEPTION 'AIGOV M0A capability role violates least privilege';
 END IF;
 IF has_table_privilege('acs_aigov_m0a_inventory','platform.memberships','SELECT') THEN
  RAISE EXCEPTION 'AIGOV M0A runtime role must not read memberships directly';
 END IF;
 IF has_table_privilege('public','ai_governance.ai_systems','SELECT')
    OR has_function_privilege('public','ai_governance.has_inventory_context(uuid,text[])','EXECUTE') THEN
  RAISE EXCEPTION 'PUBLIC has AIGOV M0A data-plane access';
 END IF;
 IF (SELECT count(*) FROM platform.permissions WHERE permission_key LIKE 'aigov.%')<>12 THEN
  RAISE EXCEPTION 'AIGOV M0A must register exactly its 12 bounded permissions';
 END IF;
 IF EXISTS(SELECT 1 FROM platform.permissions
           WHERE permission_key LIKE 'aigov.%deploy%'
              OR permission_key LIKE 'aigov.%approve%'
              OR permission_key LIKE 'aigov.%execute%') THEN
  RAISE EXCEPTION 'AIGOV M0A registered an unauthorized protected or execution permission';
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='ai_governance'
             AND column_name IN ('prompt_content','dataset_bytes','model_weights','secret','access_token')) THEN
  RAISE EXCEPTION 'AIGOV M0A stores prohibited raw content or secret material';
 END IF;
END $$;

BEGIN;
SELECT set_config('test.aigov_context_b',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|charlie','00000000-0000-4000-8000-000000000022','aigov.ai_system.create')),true);
SET LOCAL ROLE acs_aigov_m0a_inventory;
SELECT * FROM platform.activate_tenant_context(current_setting('test.aigov_context_b')::uuid,'aigov.ai_system.create');
INSERT INTO ai_governance.ai_systems(
 tenant_id,system_id,system_key,name,purpose,owner_reference,classification,evidence_reference,created_by)
VALUES('00000000-0000-4000-8000-000000000022','a2000000-0000-4000-8000-000000000022',
 'tenant-b-system','Tenant B System','Isolation proof','owner:b','INTERNAL','e3000000-0000-4000-8000-000000000022',
 '30000000-0000-4000-8000-000000000033');
COMMIT;

BEGIN;
SELECT set_config('test.aigov_context_a',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','aigov.ai_system.create')),true);
SET LOCAL ROLE acs_aigov_m0a_inventory;
SELECT * FROM platform.activate_tenant_context(current_setting('test.aigov_context_a')::uuid,'aigov.ai_system.create');
INSERT INTO ai_governance.ai_systems(
 tenant_id,system_id,system_key,name,purpose,owner_reference,classification,evidence_reference,created_by)
VALUES('00000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000011',
 'tenant-a-system','Tenant A System','Inventory proof','owner:a','CONFIDENTIAL','e3000000-0000-4000-8000-000000000011',
 '10000000-0000-4000-8000-000000000011');
COMMIT;

BEGIN;
SELECT set_config('test.aigov_context_model',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','aigov.model.create')),true);
SET LOCAL ROLE acs_aigov_m0a_inventory;
SELECT * FROM platform.activate_tenant_context(current_setting('test.aigov_context_model')::uuid,'aigov.model.create');
INSERT INTO ai_governance.models(
 tenant_id,model_id,system_id,model_key,name,provider_reference,classification,evidence_reference,created_by)
VALUES('00000000-0000-4000-8000-000000000011','a1100000-0000-4000-8000-000000000011',
 'a1000000-0000-4000-8000-000000000011','tenant-a-model','Tenant A Model','provider:a',
 'CONFIDENTIAL','e3000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011');
COMMIT;

BEGIN;
SELECT set_config('test.aigov_context_model_version',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','aigov.model_version.register')),true);
SET LOCAL ROLE acs_aigov_m0a_inventory;
SELECT * FROM platform.activate_tenant_context(current_setting('test.aigov_context_model_version')::uuid,'aigov.model_version.register');
INSERT INTO ai_governance.model_versions(
 tenant_id,model_version_id,model_id,version_label,artifact_sha256,artifact_reference,
 source_reference,provider_reference,provenance_reference,evidence_reference,created_by)
VALUES('00000000-0000-4000-8000-000000000011','a1110000-0000-4000-8000-000000000011',
 'a1100000-0000-4000-8000-000000000011','1.0.0',repeat('a',64),'artifact:model:a',
 'source:model:a','provider:a','e3000000-0000-4000-8000-000000000011','e3000000-0000-4000-8000-000000000011',
 '10000000-0000-4000-8000-000000000011');
DO $$ BEGIN
 BEGIN
  UPDATE ai_governance.model_versions SET version_label='mutated'
   WHERE model_version_id='a1110000-0000-4000-8000-000000000011';
  RAISE EXCEPTION 'AIGOV M0A immutable version accepted UPDATE';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 WHEN raise_exception THEN
  IF SQLERRM='AIGOV M0A immutable version accepted UPDATE' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.aigov_context_read',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','aigov.inventory.read')),true);
SET LOCAL ROLE acs_aigov_m0a_inventory;
SELECT * FROM platform.activate_tenant_context(current_setting('test.aigov_context_read')::uuid,'aigov.inventory.read');
DO $$ BEGIN
 IF (SELECT count(*) FROM ai_governance.ai_systems)<>1 THEN
  RAISE EXCEPTION 'AIGOV M0A tenant isolation failed';
 END IF;
 IF EXISTS(SELECT 1 FROM ai_governance.ai_systems
           WHERE tenant_id='00000000-0000-4000-8000-000000000022') THEN
  RAISE EXCEPTION 'AIGOV M0A cross-tenant read succeeded';
 END IF;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.aigov_context_spoof',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','aigov.ai_system.update')),true);
SET LOCAL ROLE acs_aigov_m0a_inventory;
SELECT * FROM platform.activate_tenant_context(current_setting('test.aigov_context_spoof')::uuid,'aigov.ai_system.update');
DO $$ BEGIN
 UPDATE ai_governance.ai_systems SET name='spoofed'
  WHERE tenant_id='00000000-0000-4000-8000-000000000022';
 IF FOUND THEN RAISE EXCEPTION 'AIGOV M0A cross-tenant update succeeded'; END IF;
 BEGIN
  INSERT INTO ai_governance.ai_systems(
   tenant_id,system_id,system_key,name,purpose,owner_reference,classification,evidence_reference,created_by)
  VALUES('00000000-0000-4000-8000-000000000022',gen_random_uuid(),'spoofed','Spoofed',
   'Spoof','owner:x','INTERNAL','e3000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011');
  RAISE EXCEPTION 'AIGOV M0A cross-tenant insert succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
