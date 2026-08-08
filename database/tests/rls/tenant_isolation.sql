BEGIN;
SET LOCAL ROLE acs_phase0_tenant_test;

DO $$
DECLARE
  tenant_a constant uuid := '00000000-0000-4000-8000-000000000001';
  tenant_b constant uuid := '00000000-0000-4000-8000-000000000002';
  visible_count integer;
BEGIN
  PERFORM set_config('app.tenant_id', tenant_a::text, true);
  INSERT INTO foundation.tenant_isolation_probe (id, tenant_id, probe_value)
  VALUES ('10000000-0000-4000-8000-000000000001', tenant_a, 'tenant-a');

  PERFORM set_config('app.tenant_id', tenant_b::text, true);
  INSERT INTO foundation.tenant_isolation_probe (id, tenant_id, probe_value)
  VALUES ('20000000-0000-4000-8000-000000000002', tenant_b, 'tenant-b');

  SELECT count(*) INTO visible_count FROM foundation.tenant_isolation_probe;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'tenant B expected 1 visible row, got %', visible_count;
  END IF;

  PERFORM set_config('app.tenant_id', tenant_a::text, true);
  SELECT count(*) INTO visible_count FROM foundation.tenant_isolation_probe;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'tenant A expected 1 visible row, got %', visible_count;
  END IF;

  BEGIN
    INSERT INTO foundation.tenant_isolation_probe (id, tenant_id, probe_value)
    VALUES ('30000000-0000-4000-8000-000000000003', tenant_b, 'tenant-escape');
    RAISE EXCEPTION 'tenant escape insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
