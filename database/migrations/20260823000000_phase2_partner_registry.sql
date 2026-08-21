BEGIN;

CREATE TABLE commercial.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  partner_code text NOT NULL CHECK (length(trim(partner_code)) BETWEEN 1 AND 80),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id)
);
CREATE UNIQUE INDEX partners_tenant_code_unique ON commercial.partners (tenant_id, lower(trim(partner_code)));
CREATE INDEX partners_tenant_list_idx ON commercial.partners (tenant_id, id);
CREATE TABLE commercial.partner_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  operation text NOT NULL CHECK (operation IN ('commercial.partner.create','commercial.partner.update','commercial.partner.admin')),
  resource_id uuid NOT NULL, request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, idempotency_key)
);
INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.partner.read','Read tenant-scoped commercial partners'),
 ('commercial.partner.create','Create tenant-scoped commercial partners'),
 ('commercial.partner.update','Update permitted commercial partner attributes'),
 ('commercial.partner.admin','Administer the minimal commercial partner lifecycle') ON CONFLICT (permission_key) DO NOTHING;
ALTER TABLE commercial.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.partners FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.partner_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.partner_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY partners_read ON commercial.partners FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.admin'));
CREATE POLICY partners_create ON commercial.partners FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.partner.create'));
CREATE POLICY partners_update ON commercial.partners FOR UPDATE USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.admin')) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.partner.update') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.partner.admin'));
CREATE POLICY partner_operations_scope ON commercial.partner_operations FOR ALL USING (platform.has_trusted_tenant_context(tenant_id,NULL,operation)) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY audit_logs_partner_insert ON platform.audit_logs FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.partner.create') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.partner.update') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.partner.admin'));
CREATE POLICY domain_events_partner_insert ON platform.domain_events FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.admin'));
REVOKE ALL ON ALL TABLES IN SCHEMA commercial FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial, platform TO acs_phase2_partner_registry;
GRANT SELECT, INSERT, UPDATE ON commercial.partners TO acs_phase2_partner_registry;
GRANT SELECT, INSERT ON commercial.partner_operations TO acs_phase2_partner_registry;
GRANT INSERT ON platform.audit_logs, platform.domain_events TO acs_phase2_partner_registry;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text), platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_partner_registry;
COMMIT;
