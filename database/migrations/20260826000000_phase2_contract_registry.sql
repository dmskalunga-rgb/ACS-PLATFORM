BEGIN;

CREATE TABLE commercial.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  source_proposal_id uuid NOT NULL,
  source_proposal_revision_number bigint NOT NULL CHECK (source_proposal_revision_number > 0),
  source_proposal_code text NOT NULL CHECK (length(trim(source_proposal_code)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  opportunity_id uuid NOT NULL,
  customer_id uuid,
  partner_id uuid,
  owner_membership_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','CANCELLED','TERMINATED')),
  effective_from timestamptz,
  effective_until timestamptz,
  revision_number bigint NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  contract_subtotal numeric(19,4) NOT NULL DEFAULT 0,
  grand_total numeric(19,4) NOT NULL DEFAULT 0,
  approved_by_membership_id uuid,
  approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, source_proposal_id),
  FOREIGN KEY (source_proposal_id, tenant_id) REFERENCES commercial.proposals(id, tenant_id),
  FOREIGN KEY (opportunity_id, tenant_id) REFERENCES commercial.opportunities(id, tenant_id),
  FOREIGN KEY (customer_id, tenant_id) REFERENCES commercial.customers(id, tenant_id),
  FOREIGN KEY (partner_id, tenant_id) REFERENCES commercial.partners(id, tenant_id),
  FOREIGN KEY (owner_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (created_by_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (approved_by_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  CHECK ((approved_by_membership_id IS NULL) = (approved_at IS NULL)),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from)
);
CREATE INDEX contracts_tenant_list_idx ON commercial.contracts(tenant_id, id);

CREATE TABLE commercial.contract_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  line_number integer NOT NULL CHECK (line_number > 0),
  source_proposal_line_item_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  plan_name_snapshot text NOT NULL CHECK (length(trim(plan_name_snapshot)) BETWEEN 1 AND 160),
  description_snapshot text NOT NULL DEFAULT '',
  quantity numeric(19,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(19,4) NOT NULL,
  line_subtotal numeric(19,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(contract_id, line_number), UNIQUE(id, tenant_id),
  FOREIGN KEY (contract_id, tenant_id) REFERENCES commercial.contracts(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_proposal_line_item_id, tenant_id) REFERENCES commercial.proposal_line_items(id, tenant_id),
  FOREIGN KEY (plan_id, tenant_id) REFERENCES commercial.plans(id, tenant_id)
);

CREATE TABLE commercial.contract_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  revision_number bigint NOT NULL CHECK (revision_number > 0),
  source_proposal_id uuid NOT NULL, source_proposal_revision_number bigint NOT NULL,
  source_proposal_code text NOT NULL, title text NOT NULL, opportunity_id uuid NOT NULL,
  customer_id uuid, partner_id uuid, owner_membership_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL, currency_code text NOT NULL, status text NOT NULL,
  effective_from timestamptz, effective_until timestamptz,
  contract_subtotal numeric(19,4) NOT NULL, grand_total numeric(19,4) NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(contract_id, revision_number), UNIQUE(id, tenant_id),
  FOREIGN KEY (contract_id, tenant_id) REFERENCES commercial.contracts(id, tenant_id) ON DELETE RESTRICT
);
CREATE TABLE commercial.contract_revision_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_revision_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  line_number integer NOT NULL CHECK (line_number > 0), source_proposal_line_item_id uuid NOT NULL, plan_id uuid NOT NULL,
  plan_name_snapshot text NOT NULL, description_snapshot text NOT NULL,
  quantity numeric(19,4) NOT NULL, unit_price numeric(19,4) NOT NULL, line_subtotal numeric(19,4) NOT NULL,
  UNIQUE(contract_revision_id, line_number),
  FOREIGN KEY (contract_revision_id, tenant_id) REFERENCES commercial.contract_revisions(id, tenant_id) ON DELETE RESTRICT
);
CREATE TABLE commercial.contract_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id), operation text NOT NULL,
  resource_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,idempotency_key)
);

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.contract.read','Read tenant-scoped commercial contracts'),
 ('commercial.contract.create','Create tenant-scoped commercial contracts from accepted proposals'),
 ('commercial.contract.update','Update contract drafts and submit for approval'),
 ('commercial.contract.assign','Assign contract owners before approval'),
 ('commercial.contract.approve','Approve a contract created by another membership'),
 ('commercial.contract.revise','Revise approved contracts'),
 ('commercial.contract.activate','Activate approved contracts'),
 ('commercial.contract.cancel','Cancel approved contracts'),
 ('commercial.contract.terminate','Terminate active contracts'),
 ('commercial.contract.admin','Administer contract scope without bypassing invariants')
ON CONFLICT(permission_key) DO NOTHING;

ALTER TABLE commercial.contracts ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.contract_line_items ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.contract_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.contract_revisions ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.contract_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.contract_revision_line_items ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.contract_revision_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.contract_operations ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.contract_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY contracts_scope ON commercial.contracts FOR ALL USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.assign') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.revise') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.activate') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.cancel') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.terminate') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.admin')
) WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.contract.update') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.contract.assign') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.contract.approve') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.contract.revise') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.contract.activate') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.contract.cancel') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.contract.terminate') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.contract.admin')
);
CREATE POLICY contract_line_items_scope ON commercial.contract_line_items FOR ALL USING (EXISTS(SELECT 1 FROM commercial.contracts c WHERE c.id=contract_id AND c.tenant_id=contract_line_items.tenant_id)) WITH CHECK (EXISTS(SELECT 1 FROM commercial.contracts c WHERE c.id=contract_id AND c.tenant_id=contract_line_items.tenant_id));
CREATE POLICY contract_revisions_scope ON commercial.contract_revisions FOR SELECT USING (EXISTS(SELECT 1 FROM commercial.contracts c WHERE c.id=contract_id AND c.tenant_id=contract_revisions.tenant_id));
CREATE POLICY contract_revisions_insert ON commercial.contract_revisions FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.revise'));
CREATE POLICY contract_revision_lines_scope ON commercial.contract_revision_line_items FOR SELECT USING (EXISTS(SELECT 1 FROM commercial.contract_revisions r WHERE r.id=contract_revision_id AND r.tenant_id=contract_revision_line_items.tenant_id));
CREATE POLICY contract_revision_lines_insert ON commercial.contract_revision_line_items FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.revise'));
CREATE POLICY contract_operations_scope ON commercial.contract_operations FOR ALL USING (platform.has_trusted_tenant_context(tenant_id,NULL,operation)) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY contract_memberships_read ON platform.memberships FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.assign') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.revise') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.activate') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.cancel') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.terminate') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.admin'));
CREATE POLICY contract_proposals_read ON commercial.proposals FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.read'));
CREATE POLICY contract_opportunities_read ON commercial.opportunities FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.read'));
CREATE POLICY contract_customers_read ON commercial.customers FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.read'));
CREATE POLICY contract_partners_read ON commercial.partners FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.read'));
CREATE POLICY contract_plans_read ON commercial.plans FOR SELECT USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.read'));
CREATE POLICY audit_logs_contract_insert ON platform.audit_logs FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.update') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.assign') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.approve') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.revise') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.activate') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.cancel') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.terminate') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.contract.admin'));
CREATE POLICY domain_events_contract_insert ON platform.domain_events FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.revise') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.activate') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.cancel') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.contract.terminate'));

REVOKE ALL ON ALL TABLES IN SCHEMA commercial FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial,platform TO acs_phase2_contract_registry;
GRANT SELECT,INSERT,UPDATE ON commercial.contracts TO acs_phase2_contract_registry;
GRANT SELECT,INSERT,UPDATE,DELETE ON commercial.contract_line_items TO acs_phase2_contract_registry;
GRANT SELECT,INSERT ON commercial.contract_revisions,commercial.contract_revision_line_items,commercial.contract_operations TO acs_phase2_contract_registry;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_phase2_contract_registry;
GRANT SELECT ON platform.memberships,commercial.proposals,commercial.proposal_line_items,commercial.opportunities,commercial.customers,commercial.partners,commercial.plans TO acs_phase2_contract_registry;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_contract_registry;
COMMIT;
