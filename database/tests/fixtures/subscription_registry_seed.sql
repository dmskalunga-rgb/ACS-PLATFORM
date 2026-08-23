INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT v.tenant_id,v.membership_id,p.permission_key FROM (VALUES
 ('00000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000055'::uuid),
 ('00000000-0000-4000-8000-000000000022'::uuid,'30000000-0000-4000-8000-000000000088'::uuid)
) v(tenant_id,membership_id) CROSS JOIN (SELECT permission_key FROM platform.permissions WHERE permission_key LIKE 'commercial.subscription.%') p ON CONFLICT DO NOTHING;
DO $$
DECLARE token uuid; source_contract uuid; customer uuid; actor uuid := '40000000-0000-4000-8000-000000000044'; subscription_id uuid;
BEGIN
 SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.contract.activate');
 PERFORM set_config('role','acs_phase2_contract_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.contract.activate');
 UPDATE commercial.contracts SET status='ACTIVE',effective_from=clock_timestamp()-interval '1 day',updated_by=actor WHERE tenant_id='00000000-0000-4000-8000-000000000011'; RESET ROLE;
 SELECT id INTO customer FROM commercial.customers WHERE tenant_id='00000000-0000-4000-8000-000000000011' LIMIT 1;
 IF customer IS NULL THEN RAISE EXCEPTION 'Subscription fixture requires Customer fixture'; END IF;
 SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.contract.update');
 PERFORM set_config('role','acs_phase2_contract_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.contract.update');
 UPDATE commercial.contracts SET customer_id=customer,updated_by=actor,updated_at=clock_timestamp() WHERE tenant_id='00000000-0000-4000-8000-000000000011'; RESET ROLE;
 SELECT id,customer_id INTO source_contract,customer FROM commercial.contracts WHERE tenant_id='00000000-0000-4000-8000-000000000011' LIMIT 1;
 SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.subscription.create');
 PERFORM set_config('role','acs_phase2_subscription_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.subscription.create');
 INSERT INTO commercial.subscriptions(tenant_id,source_contract_id,source_contract_revision_number,customer_id,owner_membership_id,created_by_membership_id,effective_from,created_by,updated_by)
 VALUES('00000000-0000-4000-8000-000000000011',source_contract,1,customer,'30000000-0000-4000-8000-000000000055','30000000-0000-4000-8000-000000000055',clock_timestamp(),actor,actor) RETURNING id INTO subscription_id;
 INSERT INTO commercial.subscription_plan_origins(subscription_id,tenant_id,source_contract_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity)
 SELECT subscription_id,li.tenant_id,li.id,li.plan_id,li.plan_name_snapshot,li.description_snapshot,li.quantity FROM commercial.contract_line_items li WHERE li.contract_id=source_contract;
 RESET ROLE;
END $$;
