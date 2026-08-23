DO $$
DECLARE token uuid; entitlement_id uuid; visible integer; rls boolean; forced boolean;
BEGIN
 SELECT id INTO entitlement_id FROM commercial.entitlements WHERE tenant_id='00000000-0000-4000-8000-000000000011' LIMIT 1;
 SELECT relrowsecurity,relforcerowsecurity INTO rls,forced FROM pg_class WHERE oid='commercial.entitlements'::regclass;
 IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Entitlement RLS/FORCE RLS missing'; END IF;
 SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","charlie"]','00000000-0000-4000-8000-000000000022','commercial.entitlement.read');
 PERFORM set_config('role','acs_phase2_entitlement_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.entitlement.read');
 SELECT count(*) INTO visible FROM commercial.entitlements WHERE id=entitlement_id;
 IF visible<>0 THEN RAISE EXCEPTION 'Entitlement tenant escape'; END IF;
 RESET ROLE;
END $$;
