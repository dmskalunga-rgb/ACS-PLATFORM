DO $$
DECLARE token uuid; contract_id uuid; visible integer; rls boolean; forced boolean;
BEGIN
  SELECT id INTO contract_id FROM commercial.contracts WHERE tenant_id='00000000-0000-4000-8000-000000000011' LIMIT 1;
  SELECT relrowsecurity,relforcerowsecurity INTO rls,forced FROM pg_class WHERE oid='commercial.contracts'::regclass;
  IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Contract RLS/FORCE RLS missing'; END IF;
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","charlie"]','00000000-0000-4000-8000-000000000022','commercial.contract.read');
  PERFORM set_config('role','acs_phase2_contract_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.contract.read');
  SELECT count(*) INTO visible FROM commercial.contracts WHERE id=contract_id;
  IF visible <> 0 THEN RAISE EXCEPTION 'Contract tenant escape'; END IF;
  RESET ROLE;
END $$;
