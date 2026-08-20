BEGIN;

CREATE SCHEMA commercial;

CREATE TABLE commercial.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  reference_code text CHECK (reference_code IS NULL OR length(trim(reference_code)) BETWEEN 1 AND 80),
  contact_email text CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id)
);
CREATE UNIQUE INDEX customers_tenant_reference_unique
  ON commercial.customers (tenant_id, lower(reference_code)) WHERE reference_code IS NOT NULL;
CREATE INDEX customers_tenant_list_idx ON commercial.customers (tenant_id, id);

CREATE TABLE commercial.customer_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  operation text NOT NULL CHECK (operation IN ('commercial.customer.create','commercial.customer.update','commercial.customer.admin')),
  resource_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.customer.read','Read tenant-scoped commercial customers'),
 ('commercial.customer.create','Create tenant-scoped commercial customers'),
 ('commercial.customer.update','Update permitted commercial customer attributes'),
 ('commercial.customer.admin','Administer the minimal commercial customer lifecycle')
ON CONFLICT (permission_key) DO NOTHING;

ALTER TABLE commercial.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.customer_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.customer_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY customers_read ON commercial.customers FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.read') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.admin'));
CREATE POLICY customers_create ON commercial.customers FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.customer.create'));
CREATE POLICY customers_update ON commercial.customers FOR UPDATE USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.admin'))
WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.customer.update') OR
  platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.customer.admin'));
CREATE POLICY customer_operations_scope ON commercial.customer_operations FOR ALL USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,operation))
WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY audit_logs_customer_insert ON platform.audit_logs FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.customer.create') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.customer.update') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.customer.admin'));
CREATE POLICY domain_events_customer_insert ON platform.domain_events FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.admin'));

REVOKE ALL ON SCHEMA commercial FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA commercial FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial, platform TO acs_phase2_customer_registry;
GRANT SELECT, INSERT, UPDATE ON commercial.customers TO acs_phase2_customer_registry;
GRANT SELECT, INSERT ON commercial.customer_operations TO acs_phase2_customer_registry;
GRANT INSERT ON platform.audit_logs, platform.domain_events TO acs_phase2_customer_registry;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),
  platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_customer_registry;

COMMENT ON TABLE commercial.customers IS
  'Tenant-owned Phase 2 Customer Registry source of truth; customer is not a platform tenant.';
COMMENT ON COLUMN commercial.customers.contact_email IS
  'Optional CONFIDENTIAL_PII operational contact; prohibited from events, logs and metrics.';

COMMIT;
