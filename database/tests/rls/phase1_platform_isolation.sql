CREATE TEMP TABLE phase1_test_tokens (
  label text PRIMARY KEY,
  token uuid NOT NULL
);
GRANT SELECT, INSERT ON phase1_test_tokens
  TO acs_phase1_context_issuer, acs_phase1_tenant_app;

BEGIN;
SET LOCAL ROLE acs_phase1_context_issuer;

INSERT INTO phase1_test_tokens (label, token)
SELECT 'alice-a', context_token
FROM platform.issue_tenant_context(
  'oidc|alice',
  '00000000-0000-4000-8000-000000000011',
  'platform.context.read'
);

DO $$
DECLARE
  resolved_count integer;
BEGIN
  SELECT count(*) INTO resolved_count
  FROM platform.issue_tenant_context(
    'oidc|spoofed', '00000000-0000-4000-8000-000000000011', 'platform.context.read'
  );
  IF resolved_count <> 0 THEN RAISE EXCEPTION 'spoofed identity unexpectedly authorized'; END IF;

  SELECT count(*) INTO resolved_count
  FROM platform.issue_tenant_context(
    'oidc|alice', '00000000-0000-4000-8000-000000000022', 'platform.context.read'
  );
  IF resolved_count <> 0 THEN RAISE EXCEPTION 'inactive membership unexpectedly authorized'; END IF;

  SELECT count(*) INTO resolved_count
  FROM platform.issue_tenant_context(
    'oidc|bob', '00000000-0000-4000-8000-000000000011', 'platform.context.read'
  );
  IF resolved_count <> 0 THEN RAISE EXCEPTION 'tenant B subject reached tenant A'; END IF;

  SELECT count(*) INTO resolved_count
  FROM platform.issue_tenant_context(
    'oidc|charlie', '00000000-0000-4000-8000-000000000022', 'platform.context.read'
  );
  IF resolved_count <> 0 THEN RAISE EXCEPTION 'permission-less membership unexpectedly authorized'; END IF;

  SELECT count(*) INTO resolved_count
  FROM platform.issue_tenant_context(
    'oidc|bob', '00000000-0000-4000-8000-000000000033', 'platform.context.read'
  );
  IF resolved_count <> 0 THEN RAISE EXCEPTION 'inactive tenant unexpectedly authorized'; END IF;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE acs_phase1_tenant_app;

SELECT set_config('app.context_token', '99999999-9999-4999-8999-999999999999', true);
DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM platform.tenants;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'forged token bypassed RLS'; END IF;
END;
$$;

SELECT * FROM platform.activate_tenant_context(
  (SELECT token FROM phase1_test_tokens WHERE label = 'alice-a'),
  'platform.context.read'
);

DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM platform.tenants;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'tenant A expected one tenant, got %', visible_count; END IF;
  SELECT count(*) INTO visible_count FROM platform.memberships;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'Alice expected one membership, got %', visible_count; END IF;

  INSERT INTO platform.audit_logs (
    id, tenant_id, actor_user_id, action, resource, outcome,
    correlation_id, request_id, metadata
  ) VALUES (
    '40000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000011',
    'platform.context.read', 'platform:tenant-context', 'ALLOWED',
    'phase1-db-validation', 'phase1-db-validation', '{"source":"database-test"}'
  );

  BEGIN
    UPDATE platform.audit_logs SET outcome = 'DENIED';
    RAISE EXCEPTION 'tenant app unexpectedly received audit UPDATE privilege';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config('app.context_token', '88888888-8888-4888-8888-888888888888', true);
DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM platform.tenants;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'altered token retained tenant access'; END IF;
END;
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE acs_phase1_tenant_app;
SELECT set_config(
  'app.context_token',
  (SELECT token::text FROM phase1_test_tokens WHERE label = 'alice-a'),
  true
);
DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM platform.tenants;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'consumed token replayed in another transaction'; END IF;
END;
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE acs_phase1_security_auditor;
SELECT platform.record_security_denial(
  repeat('a', 64),
  '00000000-0000-4000-8000-000000000022',
  repeat('b', 64),
  'TENANT_CONTEXT_DENIED',
  'platform.context.read',
  'platform:tenant-context',
  'phase1-denial-correlation',
  'phase1-denial-request'
);
COMMIT;

BEGIN;
SET LOCAL ROLE acs_phase1_audit_integrity_test;
DO $$
BEGIN
  BEGIN
    UPDATE platform.audit_logs SET outcome = 'DENIED'
    WHERE id = '40000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'append-only trigger did not reject tenant audit mutation';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE platform.security_audit_logs SET reason_code = 'ALTERED';
    RAISE EXCEPTION 'append-only trigger did not reject security audit mutation';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END;
$$;
ROLLBACK;
