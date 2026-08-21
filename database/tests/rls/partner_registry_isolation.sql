DO $$
DECLARE token uuid; actor uuid := '40000000-0000-4000-8000-000000000044'; partner uuid; visible integer;
BEGIN
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.partner.create');
  PERFORM set_config('role','acs_phase2_partner_registry',true);
  PERFORM platform.activate_tenant_context(token,'commercial.partner.create');
  INSERT INTO commercial.partners(tenant_id,partner_code,display_name,created_by,updated_by) VALUES('00000000-0000-4000-8000-000000000011','alpha','Alpha Partner',actor,actor) RETURNING id INTO partner;
  RESET ROLE;
  SELECT context_token INTO token FROM platform.issue_tenant_context('["https://issuer.acs.test","alice"]','00000000-0000-4000-8000-000000000011','commercial.partner.read');
  PERFORM set_config('role','acs_phase2_partner_registry',true);
  PERFORM platform.activate_tenant_context(token,'commercial.partner.read');
  SELECT count(*) INTO visible FROM commercial.partners WHERE tenant_id='00000000-0000-4000-8000-000000000022';
  IF visible <> 0 THEN RAISE EXCEPTION 'Partner tenant escape'; END IF;
END $$;
