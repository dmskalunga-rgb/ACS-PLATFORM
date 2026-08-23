DO $$
DECLARE
  token uuid;
  visible integer;
  rls boolean;
  forced boolean;
BEGIN
  FOREACH visible IN ARRAY ARRAY[0, 0, 0, 0] LOOP NULL; END LOOP;
  SELECT relrowsecurity, relforcerowsecurity INTO rls, forced FROM pg_class WHERE oid = 'commercial.measurement_sources'::regclass;
  IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Usage source RLS/FORCE RLS missing'; END IF;
  SELECT relrowsecurity, relforcerowsecurity INTO rls, forced FROM pg_class WHERE oid = 'commercial.raw_measurements'::regclass;
  IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Usage raw measurement RLS/FORCE RLS missing'; END IF;
  SELECT relrowsecurity, relforcerowsecurity INTO rls, forced FROM pg_class WHERE oid = 'commercial.measurement_corrections'::regclass;
  IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Usage correction RLS/FORCE RLS missing'; END IF;
  SELECT relrowsecurity, relforcerowsecurity INTO rls, forced FROM pg_class WHERE oid = 'commercial.usage_aggregates'::regclass;
  IF NOT rls OR NOT forced THEN RAISE EXCEPTION 'Usage aggregate RLS/FORCE RLS missing'; END IF;

  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  SELECT count(*) INTO visible FROM commercial.measurement_sources;
  IF visible <> 0 THEN RAISE EXCEPTION 'Usage source access did not fail closed without trusted context'; END IF;
  RESET ROLE;

  SELECT context_token INTO token FROM platform.issue_tenant_context(
    '["https://issuer.acs.test","charlie"]', '00000000-0000-4000-8000-000000000022', 'commercial.usage.read'
  );
  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  PERFORM platform.activate_tenant_context(token, 'commercial.usage.read');
  SELECT count(*) INTO visible FROM commercial.measurement_sources WHERE tenant_id = '00000000-0000-4000-8000-000000000011';
  IF visible <> 0 THEN RAISE EXCEPTION 'Usage source tenant escape'; END IF;
  SELECT count(*) INTO visible FROM commercial.raw_measurements WHERE tenant_id = '00000000-0000-4000-8000-000000000011';
  IF visible <> 0 THEN RAISE EXCEPTION 'Usage raw measurement tenant escape'; END IF;
  SELECT count(*) INTO visible FROM commercial.measurement_corrections WHERE tenant_id = '00000000-0000-4000-8000-000000000011';
  IF visible <> 0 THEN RAISE EXCEPTION 'Usage correction tenant escape'; END IF;
  SELECT count(*) INTO visible FROM commercial.usage_aggregates WHERE tenant_id = '00000000-0000-4000-8000-000000000011';
  IF visible <> 0 THEN RAISE EXCEPTION 'Usage aggregate tenant escape'; END IF;
  RESET ROLE;

  IF has_table_privilege('acs_phase2_usage_metering', 'commercial.raw_measurements', 'UPDATE') OR has_table_privilege('acs_phase2_usage_metering', 'commercial.raw_measurements', 'DELETE') THEN
    RAISE EXCEPTION 'Usage runtime role can mutate or delete authoritative raw measurements';
  END IF;
  IF has_table_privilege('acs_phase2_usage_metering', 'commercial.measurement_corrections', 'UPDATE') OR has_table_privilege('acs_phase2_usage_metering', 'commercial.measurement_corrections', 'DELETE') THEN
    RAISE EXCEPTION 'Usage runtime role can mutate or delete authoritative corrections';
  END IF;
  IF has_table_privilege('acs_phase2_usage_metering', 'commercial.subscriptions', 'UPDATE') OR has_table_privilege('acs_phase2_usage_metering', 'commercial.entitlements', 'UPDATE') THEN
    RAISE EXCEPTION 'Usage runtime role received a cross-domain write grant';
  END IF;
END $$;

DO $$
<<machine_context_test>>
DECLARE
  token uuid;
  visible integer;
BEGIN
  SELECT context_token INTO token FROM platform.issue_machine_tenant_context(
    '80000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    'commercial.usage.ingest'
  );
  IF token IS NULL THEN RAISE EXCEPTION 'Active machine principal context was not issued'; END IF;
  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  PERFORM platform.activate_tenant_context(token, 'commercial.usage.ingest');
  SELECT count(*) INTO visible FROM commercial.raw_measurements
  WHERE tenant_id = '00000000-0000-4000-8000-000000000011';
  IF visible = 0 THEN RAISE EXCEPTION 'Machine context could not access same-tenant Usage data'; END IF;
  IF EXISTS (SELECT 1 FROM platform.activate_tenant_context(token, 'commercial.usage.ingest')) THEN
    RAISE EXCEPTION 'Machine context replay was accepted';
  END IF;
  RESET ROLE;

  SELECT context_token INTO token FROM platform.issue_machine_tenant_context(
    '80000000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000011',
    'commercial.usage.ingest'
  );
  IF token IS NOT NULL THEN RAISE EXCEPTION 'Wrong-tenant machine context was issued'; END IF;
  SELECT context_token INTO token FROM platform.issue_machine_tenant_context(
    '80000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000011',
    'commercial.usage.ingest'
  );
  IF token IS NOT NULL THEN RAISE EXCEPTION 'Disabled machine context was issued'; END IF;
  SELECT context_token INTO token FROM platform.issue_machine_tenant_context(
    '80000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000011',
    'commercial.usage.ingest'
  );
  IF token IS NOT NULL THEN RAISE EXCEPTION 'Revoked machine context was issued'; END IF;
  SELECT context_token INTO token FROM platform.issue_machine_tenant_context(
    '80000000-0000-4000-8000-000000000023',
    '00000000-0000-4000-8000-000000000022',
    'commercial.usage.ingest'
  );
  IF token IS NOT NULL THEN RAISE EXCEPTION 'Capability-less machine context was issued'; END IF;
  SELECT context_token INTO token FROM platform.issue_machine_tenant_context(
    '89999999-0000-4000-8000-000000000099',
    '00000000-0000-4000-8000-000000000011',
    'commercial.usage.ingest'
  );
  IF token IS NOT NULL THEN RAISE EXCEPTION 'Unknown machine context was issued'; END IF;

  SELECT context_token INTO token FROM platform.issue_machine_tenant_context(
    '80000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000011',
    'commercial.usage.ingest'
  );
  UPDATE platform.tenant_context_grants AS grant_row
  SET expires_at = clock_timestamp() - interval '1 second'
  WHERE grant_row.token = machine_context_test.token;
  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  IF EXISTS (SELECT 1 FROM platform.activate_tenant_context(token, 'commercial.usage.ingest')) THEN
    RAISE EXCEPTION 'Expired machine context was activated';
  END IF;
  RESET ROLE;

  SELECT context_token INTO token FROM platform.issue_machine_tenant_context(
    '80000000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000022',
    'commercial.usage.ingest'
  );
  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  PERFORM platform.activate_tenant_context(token, 'commercial.usage.ingest');
  SELECT count(*) INTO visible FROM commercial.raw_measurements
  WHERE tenant_id = '00000000-0000-4000-8000-000000000011';
  IF visible <> 0 THEN RAISE EXCEPTION 'Machine principal tenant escape'; END IF;
  RESET ROLE;

  IF EXISTS (
    SELECT 1 FROM platform.machine_principal_permissions
    WHERE permission_key IN ('commercial.usage.correct','commercial.usage.source.manage')
  ) THEN RAISE EXCEPTION 'Machine principal acquired a human-only permission'; END IF;
END $$;
