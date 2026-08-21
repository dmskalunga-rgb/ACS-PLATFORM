BEGIN;

CREATE TABLE commercial.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  plan_code text NOT NULL CHECK (length(trim(plan_code)) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR length(trim(description)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id)
);
CREATE UNIQUE INDEX plans_tenant_code_unique ON commercial.plans (tenant_id, lower(trim(plan_code)));
CREATE INDEX plans_tenant_list_idx ON commercial.plans (tenant_id, id);

CREATE TABLE commercial.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  feature_code text NOT NULL CHECK (length(trim(feature_code)) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR length(trim(description)) BETWEEN 1 AND 2000),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (plan_id, tenant_id) REFERENCES commercial.plans(id, tenant_id),
  UNIQUE (id, tenant_id)
);
CREATE UNIQUE INDEX plan_features_plan_code_unique ON commercial.plan_features (plan_id, lower(trim(feature_code)));
CREATE INDEX plan_features_tenant_plan_list_idx ON commercial.plan_features (tenant_id, plan_id, id);

CREATE TABLE commercial.plan_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  operation text NOT NULL CHECK (operation IN ('commercial.plan.create','commercial.plan.update','commercial.plan.admin')),
  resource_id uuid NOT NULL, request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.plan.read','Read tenant-scoped commercial plans'),
 ('commercial.plan.create','Create tenant-scoped commercial plans'),
 ('commercial.plan.update','Update permitted commercial plan attributes'),
 ('commercial.plan.admin','Administer the minimal commercial plan lifecycle') ON CONFLICT (permission_key) DO NOTHING;

ALTER TABLE commercial.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.plans FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.plan_features FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.plan_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.plan_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY plans_read ON commercial.plans FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.admin'));
CREATE POLICY plans_create ON commercial.plans FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.plan.create'));
CREATE POLICY plans_update ON commercial.plans FOR UPDATE USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.admin')) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.plan.admin'));
CREATE POLICY plan_features_read ON commercial.plan_features FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.admin'));
CREATE POLICY plan_features_create ON commercial.plan_features FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.plan.create'));
CREATE POLICY plan_features_update ON commercial.plan_features FOR UPDATE USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.admin')) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.plan.admin'));
CREATE POLICY plan_operations_scope ON commercial.plan_operations FOR ALL USING (platform.has_trusted_tenant_context(tenant_id,NULL,operation)) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY audit_logs_plan_insert ON platform.audit_logs FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.plan.create') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.plan.admin'));
CREATE POLICY domain_events_plan_insert ON platform.domain_events FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.admin'));
REVOKE ALL ON ALL TABLES IN SCHEMA commercial FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial, platform TO acs_phase2_plan_catalog;
GRANT SELECT, INSERT, UPDATE ON commercial.plans, commercial.plan_features TO acs_phase2_plan_catalog;
GRANT SELECT, INSERT ON commercial.plan_operations TO acs_phase2_plan_catalog;
GRANT INSERT ON platform.audit_logs, platform.domain_events TO acs_phase2_plan_catalog;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text), platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_plan_catalog;
COMMIT;
