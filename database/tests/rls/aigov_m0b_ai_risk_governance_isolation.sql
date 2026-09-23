DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['risks','risk_assessments','risk_treatments',
    'risk_residual_reviews','risk_monitoring','risk_command_results'] LOOP
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
      WHERE oid=format('ai_governance.%I',table_name)::regclass) THEN
      RAISE EXCEPTION 'AIGOV M0B % lacks RLS/FORCE RLS',table_name;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='acs_aigov_m0b_risk'
    AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
    RAISE EXCEPTION 'AIGOV M0B runtime role violates least privilege';
  END IF;
  IF has_table_privilege('acs_aigov_m0b_risk','platform.memberships','SELECT')
    OR has_table_privilege('acs_aigov_m0b_risk','cyberdefense.evidence_records','SELECT')
    OR has_table_privilege('public','ai_governance.risks','SELECT')
    OR has_function_privilege('public','ai_governance.has_risk_context(uuid,text[])','EXECUTE') THEN
    RAISE EXCEPTION 'AIGOV M0B exposes unauthorized direct database authority';
  END IF;
  IF EXISTS(SELECT 1 FROM platform.permissions WHERE permission_key LIKE 'aigov.risk.%'
    AND (permission_key LIKE '%accept%' OR permission_key LIKE '%reject%' OR
         permission_key LIKE '%approve%' OR permission_key LIKE '%execute%')) THEN
    RAISE EXCEPTION 'AIGOV M0B must not register unresolved protected permissions';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns AS c WHERE c.table_schema='ai_governance'
    AND c.table_name LIKE 'risk_%' AND c.column_name IN
      ('raw_evidence','prompt_content','dataset_bytes','secret','access_token')) THEN
    RAISE EXCEPTION 'AIGOV M0B stores prohibited raw material';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='acs_aigov_m0b_risk_login_test') THEN
    CREATE ROLE acs_aigov_m0b_risk_login_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'acs_phase1_test_only';
  END IF;
END $$;
GRANT acs_aigov_m0b_risk TO acs_aigov_m0b_risk_login_test;

INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT memberships.tenant_id,memberships.membership_id,permissions.permission_key
FROM (VALUES
  ('00000000-0000-4000-8000-000000000011'::uuid,
   '30000000-0000-4000-8000-000000000011'::uuid),
  ('00000000-0000-4000-8000-000000000022'::uuid,
   '30000000-0000-4000-8000-000000000044'::uuid)
) AS memberships(tenant_id,membership_id)
CROSS JOIN (VALUES
  ('aigov.risk.read'),('aigov.risk.create'),('aigov.risk.update'),
  ('aigov.risk.assess'),('aigov.risk.treat'),('aigov.risk.review'),('aigov.risk.monitor')
) AS permissions(permission_key)
ON CONFLICT DO NOTHING;

BEGIN;
SELECT set_config('test.aigov_m0b_context_a',(SELECT context_token::text
  FROM platform.issue_tenant_context('oidc|alice',
   '00000000-0000-4000-8000-000000000011','aigov.risk.create')),true);
SET LOCAL ROLE acs_aigov_m0b_risk;
SELECT * FROM platform.activate_tenant_context(
  current_setting('test.aigov_m0b_context_a')::uuid,'aigov.risk.create');
INSERT INTO ai_governance.risks
  (tenant_id,risk_id,risk_code,title,description,primary_category,owner_user_id,
   model_id,evidence_reference,created_by)
VALUES
  ('00000000-0000-4000-8000-000000000011','b1000000-0000-4000-8000-000000000011',
   'AIR-001','AI risk A','Tenant A risk isolation proof','AIR-T01',
   '10000000-0000-4000-8000-000000000011','a1100000-0000-4000-8000-000000000011',
   'e3000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011');
DO $$ BEGIN
  BEGIN
    INSERT INTO ai_governance.risks
      (tenant_id,risk_id,risk_code,title,description,primary_category,owner_user_id,
       evidence_reference,created_by)
    VALUES
      ('00000000-0000-4000-8000-000000000011',gen_random_uuid(),
       'AIR-FORGED','Forged owner','Same-tenant owner substitution','AIR-T01',
       '40000000-0000-4000-8000-000000000044',
       'e3000000-0000-4000-8000-000000000011',
       '10000000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'AIGOV M0B forged risk owner was permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO ai_governance.risks
      (tenant_id,risk_id,risk_code,title,description,primary_category,owner_user_id,
       evidence_reference,created_by)
    VALUES
      ('00000000-0000-4000-8000-000000000022','b1000000-0000-4000-8000-000000000022',
       'AIR-002','Forged risk','Cross-tenant write attempt','AIR-T02',
       '30000000-0000-4000-8000-000000000033',
       'e3000000-0000-4000-8000-000000000022',
       '10000000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'AIGOV M0B cross-tenant risk insert was permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO ai_governance.risks
      (tenant_id,risk_id,risk_code,title,description,primary_category,owner_user_id,
       evidence_reference,created_by)
    VALUES
      ('00000000-0000-4000-8000-000000000011','b1000000-0000-4000-8000-000000000012',
       'AIR-002','Substituted evidence','Tenant B evidence attempt','AIR-T02',
       '10000000-0000-4000-8000-000000000011',
       'e3000000-0000-4000-8000-000000000022',
       '10000000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'AIGOV M0B cross-tenant evidence was permitted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO ai_governance.risks
      (tenant_id,risk_id,risk_code,title,description,primary_category,owner_user_id,
       ai_system_id,evidence_reference,created_by)
    VALUES
      ('00000000-0000-4000-8000-000000000011',gen_random_uuid(),
       'AIR-FOREIGN-INV','Foreign inventory','Cross-tenant M0A reference','AIR-T03',
       '10000000-0000-4000-8000-000000000011',
       'a2000000-0000-4000-8000-000000000022',
       'e3000000-0000-4000-8000-000000000011',
       '10000000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'AIGOV M0B cross-tenant M0A inventory reference was permitted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;
COMMIT;

BEGIN;
SELECT set_config('test.aigov_m0b_context_b',(SELECT context_token::text
  FROM platform.issue_tenant_context('oidc|charlie',
   '00000000-0000-4000-8000-000000000022','aigov.risk.read')),true);
SET LOCAL ROLE acs_aigov_m0b_risk;
SELECT * FROM platform.activate_tenant_context(
  current_setting('test.aigov_m0b_context_b')::uuid,'aigov.risk.read');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM ai_governance.risks
    WHERE risk_id='b1000000-0000-4000-8000-000000000011') THEN
    RAISE EXCEPTION 'AIGOV M0B cross-tenant risk read leaked an identity';
  END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE acs_aigov_m0b_risk;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM ai_governance.risks) THEN
    RAISE EXCEPTION 'AIGOV M0B direct read without trusted context was permitted';
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('test.aigov_m0b_assess',(SELECT context_token::text
  FROM platform.issue_tenant_context('oidc|alice',
   '00000000-0000-4000-8000-000000000011','aigov.risk.assess')),true);
SET LOCAL ROLE acs_aigov_m0b_risk;
SELECT * FROM platform.activate_tenant_context(
  current_setting('test.aigov_m0b_assess')::uuid,'aigov.risk.assess');
INSERT INTO ai_governance.risk_assessments
  (tenant_id,assessment_id,risk_id,likelihood,impact,exposure,detectability,
   autonomy,blast_radius,control_strength,inherent_score,residual_score,
   scoring_formula_reference,reason_reference,trigger_reference,evidence_reference,assessed_by)
VALUES
  ('00000000-0000-4000-8000-000000000011','b2000000-0000-4000-8000-000000000011',
   'b1000000-0000-4000-8000-000000000011',2,3,4,3,2,1,0.5000,15.00,7.50,
   'ACS-AI-GOV-001:v1.0:formula','reason:test','trigger:initial',
   'e3000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011');
DO $$ BEGIN
  BEGIN
    INSERT INTO ai_governance.risk_assessments
      (tenant_id,assessment_id,risk_id,likelihood,impact,exposure,detectability,
       autonomy,blast_radius,control_strength,inherent_score,residual_score,
       scoring_formula_reference,reason_reference,trigger_reference,evidence_reference,assessed_by)
    VALUES
      ('00000000-0000-4000-8000-000000000011',gen_random_uuid(),
       'b1000000-0000-4000-8000-000000000011',2,3,4,3,2,1,0.5000,1.00,0.50,
       'ACS-AI-GOV-001:v1.0:formula','reason:tamper','trigger:tamper',
       'e3000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'AIGOV M0B tampered risk score was permitted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE ai_governance.risk_assessments SET inherent_score=0
     WHERE assessment_id='b2000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'AIGOV M0B immutable assessment accepted UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
COMMIT;
