DO $$
DECLARE token uuid; actor uuid := '40000000-0000-4000-8000-000000000044'; lead uuid;
BEGIN
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.lead.create');
  IF token IS NULL THEN RAISE EXCEPTION 'lead create context was not issued'; END IF;
  PERFORM set_config('role','acs_phase2_lead_registry',true);
  PERFORM platform.activate_tenant_context(token,'commercial.lead.create');
  INSERT INTO commercial.leads(tenant_id,display_name,source,created_by,updated_by) VALUES('00000000-0000-4000-8000-000000000011','Isolation Lead','MANUAL',actor,actor) RETURNING id INTO lead;
  IF lead IS NULL THEN RAISE EXCEPTION 'lead insert failed'; END IF;
END $$;
DO $$
DECLARE token uuid; visible integer; changed integer;
BEGIN
  RESET ROLE;
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.lead.read');
  PERFORM set_config('role','acs_phase2_lead_registry',true);
  PERFORM platform.activate_tenant_context(token,'commercial.lead.read');
  SELECT count(*) INTO visible FROM commercial.leads WHERE tenant_id='00000000-0000-4000-8000-000000000022';
  IF visible <> 0 THEN RAISE EXCEPTION 'cross-tenant lead escaped RLS'; END IF;
  UPDATE commercial.leads SET display_name='escape' WHERE tenant_id='00000000-0000-4000-8000-000000000022';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'cross-tenant lead update escaped RLS'; END IF;
END $$;
RESET ROLE;
