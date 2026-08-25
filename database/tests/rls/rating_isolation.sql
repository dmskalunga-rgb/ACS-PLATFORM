DO $$
DECLARE token uuid; visible integer; rls boolean; forced boolean; version_a uuid := '85100000-0000-4000-8000-000000000011';
BEGIN
  FOREACH visible IN ARRAY ARRAY[0,0,0,0,0,0,0] LOOP NULL; END LOOP;
  FOR rls,forced IN SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('commercial.rate_plans'::regclass,'commercial.rate_plan_versions'::regclass,'commercial.rate_rules'::regclass,'commercial.rate_tiers'::regclass,'commercial.rating_applicabilities'::regclass,'commercial.rated_facts'::regclass,'commercial.rating_operations'::regclass) LOOP IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Rating RLS/FORCE RLS missing'; END IF; END LOOP;
  PERFORM set_config('role','acs_phase2_rating',true);
  SELECT count(*) INTO visible FROM commercial.rate_plans;
  IF visible <> 0 THEN RAISE EXCEPTION 'Rating access did not fail closed without trusted context'; END IF;
  RESET ROLE;
  SELECT context_token INTO token FROM platform.issue_tenant_context('[''https://issuer.acs.test'',''charlie'']','00000000-0000-4000-8000-000000000022','commercial.rating.read');
  PERFORM set_config('role','acs_phase2_rating',true); PERFORM platform.activate_tenant_context(token,'commercial.rating.read');
  SELECT count(*) INTO visible FROM commercial.rate_plans WHERE tenant_id='00000000-0000-4000-8000-000000000011';
  IF visible <> 0 THEN RAISE EXCEPTION 'Rating Rate Plan tenant escape'; END IF;
  SELECT count(*) INTO visible FROM commercial.rating_applicabilities WHERE tenant_id='00000000-0000-4000-8000-000000000011';
  IF visible <> 0 THEN RAISE EXCEPTION 'Rating applicability tenant escape'; END IF;
  SELECT count(*) INTO visible FROM commercial.rated_facts WHERE tenant_id='00000000-0000-4000-8000-000000000011';
  IF visible <> 0 THEN RAISE EXCEPTION 'Rating fact tenant escape'; END IF;
  RESET ROLE;
  IF has_table_privilege('acs_phase2_rating','commercial.rated_facts','UPDATE') OR has_table_privilege('acs_phase2_rating','commercial.rated_facts','DELETE') THEN RAISE EXCEPTION 'Rating role can mutate immutable Rated Facts'; END IF;
  IF has_table_privilege('acs_phase2_rating','commercial.usage_aggregates','INSERT') OR has_table_privilege('acs_phase2_rating','commercial.usage_aggregates','UPDATE') OR has_table_privilege('acs_phase2_rating','commercial.usage_aggregates','DELETE') THEN RAISE EXCEPTION 'Rating role received Usage cross-domain write grant'; END IF;
  IF EXISTS(SELECT 1 FROM platform.machine_principal_permissions WHERE permission_key LIKE 'commercial.rating.%') THEN RAISE EXCEPTION 'Machine principal received Rating authority'; END IF;
  BEGIN
    UPDATE commercial.rate_plan_versions SET effective_from=effective_from+interval '1 hour' WHERE id=version_a;
    RAISE EXCEPTION 'Effective Rate Plan version mutation was accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'Effective Rate Plan version mutation was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE commercial.rated_facts SET pre_tax_amount=2.0000 WHERE id='85500000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Rated Fact mutation was accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'Rated Fact mutation was accepted' THEN RAISE; END IF;
  END;
END $$;
