DO $$
DECLARE
  allowed boolean;
BEGIN
  SELECT platform.is_tenant_action_authorized(
    '10000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    'platform.roles.manage'
  ) INTO allowed;
  IF NOT allowed THEN RAISE EXCEPTION 'canonical role permission was not resolved'; END IF;
  SELECT platform.is_tenant_action_authorized(
    '10000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000022',
    'platform.roles.manage'
  ) INTO allowed;
  IF allowed THEN RAISE EXCEPTION 'cross-tenant role permission escaped'; END IF;
END $$;

SET LOCAL ROLE acs_phase1_tenant_admin;
DO $$
DECLARE visible integer;
BEGIN
  SELECT count(*) INTO visible FROM platform.roles;
  IF visible <> 0 THEN RAISE EXCEPTION 'roles visible without trusted context'; END IF;
  IF EXISTS (SELECT 1 FROM platform.membership_roles) THEN
    RAISE EXCEPTION 'membership roles visible without trusted context';
  END IF;
END $$;
RESET ROLE;
