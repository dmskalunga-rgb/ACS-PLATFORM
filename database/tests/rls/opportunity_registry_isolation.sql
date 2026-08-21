DO $$
DECLARE token uuid; a_opportunity uuid; visible integer; rls boolean; forced boolean;
BEGIN
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.opportunity.create');
  PERFORM set_config('role','acs_phase2_opportunity_registry',true);
  PERFORM platform.activate_tenant_context(token,'commercial.opportunity.create');
  INSERT INTO commercial.opportunities(tenant_id,opportunity_code,title,owner_membership_id,created_by,updated_by)
  VALUES('00000000-0000-4000-8000-000000000011','opp-alpha','Alpha opportunity','30000000-0000-4000-8000-000000000055','40000000-0000-4000-8000-000000000044','40000000-0000-4000-8000-000000000044') RETURNING id INTO a_opportunity;
  RESET ROLE;
  SELECT relrowsecurity,relforcerowsecurity INTO rls,forced FROM pg_class WHERE oid='commercial.opportunities'::regclass;
  IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Opportunity RLS/FORCE RLS missing'; END IF;
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","charlie"]','00000000-0000-4000-8000-000000000022','commercial.opportunity.read');
  PERFORM set_config('role','acs_phase2_opportunity_registry',true);
  PERFORM platform.activate_tenant_context(token,'commercial.opportunity.read');
  SELECT count(*) INTO visible FROM commercial.opportunities WHERE id=a_opportunity;
  IF visible <> 0 THEN RAISE EXCEPTION 'Opportunity tenant escape'; END IF;
  RESET ROLE;
END $$;
