BEGIN;

CREATE TABLE commercial.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  opportunity_code text NOT NULL CHECK (length(trim(opportunity_code)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  owner_membership_id uuid NOT NULL,
  customer_id uuid, lead_id uuid, partner_id uuid, plan_id uuid,
  probability_percent integer CHECK (probability_percent BETWEEN 0 AND 100),
  expected_close_date date,
  stage text NOT NULL DEFAULT 'QUALIFICATION' CHECK (stage IN ('QUALIFICATION','DISCOVERY','PROPOSAL','NEGOTIATION','WON','LOST')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (owner_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (customer_id, tenant_id) REFERENCES commercial.customers(id, tenant_id),
  FOREIGN KEY (lead_id, tenant_id) REFERENCES commercial.leads(id, tenant_id),
  FOREIGN KEY (partner_id, tenant_id) REFERENCES commercial.partners(id, tenant_id),
  FOREIGN KEY (plan_id, tenant_id) REFERENCES commercial.plans(id, tenant_id)
);
CREATE UNIQUE INDEX opportunities_tenant_code_unique ON commercial.opportunities (tenant_id, lower(trim(opportunity_code)));
CREATE INDEX opportunities_tenant_list_idx ON commercial.opportunities (tenant_id, id);
CREATE TABLE commercial.opportunity_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  operation text NOT NULL CHECK (operation IN ('commercial.opportunity.create','commercial.opportunity.update','commercial.opportunity.admin')),
  resource_id uuid NOT NULL, request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, idempotency_key)
);
INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.opportunity.read','Read tenant-scoped commercial opportunities'),
 ('commercial.opportunity.create','Create tenant-scoped commercial opportunities'),
 ('commercial.opportunity.update','Update permitted commercial opportunity attributes'),
 ('commercial.opportunity.admin','Administer the frozen commercial opportunity lifecycle') ON CONFLICT (permission_key) DO NOTHING;
ALTER TABLE commercial.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.opportunities FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.opportunity_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial.opportunity_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY opportunities_read ON commercial.opportunities FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.admin'));
CREATE POLICY opportunities_create ON commercial.opportunities FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.opportunity.create'));
CREATE POLICY opportunities_update ON commercial.opportunities FOR UPDATE USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.admin')) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.opportunity.admin'));
CREATE POLICY opportunity_operations_scope ON commercial.opportunity_operations FOR ALL USING (platform.has_trusted_tenant_context(tenant_id,NULL,operation)) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY audit_logs_opportunity_insert ON platform.audit_logs FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.opportunity.create') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.opportunity.admin'));
CREATE POLICY domain_events_opportunity_insert ON platform.domain_events FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.admin'));
ALTER POLICY memberships_isolation ON platform.memberships USING (
  platform.has_trusted_tenant_context(tenant_id, user_id, 'platform.context.read')
  OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.opportunity.read')
  OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.opportunity.create')
  OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.opportunity.update')
  OR platform.has_trusted_tenant_context(tenant_id, NULL, 'commercial.opportunity.admin')
);
ALTER POLICY customers_read ON commercial.customers USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.customer.admin') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.admin')
);
ALTER POLICY leads_read ON commercial.leads USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.lead.admin') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.admin')
);
ALTER POLICY partners_read ON commercial.partners USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.partner.admin') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.admin')
);
ALTER POLICY plans_read ON commercial.plans USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.plan.admin') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.opportunity.admin')
);
REVOKE ALL ON ALL TABLES IN SCHEMA commercial FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial, platform TO acs_phase2_opportunity_registry;
GRANT SELECT, INSERT, UPDATE ON commercial.opportunities TO acs_phase2_opportunity_registry;
GRANT SELECT, INSERT ON commercial.opportunity_operations TO acs_phase2_opportunity_registry;
GRANT INSERT ON platform.audit_logs, platform.domain_events TO acs_phase2_opportunity_registry;
GRANT SELECT ON platform.memberships TO acs_phase2_opportunity_registry;
GRANT SELECT ON commercial.customers, commercial.leads, commercial.partners, commercial.plans TO acs_phase2_opportunity_registry;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text), platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_opportunity_registry;
COMMIT;
