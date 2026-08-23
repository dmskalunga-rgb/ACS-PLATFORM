INSERT INTO platform.membership_permissions(tenant_id, membership_id, permission_key)
SELECT v.tenant_id, v.membership_id, p.permission_key
FROM (VALUES
  ('00000000-0000-4000-8000-000000000011'::uuid, '30000000-0000-4000-8000-000000000055'::uuid),
  ('00000000-0000-4000-8000-000000000022'::uuid, '30000000-0000-4000-8000-000000000088'::uuid)
) v(tenant_id, membership_id)
CROSS JOIN (SELECT permission_key FROM platform.permissions WHERE permission_key IN (
  'commercial.usage.read', 'commercial.usage.correct', 'commercial.usage.source.read',
  'commercial.usage.source.manage', 'commercial.usage.replay'
)) p
ON CONFLICT DO NOTHING;

INSERT INTO platform.machine_principals(id, tenant_id, principal_type, external_binding, status)
VALUES
  ('80000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011', 'MEASUREMENT_SOURCE', 'usage-fixture-active', 'ACTIVE'),
  ('80000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000011', 'MEASUREMENT_SOURCE', 'usage-fixture-disabled', 'DISABLED'),
  ('80000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000011', 'MEASUREMENT_SOURCE', 'usage-fixture-revoked', 'REVOKED'),
  ('80000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000022', 'MEASUREMENT_SOURCE', 'usage-fixture-tenant-b', 'ACTIVE'),
  ('80000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000022', 'MEASUREMENT_SOURCE', 'usage-fixture-no-capability', 'ACTIVE')
ON CONFLICT DO NOTHING;
INSERT INTO platform.machine_principal_permissions(tenant_id, machine_principal_id, permission_key)
VALUES
  ('00000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000011', 'commercial.usage.ingest'),
  ('00000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000012', 'commercial.usage.ingest'),
  ('00000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000013', 'commercial.usage.ingest'),
  ('00000000-0000-4000-8000-000000000022', '80000000-0000-4000-8000-000000000022', 'commercial.usage.ingest')
ON CONFLICT DO NOTHING;

INSERT INTO platform.membership_permissions(tenant_id, membership_id, permission_key)
VALUES ('00000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000055', 'commercial.entitlement.activate')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  token uuid;
  actor uuid := '40000000-0000-4000-8000-000000000044';
  subscription_id uuid;
  entitlement_id uuid;
  source_a uuid := '81000000-0000-4000-8000-000000000011';
  source_b uuid := '81000000-0000-4000-8000-000000000022';
BEGIN
  SELECT context_token INTO token FROM platform.issue_tenant_context(
    '["https://issuer.acs.test","alice"]', '00000000-0000-4000-8000-000000000011', 'commercial.usage.source.manage'
  );
  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  PERFORM platform.activate_tenant_context(token, 'commercial.usage.source.manage');
  INSERT INTO commercial.measurement_sources(id, tenant_id, machine_principal_id, name, descriptor, credential_id, credential_hash, created_by, updated_by)
  VALUES
    (source_a, '00000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000011', 'usage-fixture-active', 'TEST_ONLY deterministic source', '82000000-0000-4000-8000-000000000011', '7e4ee9a9461741d26a13013d86732b8c8964df7ae85721edb5b0e3fb28c7b3e5', actor, actor),
    ('81000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000012', 'usage-fixture-disabled', 'TEST_ONLY deterministic source', '82000000-0000-4000-8000-000000000012', 'b19a83f9d3503f9c205a94f5ccbd38abedd9e715dde07146c6a83daaece67d2a', actor, actor),
    ('81000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000013', 'usage-fixture-revoked', 'TEST_ONLY deterministic source', '82000000-0000-4000-8000-000000000013', '99130e655771898fa81d74f83be13d3d14e598cf34d5ee3bc9904c05d54b8dce', actor, actor);
  UPDATE commercial.measurement_sources SET status = 'DISABLED', version = version + 1, updated_at = clock_timestamp() WHERE id = '81000000-0000-4000-8000-000000000012';
  UPDATE commercial.measurement_sources SET status = 'REVOKED', version = version + 1, updated_at = clock_timestamp() WHERE id = '81000000-0000-4000-8000-000000000013';
  RESET ROLE;

  SELECT context_token INTO token FROM platform.issue_tenant_context(
    '["https://issuer.acs.test","charlie"]', '00000000-0000-4000-8000-000000000022', 'commercial.usage.source.manage'
  );
  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  PERFORM platform.activate_tenant_context(token, 'commercial.usage.source.manage');
  INSERT INTO commercial.measurement_sources(id, tenant_id, machine_principal_id, name, descriptor, credential_id, credential_hash, created_by, updated_by)
  VALUES (source_b, '00000000-0000-4000-8000-000000000022', '80000000-0000-4000-8000-000000000022', 'usage-fixture-tenant-b', 'TEST_ONLY deterministic source', '82000000-0000-4000-8000-000000000022', '2cbfff29e33fcb1ff2ee643e9906f261685fef2c0d535782c9f42312e7af3391', '60000000-0000-4000-8000-000000000066', '60000000-0000-4000-8000-000000000066');
  RESET ROLE;

  SELECT context_token INTO token FROM platform.issue_tenant_context(
    '["https://issuer.acs.test","alice"]', '00000000-0000-4000-8000-000000000011', 'commercial.entitlement.activate'
  );
  PERFORM set_config('role', 'acs_phase2_entitlement_registry', true);
  PERFORM platform.activate_tenant_context(token, 'commercial.entitlement.activate');
  UPDATE commercial.entitlements
  SET status = 'ACTIVE', updated_by = actor, updated_at = clock_timestamp(), version = version + 1
  WHERE tenant_id = '00000000-0000-4000-8000-000000000011' AND status IN ('DRAFT', 'PENDING_ACTIVATION');
  RESET ROLE;

  SELECT s.id, e.id INTO subscription_id, entitlement_id
  FROM commercial.subscriptions s
  JOIN commercial.entitlements e ON e.subscription_id = s.id AND e.tenant_id = s.tenant_id
  WHERE s.tenant_id = '00000000-0000-4000-8000-000000000011' AND s.status = 'ACTIVE' AND e.status = 'ACTIVE'
  LIMIT 1;
  IF subscription_id IS NULL OR entitlement_id IS NULL THEN
    RAISE EXCEPTION 'Usage fixture requires same-tenant ACTIVE Subscription and Entitlement';
  END IF;
  SELECT context_token INTO token FROM platform.issue_tenant_context(
    '["https://issuer.acs.test","alice"]', '00000000-0000-4000-8000-000000000011', 'commercial.usage.replay'
  );
  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  PERFORM platform.activate_tenant_context(token, 'commercial.usage.replay');
  INSERT INTO commercial.raw_measurements(id, tenant_id, source_id, source_event_id, payload_hash, subscription_id, entitlement_id, measurement_type, value, unit, event_time, status, schema_version)
  VALUES ('83000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011', source_a, 'fixture-event-001', repeat('a',64), subscription_id, entitlement_id, 'api.request', 1, 'request', clock_timestamp() - interval '1 minute', 'ACCEPTED', 1);
  INSERT INTO commercial.usage_aggregates(id, tenant_id, subscription_id, entitlement_id, measurement_type, unit, time_bucket, bucket_start, aggregate_value)
  VALUES ('84000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011', subscription_id, entitlement_id, 'api.request', 'request', 'HOURLY', date_trunc('hour', clock_timestamp()), 1);
  RESET ROLE;

  SELECT context_token INTO token FROM platform.issue_tenant_context(
    '["https://issuer.acs.test","alice"]', '00000000-0000-4000-8000-000000000011', 'commercial.usage.correct'
  );
  PERFORM set_config('role', 'acs_phase2_usage_metering', true);
  PERFORM platform.activate_tenant_context(token, 'commercial.usage.correct');
  INSERT INTO commercial.measurement_corrections(tenant_id, measurement_id, reason, compensating_value, unit, created_by_membership_id)
  VALUES ('00000000-0000-4000-8000-000000000011', '83000000-0000-4000-8000-000000000011', 'TEST_ONLY correction', -1, 'request', '30000000-0000-4000-8000-000000000055');
  RESET ROLE;
END $$;
