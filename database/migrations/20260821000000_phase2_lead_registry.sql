BEGIN;

CREATE TABLE commercial.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  source text CHECK (source IS NULL OR length(trim(source)) BETWEEN 1 AND 80),
  contact_name text CHECK (contact_name IS NULL OR length(trim(contact_name)) BETWEEN 1 AND 160),
  contact_email text CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','QUALIFIED','DISQUALIFIED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id)
);
CREATE INDEX leads_tenant_list_idx ON commercial.leads (tenant_id, id);
CREATE TABLE commercial.lead_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  operation text NOT NULL CHECK (operation IN ('commercial.lead.create','commercial.lead.update','commercial.lead.admin')),
  resource_id uuid NOT NULL, request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, idempotency_key)
);
INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.lead.read','Read tenant-scoped commercial leads'),
 ('commercial.lead.create','Create tenant-scoped commercial leads'),
 ('commercial.lead.update','Update permitted commercial lead attributes'),
 ('commercial.lead.admin','Administer the minimal commercial lead lifecycle') ON CONFLICT (permission_key) DO NOTHING;
ALTER TABLE commercial.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.leads FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.lead_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.lead_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY leads_read ON commercial.leads FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.admin'));
CREATE POLICY leads_create ON commercial.leads FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.lead.create'));
CREATE POLICY leads_update ON commercial.leads FOR UPDATE USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.admin')) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.lead.update') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.lead.admin'));
CREATE POLICY lead_operations_scope ON commercial.lead_operations FOR ALL USING (platform.has_trusted_tenant_context(tenant_id,NULL,operation)) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY audit_logs_lead_insert ON platform.audit_logs FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.lead.create') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.lead.update') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.lead.admin'));
CREATE POLICY domain_events_lead_insert ON platform.domain_events FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.admin'));
REVOKE ALL ON ALL TABLES IN SCHEMA commercial FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial, platform TO acs_phase2_lead_registry;
GRANT SELECT, INSERT, UPDATE ON commercial.leads TO acs_phase2_lead_registry;
GRANT SELECT, INSERT ON commercial.lead_operations TO acs_phase2_lead_registry;
GRANT INSERT ON platform.audit_logs, platform.domain_events TO acs_phase2_lead_registry;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text), platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_lead_registry;
COMMENT ON TABLE commercial.leads IS 'Tenant-owned Phase 2 Lead Registry source of truth; pre-opportunity only.';
COMMENT ON COLUMN commercial.leads.contact_email IS 'Optional CONFIDENTIAL_PII contact; prohibited from events, logs and metrics.';
COMMIT;
