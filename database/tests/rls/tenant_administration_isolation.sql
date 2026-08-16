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

BEGIN;
SELECT set_config(
  'test.admin_context_token',
  (SELECT context_token::text FROM platform.issue_tenant_context(
    'oidc|alice',
    '00000000-0000-4000-8000-000000000011',
    'platform.roles.manage'
  )),
  true
);
SET LOCAL ROLE acs_phase1_tenant_admin;
SELECT * FROM platform.activate_tenant_context(
  current_setting('test.admin_context_token')::uuid,
  'platform.roles.manage'
);
DO $$
DECLARE
  tenant_a_roles integer;
  tenant_b_roles integer;
  tenant_b_memberships integer;
BEGIN
  SELECT count(*) INTO tenant_a_roles FROM platform.roles
    WHERE tenant_id = '00000000-0000-4000-8000-000000000011';
  SELECT count(*) INTO tenant_b_roles FROM platform.roles
    WHERE tenant_id = '00000000-0000-4000-8000-000000000022';
  SELECT count(*) INTO tenant_b_memberships FROM platform.memberships
    WHERE tenant_id = '00000000-0000-4000-8000-000000000022';
  IF tenant_a_roles <> 2 OR tenant_b_roles <> 0 OR tenant_b_memberships <> 0 THEN
    RAISE EXCEPTION 'tenant administration RLS isolation failed';
  END IF;
  BEGIN
    INSERT INTO platform.membership_roles (tenant_id, membership_id, role_id, assigned_by)
    VALUES (
      '00000000-0000-4000-8000-000000000022',
      '30000000-0000-4000-8000-000000000044',
      '70000000-0000-4000-8000-000000000033',
      '10000000-0000-4000-8000-000000000011'
    );
    RAISE EXCEPTION 'cross-tenant direct SQL mutation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;
END $$;
ROLLBACK;
