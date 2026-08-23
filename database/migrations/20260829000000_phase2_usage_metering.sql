BEGIN;

CREATE TABLE commercial.measurement_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  machine_principal_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  descriptor text CHECK (descriptor IS NULL OR length(btrim(descriptor)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','REVOKED')),
  credential_id uuid NOT NULL DEFAULT gen_random_uuid(),
  credential_hash text NOT NULL CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
  credential_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  credential_rotated_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id),
  UNIQUE (machine_principal_id, tenant_id),
  FOREIGN KEY (machine_principal_id, tenant_id)
    REFERENCES platform.machine_principals(id, tenant_id),
  UNIQUE (tenant_id, credential_id)
);
CREATE INDEX measurement_sources_tenant_list_idx ON commercial.measurement_sources(tenant_id, id);

CREATE TABLE commercial.raw_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  source_id uuid NOT NULL,
  source_event_id text NOT NULL CHECK (length(btrim(source_event_id)) BETWEEN 1 AND 256),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  subscription_id uuid NOT NULL,
  entitlement_id uuid NOT NULL,
  plan_feature_id uuid,
  measurement_type text NOT NULL CHECK (length(btrim(measurement_type)) BETWEEN 1 AND 100),
  value numeric NOT NULL,
  unit text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 32),
  event_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL CHECK (status IN ('ACCEPTED','REJECTED')),
  rejection_code text CHECK (rejection_code IS NULL OR length(btrim(rejection_code)) BETWEEN 1 AND 100),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, source_id, source_event_id),
  FOREIGN KEY (source_id, tenant_id) REFERENCES commercial.measurement_sources(id, tenant_id),
  FOREIGN KEY (subscription_id, tenant_id) REFERENCES commercial.subscriptions(id, tenant_id),
  FOREIGN KEY (entitlement_id, tenant_id) REFERENCES commercial.entitlements(id, tenant_id)
);
CREATE INDEX raw_measurements_tenant_list_idx ON commercial.raw_measurements(tenant_id, id);

CREATE TABLE commercial.measurement_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  measurement_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  compensating_value numeric NOT NULL,
  unit text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 32),
  status text NOT NULL DEFAULT 'APPLIED' CHECK (status = 'APPLIED'),
  created_by_membership_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (measurement_id, tenant_id) REFERENCES commercial.raw_measurements(id, tenant_id),
  FOREIGN KEY (created_by_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id)
);
CREATE INDEX measurement_corrections_tenant_measurement_idx ON commercial.measurement_corrections(tenant_id, measurement_id, id);

CREATE TABLE commercial.usage_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  subscription_id uuid NOT NULL,
  entitlement_id uuid NOT NULL,
  plan_feature_id uuid,
  measurement_type text NOT NULL CHECK (length(btrim(measurement_type)) BETWEEN 1 AND 100),
  unit text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 32),
  time_bucket text NOT NULL CHECK (time_bucket IN ('HOURLY','DAILY')),
  bucket_start timestamptz NOT NULL,
  aggregate_value numeric NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (subscription_id, tenant_id) REFERENCES commercial.subscriptions(id, tenant_id),
  FOREIGN KEY (entitlement_id, tenant_id) REFERENCES commercial.entitlements(id, tenant_id)
);
CREATE UNIQUE INDEX usage_aggregates_dimensions_unique ON commercial.usage_aggregates(tenant_id, subscription_id, entitlement_id, measurement_type, unit, time_bucket, bucket_start, COALESCE(plan_feature_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE commercial.usage_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  operation text NOT NULL CHECK (operation IN ('commercial.usage.correct','commercial.usage.source.manage','commercial.usage.replay')),
  resource_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

INSERT INTO platform.permissions(permission_key, description) VALUES
  ('commercial.usage.read','Read tenant-scoped usage measurements and aggregates'),
  ('commercial.usage.ingest','Ingest tenant-scoped measurements as an authenticated machine principal'),
  ('commercial.usage.correct','Apply an append-only usage measurement correction'),
  ('commercial.usage.source.read','Read tenant-scoped measurement sources'),
  ('commercial.usage.source.manage','Manage tenant-scoped measurement sources'),
  ('commercial.usage.replay','Replay a rejected or accepted measurement under controlled authorization')
ON CONFLICT (permission_key) DO NOTHING;

ALTER TABLE commercial.measurement_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.measurement_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.raw_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.raw_measurements FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.measurement_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.measurement_corrections FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.usage_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.usage_aggregates FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.usage_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.usage_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY measurement_sources_scope ON commercial.measurement_sources FOR ALL
  USING (platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.source.read') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.source.manage'))
  WITH CHECK (platform.has_trusted_tenant_context(tenant_id, created_by, 'commercial.usage.source.manage') OR platform.has_trusted_tenant_context(tenant_id, updated_by, 'commercial.usage.source.manage'));
CREATE POLICY raw_measurements_scope ON commercial.raw_measurements FOR ALL
  USING (platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.read') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.correct') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.replay') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.ingest'))
  WITH CHECK (platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.replay') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.ingest'));
CREATE POLICY measurement_corrections_scope ON commercial.measurement_corrections FOR ALL
  USING (platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.read') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.correct'))
  WITH CHECK (platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.correct'));
CREATE POLICY usage_aggregates_scope ON commercial.usage_aggregates FOR ALL
  USING (platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.read') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.correct') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.replay') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.ingest'))
  WITH CHECK (platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.correct') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.replay') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.ingest'));
CREATE POLICY usage_operations_scope ON commercial.usage_operations FOR ALL
  USING (platform.has_trusted_tenant_context(tenant_id, NULL, operation))
  WITH CHECK (platform.has_trusted_tenant_context(tenant_id, actor_user_id, operation));
CREATE POLICY usage_subscriptions_read ON commercial.subscriptions FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.read') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.replay') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.ingest')
);
CREATE POLICY usage_entitlements_read ON commercial.entitlements FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.read') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.replay') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.ingest')
);
CREATE POLICY usage_memberships_read ON platform.memberships FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.correct') OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.source.manage')
);
CREATE POLICY audit_logs_usage_insert ON platform.audit_logs FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id, actor_user_id, 'commercial.usage.correct') OR
  platform.has_trusted_tenant_context(tenant_id, actor_user_id, 'commercial.usage.source.manage') OR
  (actor_kind = 'MACHINE' AND actor_user_id IS NULL AND
   platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.ingest'))
);
CREATE POLICY domain_events_usage_insert ON platform.domain_events FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.correct') OR
  platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.source.manage') OR
  platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.usage.ingest')
);

CREATE OR REPLACE FUNCTION commercial.resolve_measurement_source_credential(
  supplied_credential_id uuid
)
RETURNS TABLE (
  source_id uuid,
  tenant_id uuid,
  machine_principal_id uuid,
  credential_hash text,
  source_status text,
  principal_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.id, s.tenant_id, s.machine_principal_id, s.credential_hash,
         s.status, p.status
  FROM commercial.measurement_sources s
  JOIN platform.machine_principals p
    ON p.id = s.machine_principal_id AND p.tenant_id = s.tenant_id
  WHERE s.credential_id = supplied_credential_id;
$$;

REVOKE ALL ON commercial.measurement_sources, commercial.raw_measurements, commercial.measurement_corrections, commercial.usage_aggregates, commercial.usage_operations FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial, platform TO acs_phase2_usage_metering;
GRANT SELECT, INSERT, UPDATE ON commercial.measurement_sources TO acs_phase2_usage_metering;
GRANT SELECT, INSERT ON commercial.raw_measurements, commercial.measurement_corrections TO acs_phase2_usage_metering;
GRANT SELECT, INSERT, UPDATE ON commercial.usage_aggregates, commercial.usage_operations TO acs_phase2_usage_metering;
GRANT SELECT ON commercial.subscriptions, commercial.entitlements, platform.memberships TO acs_phase2_usage_metering;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid, text), platform.has_trusted_tenant_context(uuid, uuid, text) TO acs_phase2_usage_metering;
GRANT EXECUTE ON FUNCTION platform.create_machine_principal(uuid,text,text,text,text), platform.set_machine_principal_status(uuid,uuid,text,text) TO acs_phase2_usage_metering;
GRANT EXECUTE ON FUNCTION commercial.resolve_measurement_source_credential(uuid) TO acs_phase2_usage_metering;
GRANT INSERT ON platform.audit_logs, platform.domain_events TO acs_phase2_usage_metering;
COMMIT;
