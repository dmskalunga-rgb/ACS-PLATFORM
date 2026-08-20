DO $$
DECLARE
  token uuid;
  actor uuid := '10000000-0000-4000-8000-000000000011';
  customer uuid;
BEGIN
  SELECT context_token INTO token FROM platform.issue_tenant_context(
    'oidc|alice','00000000-0000-4000-8000-000000000011','commercial.customer.create');
  IF token IS NULL THEN RAISE EXCEPTION 'customer create context was not issued'; END IF;
  PERFORM set_config('role','acs_phase2_customer_registry',true);
  PERFORM platform.activate_tenant_context(token,'commercial.customer.create');
  INSERT INTO commercial.customers(tenant_id,display_name,reference_code,created_by,updated_by)
  VALUES('00000000-0000-4000-8000-000000000011','Isolation Customer','ISO-1',actor,actor)
  RETURNING id INTO customer;
  IF customer IS NULL THEN RAISE EXCEPTION 'customer insert failed'; END IF;
END $$;

DO $$
DECLARE token uuid; visible integer;
BEGIN
  RESET ROLE;
  SELECT context_token INTO token FROM platform.issue_tenant_context(
    'oidc|alice','00000000-0000-4000-8000-000000000011','commercial.customer.read');
  PERFORM set_config('role','acs_phase2_customer_registry',true);
  PERFORM platform.activate_tenant_context(token,'commercial.customer.read');
  SELECT count(*) INTO visible FROM commercial.customers
    WHERE tenant_id='00000000-0000-4000-8000-000000000022';
  IF visible <> 0 THEN RAISE EXCEPTION 'cross-tenant customer escaped RLS'; END IF;
END $$;
RESET ROLE;
