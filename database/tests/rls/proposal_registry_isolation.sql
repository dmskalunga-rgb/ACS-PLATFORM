DO $$
DECLARE token uuid; proposal uuid; visible integer; rls boolean; forced boolean; opportunity uuid; plan uuid;
BEGIN
  SELECT id INTO opportunity FROM commercial.opportunities WHERE tenant_id='00000000-0000-4000-8000-000000000011' LIMIT 1;
  SELECT id INTO plan FROM commercial.plans WHERE tenant_id='00000000-0000-4000-8000-000000000011' LIMIT 1;
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.proposal.create');
  PERFORM set_config('role','acs_phase2_proposal_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.proposal.create');
  INSERT INTO commercial.proposals(tenant_id,proposal_code,title,opportunity_id,owner_membership_id,created_by_membership_id,currency_code,valid_until,created_by,updated_by)
  VALUES('00000000-0000-4000-8000-000000000011','proposal-alpha','Alpha proposal',opportunity,'30000000-0000-4000-8000-000000000055','30000000-0000-4000-8000-000000000055','USD',clock_timestamp()+interval '1 day','40000000-0000-4000-8000-000000000044','40000000-0000-4000-8000-000000000044') RETURNING id INTO proposal;
  INSERT INTO commercial.proposal_line_items(proposal_id,tenant_id,line_number,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal) VALUES(proposal,'00000000-0000-4000-8000-000000000011',1,plan,'Plan','',1,2,2);
  RESET ROLE;
  SELECT relrowsecurity,relforcerowsecurity INTO rls,forced FROM pg_class WHERE oid='commercial.proposals'::regclass;
  IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Proposal RLS/FORCE RLS missing'; END IF;
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","charlie"]','00000000-0000-4000-8000-000000000022','commercial.proposal.read');
  PERFORM set_config('role','acs_phase2_proposal_registry',true); PERFORM platform.activate_tenant_context(token,'commercial.proposal.read');
  SELECT count(*) INTO visible FROM commercial.proposals WHERE id=proposal;
  IF visible <> 0 THEN RAISE EXCEPTION 'Proposal tenant escape'; END IF;
  RESET ROLE;
END $$;
