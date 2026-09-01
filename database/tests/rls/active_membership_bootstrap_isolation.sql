BEGIN;
SET LOCAL ROLE acs_phase1_context_issuer;

DO $$
DECLARE
  resolved_count integer;
BEGIN
  SELECT count(*) INTO resolved_count
  FROM platform.list_active_tenant_memberships('oidc|alice');
  IF resolved_count <> 1 THEN
    RAISE EXCEPTION 'alice expected exactly one active tenant membership, got %', resolved_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM platform.list_active_tenant_memberships('oidc|alice')
    WHERE tenant_id = '00000000-0000-4000-8000-000000000022'
  ) THEN
    RAISE EXCEPTION 'inactive membership was returned by active membership bootstrap';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM platform.list_active_tenant_memberships('oidc|bob')
    WHERE tenant_id = '00000000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'cross-tenant membership leakage was returned by active membership bootstrap';
  END IF;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE acs_phase1_tenant_app;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM platform.list_active_tenant_memberships('oidc|alice');
    RAISE EXCEPTION 'tenant application role unexpectedly executed membership bootstrap function';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
ROLLBACK;
