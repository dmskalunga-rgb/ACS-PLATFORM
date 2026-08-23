INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT t.tenant_id, t.membership_id, p.permission_key
FROM (VALUES
 ('00000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000055'::uuid),
 ('00000000-0000-4000-8000-000000000022'::uuid,'30000000-0000-4000-8000-000000000088'::uuid)
) AS t(tenant_id,membership_id)
CROSS JOIN (SELECT permission_key FROM platform.permissions WHERE permission_key LIKE 'commercial.contract.%') p
ON CONFLICT DO NOTHING;

DO $$
DECLARE token uuid; proposal uuid; proposal_line uuid; opportunity uuid; plan uuid; contract_id uuid;
BEGIN
  -- Establish the accepted source fixture through Proposal's existing trusted runtime role.
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.proposal.update');
  PERFORM set_config('role','acs_phase2_proposal_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.proposal.update');
  UPDATE commercial.proposals SET status='ACCEPTED', revision_number=1, proposal_code='contract-source-alpha', updated_at=clock_timestamp(), updated_by='40000000-0000-4000-8000-000000000044' WHERE tenant_id='00000000-0000-4000-8000-000000000011';
  RESET ROLE;
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.contract.create');
  PERFORM set_config('role','acs_phase2_contract_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.contract.create');
  SELECT id INTO proposal FROM commercial.proposals WHERE tenant_id='00000000-0000-4000-8000-000000000011' ORDER BY created_at LIMIT 1;
  SELECT id INTO proposal_line FROM commercial.proposal_line_items WHERE proposal_id=proposal ORDER BY line_number LIMIT 1;
  SELECT opportunity_id INTO opportunity FROM commercial.proposals WHERE id=proposal;
  SELECT plan_id INTO plan FROM commercial.proposal_line_items WHERE id=proposal_line;
  INSERT INTO commercial.contracts(tenant_id,source_proposal_id,source_proposal_revision_number,source_proposal_code,title,opportunity_id,owner_membership_id,created_by_membership_id,currency_code,contract_subtotal,grand_total,created_by,updated_by)
  VALUES('00000000-0000-4000-8000-000000000011',proposal,1,'contract-source-alpha','Contract alpha',opportunity,'30000000-0000-4000-8000-000000000055','30000000-0000-4000-8000-000000000055','USD',2,2,'40000000-0000-4000-8000-000000000044','40000000-0000-4000-8000-000000000044') RETURNING id INTO contract_id;
  INSERT INTO commercial.contract_line_items(contract_id,tenant_id,line_number,source_proposal_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal)
  VALUES(contract_id,'00000000-0000-4000-8000-000000000011',1,proposal_line,plan,'Plan','',1,2,2);
  RESET ROLE;
END $$;
