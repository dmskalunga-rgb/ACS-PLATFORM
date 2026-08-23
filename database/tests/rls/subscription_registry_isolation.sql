DO $$
DECLARE token uuid; subscription_id uuid; visible integer; rls boolean; forced boolean;
BEGIN
 SELECT id INTO subscription_id FROM commercial.subscriptions WHERE tenant_id='00000000-0000-4000-8000-000000000011' LIMIT 1;
 SELECT relrowsecurity,relforcerowsecurity INTO rls,forced FROM pg_class WHERE oid='commercial.subscriptions'::regclass;
 IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Subscription RLS/FORCE RLS missing'; END IF;
 SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","charlie"]','00000000-0000-4000-8000-000000000022','commercial.subscription.read');
 PERFORM set_config('role','acs_phase2_subscription_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.subscription.read');
 SELECT count(*) INTO visible FROM commercial.subscriptions WHERE id=subscription_id;
 IF visible <> 0 THEN RAISE EXCEPTION 'Subscription tenant escape'; END IF; RESET ROLE;
END $$;
