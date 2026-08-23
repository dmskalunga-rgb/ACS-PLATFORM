-- Canonical signed-OIDC fixture: Alice has the exact read/mutation actions
-- exercised by the Entitlement matrix, except approval-like activation.
INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT '00000000-0000-4000-8000-000000000011',
       '30000000-0000-4000-8000-000000000055',
       permission_key
FROM platform.permissions
WHERE permission_key IN (
  'commercial.entitlement.read',
  'commercial.entitlement.create',
  'commercial.entitlement.update',
  'commercial.entitlement.assign',
  'commercial.entitlement.request_activation',
  'commercial.entitlement.suspend',
  'commercial.entitlement.resume',
  'commercial.entitlement.cancel',
  'commercial.entitlement.terminate'
)
ON CONFLICT DO NOTHING;
DO $$
DECLARE token uuid; subscription_id uuid; actor uuid := '40000000-0000-4000-8000-000000000044'; owner uuid := '30000000-0000-4000-8000-000000000055'; line_item uuid; customer uuid; contract_id uuid; plan uuid;
BEGIN
 SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.subscription.activate');
 PERFORM set_config('role','acs_phase2_subscription_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.subscription.activate');
 UPDATE commercial.subscriptions SET status='ACTIVE',updated_by=actor,updated_at=clock_timestamp() WHERE tenant_id='00000000-0000-4000-8000-000000000011';
 RESET ROLE;
 SELECT s.id,s.customer_id,s.source_contract_id,o.source_contract_line_item_id,o.plan_id INTO subscription_id,customer,contract_id,line_item,plan FROM commercial.subscriptions s JOIN commercial.subscription_plan_origins o ON o.subscription_id=s.id WHERE s.tenant_id='00000000-0000-4000-8000-000000000011' AND s.status='ACTIVE' LIMIT 1;
 IF subscription_id IS NULL THEN RAISE EXCEPTION 'Entitlement fixture requires ACTIVE Subscription'; END IF;
 SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.entitlement.create');
 PERFORM set_config('role','acs_phase2_entitlement_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.entitlement.create');
 INSERT INTO commercial.entitlements(tenant_id,subscription_id,customer_id,contract_id,source_contract_line_item_id,plan_id,content_model,owner_membership_id,created_by_membership_id,effective_from,created_by,updated_by) VALUES('00000000-0000-4000-8000-000000000011',subscription_id,customer,contract_id,line_item,plan,'PLAN_LINE_ACCESS',owner,owner,clock_timestamp(),actor,actor);
 RESET ROLE;
END $$;
