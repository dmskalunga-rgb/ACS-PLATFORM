DO $$
DECLARE token uuid; actor uuid := '40000000-0000-4000-8000-000000000044'; plan uuid; visible integer;
BEGIN
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.plan.create');
  PERFORM set_config('role','acs_phase2_plan_catalog',true);
  PERFORM platform.activate_tenant_context(token,'commercial.plan.create');
  INSERT INTO commercial.plans(tenant_id,plan_code,name,created_by,updated_by) VALUES('00000000-0000-4000-8000-000000000011','starter','Starter',actor,actor) RETURNING id INTO plan;
  INSERT INTO commercial.plan_features(tenant_id,plan_id,feature_code,name,created_by,updated_by) VALUES('00000000-0000-4000-8000-000000000011',plan,'core','Core',actor,actor);
  RESET ROLE;
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.plan.read');
  PERFORM set_config('role','acs_phase2_plan_catalog',true);
  PERFORM platform.activate_tenant_context(token,'commercial.plan.read');
  SELECT count(*) INTO visible FROM commercial.plans WHERE tenant_id='00000000-0000-4000-8000-000000000022';
  IF visible <> 0 THEN RAISE EXCEPTION 'Plan tenant escape'; END IF;
END $$;
