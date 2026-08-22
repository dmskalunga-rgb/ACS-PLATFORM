BEGIN;

CREATE TABLE commercial.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  proposal_code text NOT NULL CHECK (length(trim(proposal_code)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  opportunity_id uuid NOT NULL,
  customer_id uuid,
  partner_id uuid,
  owner_membership_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
  issued_at timestamptz,
  valid_until timestamptz NOT NULL,
  revision_number bigint NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  proposal_subtotal numeric(19,4) NOT NULL DEFAULT 0,
  grand_total numeric(19,4) NOT NULL DEFAULT 0,
  approved_by_membership_id uuid,
  approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (opportunity_id, tenant_id) REFERENCES commercial.opportunities(id, tenant_id),
  FOREIGN KEY (customer_id, tenant_id) REFERENCES commercial.customers(id, tenant_id),
  FOREIGN KEY (partner_id, tenant_id) REFERENCES commercial.partners(id, tenant_id),
  FOREIGN KEY (owner_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (created_by_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (approved_by_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  CHECK ((approved_by_membership_id IS NULL) = (approved_at IS NULL))
);
CREATE UNIQUE INDEX proposals_tenant_code_unique ON commercial.proposals(tenant_id, lower(trim(proposal_code)));
CREATE INDEX proposals_tenant_list_idx ON commercial.proposals(tenant_id, id);

CREATE TABLE commercial.proposal_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  line_number integer NOT NULL CHECK (line_number > 0),
  plan_id uuid NOT NULL,
  plan_name_snapshot text NOT NULL CHECK (length(trim(plan_name_snapshot)) BETWEEN 1 AND 160),
  description_snapshot text NOT NULL DEFAULT '',
  quantity numeric(19,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(19,4) NOT NULL,
  line_subtotal numeric(19,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (proposal_id, line_number), UNIQUE(id, tenant_id),
  FOREIGN KEY (proposal_id, tenant_id) REFERENCES commercial.proposals(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (plan_id, tenant_id) REFERENCES commercial.plans(id, tenant_id)
);

CREATE TABLE commercial.proposal_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  revision_number bigint NOT NULL CHECK (revision_number > 0),
  proposal_code text NOT NULL, title text NOT NULL, opportunity_id uuid NOT NULL,
  customer_id uuid, partner_id uuid, owner_membership_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL, currency_code text NOT NULL,
  status text NOT NULL, valid_until timestamptz NOT NULL,
  proposal_subtotal numeric(19,4) NOT NULL, grand_total numeric(19,4) NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(proposal_id, revision_number), UNIQUE(id, tenant_id),
  FOREIGN KEY (proposal_id, tenant_id) REFERENCES commercial.proposals(id, tenant_id) ON DELETE RESTRICT
);
CREATE TABLE commercial.proposal_revision_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_revision_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  line_number integer NOT NULL CHECK (line_number > 0), plan_id uuid NOT NULL,
  plan_name_snapshot text NOT NULL, description_snapshot text NOT NULL,
  quantity numeric(19,4) NOT NULL, unit_price numeric(19,4) NOT NULL, line_subtotal numeric(19,4) NOT NULL,
  UNIQUE(proposal_revision_id, line_number),
  FOREIGN KEY (proposal_revision_id, tenant_id) REFERENCES commercial.proposal_revisions(id, tenant_id) ON DELETE RESTRICT
);
CREATE TABLE commercial.proposal_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id), operation text NOT NULL,
  resource_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,idempotency_key)
);

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.proposal.read','Read tenant-scoped commercial proposals'),('commercial.proposal.create','Create tenant-scoped commercial proposals'),
 ('commercial.proposal.update','Update proposal drafts'),('commercial.proposal.assign','Assign proposal owners'),
 ('commercial.proposal.approve','Approve a proposal created by another membership'),('commercial.proposal.revise','Revise approved proposals'),
 ('commercial.proposal.send','Mark approved proposals as sent'),('commercial.proposal.accept','Accept sent proposals'),
 ('commercial.proposal.reject','Reject sent proposals'),('commercial.proposal.cancel','Cancel approved or sent proposals'),
 ('commercial.proposal.expire','Expire elapsed sent proposals'),('commercial.proposal.admin','Administer proposal scope without bypassing invariants')
 ON CONFLICT(permission_key) DO NOTHING;

ALTER TABLE commercial.proposals ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.proposal_line_items ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.proposal_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.proposal_revisions ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.proposal_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.proposal_revision_line_items ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.proposal_revision_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.proposal_operations ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.proposal_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY proposals_scope ON commercial.proposals FOR ALL USING (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.assign') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.revise') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.send') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.accept') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.reject') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.cancel') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.expire') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.admin')) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.proposal.create') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.update') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.assign') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.approve') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.revise') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.send') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.accept') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.reject') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.cancel') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.expire') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.proposal.admin'));
CREATE POLICY proposal_line_items_scope ON commercial.proposal_line_items FOR ALL USING (EXISTS(SELECT 1 FROM commercial.proposals p WHERE p.id=proposal_id AND p.tenant_id=proposal_line_items.tenant_id)) WITH CHECK (EXISTS(SELECT 1 FROM commercial.proposals p WHERE p.id=proposal_id AND p.tenant_id=proposal_line_items.tenant_id));
CREATE POLICY proposal_revisions_scope ON commercial.proposal_revisions FOR SELECT USING (EXISTS(SELECT 1 FROM commercial.proposals p WHERE p.id=proposal_id AND p.tenant_id=proposal_revisions.tenant_id));
CREATE POLICY proposal_revisions_insert ON commercial.proposal_revisions FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.revise'));
CREATE POLICY proposal_revision_lines_scope ON commercial.proposal_revision_line_items FOR SELECT USING (EXISTS(SELECT 1 FROM commercial.proposal_revisions r WHERE r.id=proposal_revision_id AND r.tenant_id=proposal_revision_line_items.tenant_id));
CREATE POLICY proposal_revision_lines_insert ON commercial.proposal_revision_line_items FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.revise'));
CREATE POLICY proposal_operations_scope ON commercial.proposal_operations FOR ALL USING (platform.has_trusted_tenant_context(tenant_id,NULL,operation)) WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY proposal_memberships_read ON platform.memberships FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.read') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.assign') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.approve') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.revise') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.send') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.accept') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.reject') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.cancel') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.expire') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.admin')
);
CREATE POLICY proposal_opportunities_read ON commercial.opportunities FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.read') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.assign') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.approve') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.revise') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.send') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.accept') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.reject') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.cancel') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.expire') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.admin')
);
CREATE POLICY proposal_customers_read ON commercial.customers FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.assign') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.approve')
);
CREATE POLICY proposal_partners_read ON commercial.partners FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.assign') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.approve')
);
CREATE POLICY proposal_plans_read ON commercial.plans FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.assign') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.approve')
);
CREATE POLICY audit_logs_proposal_insert ON platform.audit_logs FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.create') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.update') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.assign') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.approve') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.revise') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.send') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.accept') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.reject') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.cancel') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.expire') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.proposal.admin'));
CREATE POLICY domain_events_proposal_insert ON platform.domain_events FOR INSERT WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.assign') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.revise') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.send') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.accept') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.reject') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.cancel') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.proposal.expire'));

REVOKE ALL ON ALL TABLES IN SCHEMA commercial FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial,platform TO acs_phase2_proposal_registry;
GRANT SELECT,INSERT,UPDATE ON commercial.proposals TO acs_phase2_proposal_registry;
GRANT SELECT,INSERT,UPDATE,DELETE ON commercial.proposal_line_items TO acs_phase2_proposal_registry;
GRANT SELECT,INSERT ON commercial.proposal_revisions,commercial.proposal_revision_line_items,commercial.proposal_operations TO acs_phase2_proposal_registry;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_phase2_proposal_registry;
GRANT SELECT ON platform.memberships,commercial.opportunities,commercial.customers,commercial.partners,commercial.plans TO acs_phase2_proposal_registry;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_proposal_registry;
COMMIT;
