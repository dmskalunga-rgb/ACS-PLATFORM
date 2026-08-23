BEGIN;
CREATE TABLE commercial.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  subscription_id uuid NOT NULL, customer_id uuid NOT NULL, contract_id uuid NOT NULL,
  source_contract_line_item_id uuid NOT NULL, plan_id uuid NOT NULL, plan_feature_id uuid,
  content_model text NOT NULL DEFAULT 'PLAN_LINE_ACCESS' CHECK(content_model='PLAN_LINE_ACCESS'),
  owner_membership_id uuid NOT NULL, created_by_membership_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_ACTIVATION','ACTIVE','SUSPENDED','CANCELLED','TERMINATED')),
  effective_from timestamptz NOT NULL, effective_until timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0), created_by uuid NOT NULL REFERENCES platform.users(id), updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,tenant_id), UNIQUE(tenant_id,subscription_id,source_contract_line_item_id),
  FOREIGN KEY(subscription_id,tenant_id) REFERENCES commercial.subscriptions(id,tenant_id),
  FOREIGN KEY(customer_id,tenant_id) REFERENCES commercial.customers(id,tenant_id),
  FOREIGN KEY(contract_id,tenant_id) REFERENCES commercial.contracts(id,tenant_id),
  FOREIGN KEY(owner_membership_id,tenant_id) REFERENCES platform.memberships(id,tenant_id),
  FOREIGN KEY(created_by_membership_id,tenant_id) REFERENCES platform.memberships(id,tenant_id),
  CHECK(effective_until IS NULL OR effective_until>effective_from)
);
CREATE INDEX entitlements_tenant_list_idx ON commercial.entitlements(tenant_id,id);
CREATE TABLE commercial.entitlement_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entitlement_id uuid NOT NULL, tenant_id uuid NOT NULL REFERENCES platform.tenants(id), version bigint NOT NULL,
 subscription_id uuid NOT NULL, customer_id uuid NOT NULL, contract_id uuid NOT NULL, source_contract_line_item_id uuid NOT NULL, plan_id uuid NOT NULL, plan_feature_id uuid,
 owner_membership_id uuid NOT NULL, status text NOT NULL, effective_from timestamptz NOT NULL, effective_until timestamptz, captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(entitlement_id,version), FOREIGN KEY(entitlement_id,tenant_id) REFERENCES commercial.entitlements(id,tenant_id) ON DELETE RESTRICT
);
CREATE TABLE commercial.entitlement_operations (
 tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL, actor_user_id uuid NOT NULL REFERENCES platform.users(id), operation text NOT NULL, resource_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'), result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,idempotency_key)
);
INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.entitlement.read','Read tenant-scoped entitlements'),('commercial.entitlement.create','Create entitlement from active subscription'),('commercial.entitlement.update','Update entitlement drafts'),('commercial.entitlement.assign','Assign entitlement owner'),('commercial.entitlement.request_activation','Request entitlement activation'),('commercial.entitlement.activate','Activate entitlement'),('commercial.entitlement.suspend','Suspend entitlement'),('commercial.entitlement.resume','Resume entitlement'),('commercial.entitlement.cancel','Cancel entitlement'),('commercial.entitlement.terminate','Terminate entitlement') ON CONFLICT(permission_key) DO NOTHING;
ALTER TABLE commercial.entitlements ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.entitlement_history ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.entitlement_history FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.entitlement_operations ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.entitlement_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY entitlements_scope ON commercial.entitlements FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.assign') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.request_activation') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.activate') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.suspend') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.resume') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.cancel') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.terminate')) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.entitlement.create') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.entitlement.update') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.entitlement.assign') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.entitlement.request_activation') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.entitlement.activate') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.entitlement.suspend') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.entitlement.resume') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.entitlement.cancel') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.entitlement.terminate'));
CREATE POLICY entitlement_history_scope ON commercial.entitlement_history FOR ALL USING(EXISTS(SELECT 1 FROM commercial.entitlements e WHERE e.id=entitlement_id AND e.tenant_id=entitlement_history.tenant_id)) WITH CHECK(EXISTS(SELECT 1 FROM commercial.entitlements e WHERE e.id=entitlement_id AND e.tenant_id=entitlement_history.tenant_id));
CREATE POLICY entitlement_operations_scope ON commercial.entitlement_operations FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,operation)) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY entitlement_memberships_read ON platform.memberships FOR SELECT USING(
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.assign') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.request_activation') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.activate') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.suspend') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.resume') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.cancel') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.terminate')
);
CREATE POLICY entitlement_subscriptions_read ON commercial.subscriptions FOR SELECT USING(
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.create')
);
CREATE POLICY entitlement_subscription_origins_read ON commercial.subscription_plan_origins FOR SELECT USING(
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.create')
);
CREATE POLICY audit_logs_entitlement_insert ON platform.audit_logs FOR INSERT WITH CHECK(
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.create') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.update') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.assign') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.request_activation') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.activate') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.suspend') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.resume') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.cancel') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.entitlement.terminate')
);
CREATE POLICY domain_events_entitlement_insert ON platform.domain_events FOR INSERT WITH CHECK(
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.create') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.update') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.assign') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.request_activation') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.activate') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.suspend') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.resume') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.cancel') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.entitlement.terminate')
);
REVOKE ALL ON commercial.entitlements,commercial.entitlement_history,commercial.entitlement_operations FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial,platform TO acs_phase2_entitlement_registry;
GRANT SELECT,INSERT,UPDATE ON commercial.entitlements TO acs_phase2_entitlement_registry;
GRANT SELECT,INSERT ON commercial.entitlement_history TO acs_phase2_entitlement_registry;
-- PostgreSQL requires UPDATE privilege for the row lock used to serialize
-- tenant-scoped idempotency-key reads; the role still has no DELETE privilege.
GRANT SELECT,INSERT,UPDATE ON commercial.entitlement_operations TO acs_phase2_entitlement_registry;
GRANT SELECT ON commercial.subscriptions,commercial.subscription_plan_origins,commercial.contracts,commercial.customers,platform.memberships TO acs_phase2_entitlement_registry;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_phase2_entitlement_registry;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_entitlement_registry;
COMMIT;
