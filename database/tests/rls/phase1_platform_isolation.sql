BEGIN;

SET LOCAL ROLE acs_phase1_context_resolver_test;

DO $$
DECLARE
  resolved_count integer;
BEGIN
  SELECT count(*) INTO resolved_count
  FROM platform.resolve_tenant_context(
    'oidc|alice',
    '00000000-0000-4000-8000-000000000011'
  );
  IF resolved_count <> 1 THEN
    RAISE EXCEPTION 'active identity and membership expected one context, got %', resolved_count;
  END IF;

  SELECT count(*) INTO resolved_count
  FROM platform.resolve_tenant_context(
    'oidc|spoofed',
    '00000000-0000-4000-8000-000000000011'
  );
  IF resolved_count <> 0 THEN
    RAISE EXCEPTION 'spoofed identity unexpectedly resolved';
  END IF;

  SELECT count(*) INTO resolved_count
  FROM platform.resolve_tenant_context(
    'oidc|alice',
    '00000000-0000-4000-8000-000000000022'
  );
  IF resolved_count <> 0 THEN
    RAISE EXCEPTION 'inactive cross-tenant membership unexpectedly resolved';
  END IF;

  SELECT count(*) INTO resolved_count
  FROM platform.resolve_tenant_context(
    'oidc|bob',
    '00000000-0000-4000-8000-000000000033'
  );
  IF resolved_count <> 0 THEN
    RAISE EXCEPTION 'inactive tenant unexpectedly resolved';
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE acs_phase1_tenant_app_test;

SELECT set_config('app.tenant_id', '00000000-0000-4000-8000-000000000011', true);
SELECT set_config('app.user_id', '10000000-0000-4000-8000-000000000011', true);

DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM platform.tenants;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'tenant A expected one visible tenant, got %', visible_count;
  END IF;

  SELECT count(*) INTO visible_count FROM platform.memberships;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'tenant A user expected one visible membership, got %', visible_count;
  END IF;

  INSERT INTO platform.audit_logs (
    id, tenant_id, actor_user_id, action, outcome, correlation_id, request_id
  ) VALUES (
    '40000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000011',
    'platform.context.read',
    'ALLOWED',
    'phase1-db-validation',
    'phase1-db-validation'
  );

  BEGIN
    INSERT INTO platform.audit_logs (
      id, tenant_id, actor_user_id, action, outcome, correlation_id, request_id
    ) VALUES (
      '40000000-0000-4000-8000-000000000022',
      '00000000-0000-4000-8000-000000000022',
      '10000000-0000-4000-8000-000000000011',
      'platform.context.read',
      'ALLOWED',
      'tenant-escape',
      'tenant-escape'
    );
    RAISE EXCEPTION 'cross-tenant audit insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM count(*) FROM platform.users;
    RAISE EXCEPTION 'tenant role unexpectedly accessed global identity mappings';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE platform.audit_logs SET outcome = 'DENIED';
    RAISE EXCEPTION 'append-only audit update unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;
END;
$$;

SELECT set_config('app.tenant_id', '00000000-0000-4000-8000-000000000022', true);
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000022', true);

DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM platform.audit_logs;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'tenant B observed tenant A audit records';
  END IF;
END;
$$;

ROLLBACK;
