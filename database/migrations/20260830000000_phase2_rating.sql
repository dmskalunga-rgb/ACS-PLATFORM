BEGIN;

ALTER TABLE platform.domain_events DROP CONSTRAINT domain_events_event_type_check;
ALTER TABLE platform.domain_events ADD CONSTRAINT domain_events_event_type_check CHECK (
  event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  OR event_type IN (
    'commercial.rating.rate-plan.created',
    'commercial.rating.rate-plan.submitted',
    'commercial.rating.rate-plan.approved',
    'commercial.rating.rate-plan.activated',
    'commercial.rating.rate-plan.superseded',
    'commercial.rating.rate-plan.retired'
  )
);

CREATE TABLE commercial.rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  owner_membership_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES platform.users(id),
  updated_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id), UNIQUE (tenant_id, code),
  FOREIGN KEY (owner_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id)
);
CREATE TABLE commercial.rate_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  rate_plan_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','SUPERSEDED','RETIRED')),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code = 'USD'),
  currency_minor_scale smallint NOT NULL DEFAULT 2 CHECK (currency_minor_scale = 2),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_by_membership_id uuid NOT NULL,
  approved_by_membership_id uuid,
  activated_by_membership_id uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id), UNIQUE (tenant_id, rate_plan_id, version_number),
  FOREIGN KEY (rate_plan_id, tenant_id) REFERENCES commercial.rate_plans(id, tenant_id),
  FOREIGN KEY (created_by_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (approved_by_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (activated_by_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (approved_by_membership_id IS NULL OR approved_by_membership_id <> created_by_membership_id),
  CHECK (activated_by_membership_id IS NULL OR activated_by_membership_id <> created_by_membership_id)
);
CREATE TABLE commercial.rate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id), rate_plan_version_id uuid NOT NULL,
  measurement_type text NOT NULL CHECK (length(btrim(measurement_type)) BETWEEN 1 AND 100), unit text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 32),
  pricing_model text NOT NULL CHECK (pricing_model IN ('FLAT','PER_UNIT','TIERED_GRADUATED')),
  flat_amount numeric(24,8), unit_rate numeric(24,8), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,tenant_id), UNIQUE(tenant_id,rate_plan_version_id,measurement_type,unit),
  FOREIGN KEY(rate_plan_version_id,tenant_id) REFERENCES commercial.rate_plan_versions(id,tenant_id),
  CHECK ((pricing_model='FLAT' AND flat_amount IS NOT NULL AND unit_rate IS NULL) OR (pricing_model='PER_UNIT' AND unit_rate IS NOT NULL AND flat_amount IS NULL) OR (pricing_model='TIERED_GRADUATED' AND flat_amount IS NULL AND unit_rate IS NULL))
);
CREATE TABLE commercial.rate_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id), rate_rule_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0), lower_bound numeric(24,8) NOT NULL CHECK(lower_bound >= 0), upper_bound numeric(24,8), unit_rate numeric(24,8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(id,tenant_id), UNIQUE(tenant_id,rate_rule_id,ordinal),
  FOREIGN KEY(rate_rule_id,tenant_id) REFERENCES commercial.rate_rules(id,tenant_id), CHECK(upper_bound IS NULL OR upper_bound > lower_bound)
);
CREATE TABLE commercial.rating_applicabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id), subscription_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL, rate_plan_version_id uuid NOT NULL, effective_from timestamptz NOT NULL, effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(id,tenant_id),
  FOREIGN KEY(subscription_id,tenant_id) REFERENCES commercial.subscriptions(id,tenant_id),
  FOREIGN KEY(rate_plan_id,tenant_id) REFERENCES commercial.rate_plans(id,tenant_id),
  FOREIGN KEY(rate_plan_version_id,tenant_id) REFERENCES commercial.rate_plan_versions(id,tenant_id), CHECK(effective_to IS NULL OR effective_to > effective_from)
);
CREATE TABLE commercial.rated_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id), subscription_id uuid NOT NULL, entitlement_id uuid NOT NULL,
  usage_aggregate_id uuid NOT NULL, usage_window text NOT NULL CHECK(usage_window IN ('HOURLY','DAILY')),
  measurement_type text NOT NULL CHECK(length(btrim(measurement_type)) BETWEEN 1 AND 100), quantity numeric(24,8) NOT NULL, unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 32),
  rate_plan_id uuid NOT NULL, rate_plan_version_id uuid NOT NULL, pricing_model text NOT NULL CHECK(pricing_model IN ('FLAT','PER_UNIT','TIERED_GRADUATED')),
  currency_code text NOT NULL CHECK(currency_code='USD'), rate_evidence jsonb NOT NULL, pre_tax_amount numeric(19,4) NOT NULL,
  rounding_mode text NOT NULL DEFAULT 'HALF_UP' CHECK(rounding_mode='HALF_UP'), calculation_version integer NOT NULL DEFAULT 1 CHECK(calculation_version>0),
  status text NOT NULL DEFAULT 'RATED' CHECK(status IN ('RATED','SUPERSEDED')), supersedes_rated_fact_id uuid, rerating_reason text CHECK(rerating_reason IS NULL OR length(btrim(rerating_reason)) BETWEEN 1 AND 500), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,tenant_id), FOREIGN KEY(subscription_id,tenant_id) REFERENCES commercial.subscriptions(id,tenant_id), FOREIGN KEY(entitlement_id,tenant_id) REFERENCES commercial.entitlements(id,tenant_id), FOREIGN KEY(usage_aggregate_id,tenant_id) REFERENCES commercial.usage_aggregates(id,tenant_id), FOREIGN KEY(rate_plan_id,tenant_id) REFERENCES commercial.rate_plans(id,tenant_id), FOREIGN KEY(rate_plan_version_id,tenant_id) REFERENCES commercial.rate_plan_versions(id,tenant_id), FOREIGN KEY(supersedes_rated_fact_id,tenant_id) REFERENCES commercial.rated_facts(id,tenant_id)
);
CREATE TABLE commercial.rating_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL, actor_user_id uuid NOT NULL REFERENCES platform.users(id), operation text NOT NULL CHECK(operation IN ('commercial.rating.rate-plan.create','commercial.rating.rate-plan.update','commercial.rating.rate-plan.approve','commercial.rating.rate-plan.activate','commercial.rating.execute','commercial.rating.rerate')), resource_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'), result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,idempotency_key)
);

CREATE INDEX rate_plans_tenant_idx ON commercial.rate_plans(tenant_id,id);
CREATE INDEX rate_plan_versions_effective_idx ON commercial.rate_plan_versions(tenant_id,rate_plan_id,effective_from,effective_to);
CREATE INDEX rating_applicabilities_effective_idx ON commercial.rating_applicabilities(tenant_id,subscription_id,effective_from,effective_to);
CREATE INDEX rated_facts_tenant_idx ON commercial.rated_facts(tenant_id,id);

CREATE FUNCTION commercial.rating_prevent_historical_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'rate_plan_versions' AND TG_OP = 'UPDATE' AND (
    (OLD.status = 'DRAFT' AND NEW.status = 'DRAFT') OR (
      (OLD.status, NEW.status) IN (('DRAFT','PENDING_APPROVAL'),('PENDING_APPROVAL','APPROVED'),('APPROVED','ACTIVE'),('ACTIVE','SUPERSEDED'),('APPROVED','RETIRED'),('ACTIVE','RETIRED'))
      AND (to_jsonb(NEW) - ARRAY['status','version','approved_by_membership_id','activated_by_membership_id','updated_at']) = (to_jsonb(OLD) - ARRAY['status','version','approved_by_membership_id','activated_by_membership_id','updated_at'])
    )
  ) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'rated_facts' AND OLD.status = 'RATED' AND NEW.status = 'SUPERSEDED'
    AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Rating historical monetary policy is immutable';
END; $$;
CREATE FUNCTION commercial.rating_prevent_rate_plan_version_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM commercial.rate_plan_versions v
    WHERE v.id <> NEW.id AND v.tenant_id = NEW.tenant_id AND v.rate_plan_id = NEW.rate_plan_id
      AND tstzrange(v.effective_from, COALESCE(v.effective_to, 'infinity'::timestamptz), '[)') && tstzrange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::timestamptz), '[)')
  ) THEN RAISE EXCEPTION 'Overlapping Rate Plan Version effective windows are prohibited'; END IF;
  RETURN NEW;
END; $$;
CREATE FUNCTION commercial.rating_prevent_applicability_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM commercial.rating_applicabilities a
    WHERE a.id <> NEW.id AND a.tenant_id = NEW.tenant_id AND a.subscription_id = NEW.subscription_id
      AND tstzrange(a.effective_from, COALESCE(a.effective_to, 'infinity'::timestamptz), '[)') && tstzrange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::timestamptz), '[)')
  ) THEN RAISE EXCEPTION 'Overlapping Rating applicability effective windows are prohibited'; END IF;
  RETURN NEW;
END; $$;
CREATE FUNCTION commercial.rating_prevent_tier_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM commercial.rate_tiers t
    WHERE t.id <> NEW.id AND t.tenant_id = NEW.tenant_id AND t.rate_rule_id = NEW.rate_rule_id
      AND numrange(t.lower_bound, COALESCE(t.upper_bound, 'infinity'::numeric), '[)') && numrange(NEW.lower_bound, COALESCE(NEW.upper_bound, 'infinity'::numeric), '[)')
  ) THEN RAISE EXCEPTION 'Overlapping graduated Rating tiers are prohibited'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER rate_plan_versions_immutable BEFORE UPDATE OR DELETE ON commercial.rate_plan_versions FOR EACH ROW EXECUTE FUNCTION commercial.rating_prevent_historical_mutation();
CREATE TRIGGER rated_facts_immutable BEFORE UPDATE OR DELETE ON commercial.rated_facts FOR EACH ROW EXECUTE FUNCTION commercial.rating_prevent_historical_mutation();
CREATE TRIGGER rate_plan_versions_no_overlap BEFORE INSERT OR UPDATE ON commercial.rate_plan_versions FOR EACH ROW EXECUTE FUNCTION commercial.rating_prevent_rate_plan_version_overlap();
CREATE TRIGGER rating_applicabilities_no_overlap BEFORE INSERT OR UPDATE ON commercial.rating_applicabilities FOR EACH ROW EXECUTE FUNCTION commercial.rating_prevent_applicability_overlap();
CREATE TRIGGER rate_tiers_no_overlap BEFORE INSERT OR UPDATE ON commercial.rate_tiers FOR EACH ROW EXECUTE FUNCTION commercial.rating_prevent_tier_overlap();

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('commercial.rating.read','Read tenant-scoped commercial Rating artifacts'),
 ('commercial.rating.rate-plan.read','Read tenant-scoped Rate Plans'),
 ('commercial.rating.rate-plan.create','Create tenant-scoped Rate Plan drafts'),
 ('commercial.rating.rate-plan.update','Update tenant-scoped Rate Plan drafts'),
 ('commercial.rating.rate-plan.approve','Approve tenant-scoped Rate Plan versions'),
 ('commercial.rating.rate-plan.activate','Activate tenant-scoped Rate Plan versions'),
 ('commercial.rating.execute','Execute server-controlled commercial rating'),
 ('commercial.rating.rerate','Perform governed commercial rerating'),
 ('commercial.rating.adjust','Reserved; no executable initial Rating adjustment behavior') ON CONFLICT(permission_key) DO NOTHING;

ALTER TABLE commercial.rate_plans ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.rate_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.rate_plan_versions ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.rate_plan_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.rate_rules ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.rate_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.rate_tiers ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.rate_tiers FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.rating_applicabilities ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.rating_applicabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.rated_facts ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.rated_facts FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial.rating_operations ENABLE ROW LEVEL SECURITY; ALTER TABLE commercial.rating_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY rating_rate_plans_scope ON commercial.rate_plans FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.activate')) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,created_by,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,updated_by,'commercial.rating.rate-plan.update'));
CREATE POLICY rating_versions_scope ON commercial.rate_plan_versions FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.activate') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate')) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.activate'));
CREATE POLICY rating_rules_scope ON commercial.rate_rules FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate')) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update'));
CREATE POLICY rating_tiers_scope ON commercial.rate_tiers FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate')) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update'));
CREATE POLICY rating_applicabilities_scope ON commercial.rating_applicabilities FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate')) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update'));
CREATE POLICY rated_facts_scope ON commercial.rated_facts FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate')) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate'));
CREATE POLICY rating_operations_scope ON commercial.rating_operations FOR ALL USING(platform.has_trusted_tenant_context(tenant_id,NULL,operation)) WITH CHECK(platform.has_trusted_tenant_context(tenant_id,actor_user_id,operation));
CREATE POLICY rating_subscriptions_read ON commercial.subscriptions FOR SELECT USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate'));
CREATE POLICY rating_entitlements_read ON commercial.entitlements FOR SELECT USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate'));
CREATE POLICY rating_usage_read ON commercial.usage_aggregates FOR SELECT USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate'));
CREATE POLICY rating_memberships_read ON platform.memberships FOR SELECT USING(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.activate'));
CREATE POLICY audit_logs_rating_insert ON platform.audit_logs FOR INSERT WITH CHECK(platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.rating.rate-plan.approve') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.rating.rate-plan.activate') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,actor_user_id,'commercial.rating.rerate'));
CREATE POLICY domain_events_rating_insert ON platform.domain_events FOR INSERT WITH CHECK(platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.create') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.update') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.approve') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rate-plan.activate') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.execute') OR platform.has_trusted_tenant_context(tenant_id,NULL,'commercial.rating.rerate'));

REVOKE ALL ON commercial.rate_plans,commercial.rate_plan_versions,commercial.rate_rules,commercial.rate_tiers,commercial.rating_applicabilities,commercial.rated_facts,commercial.rating_operations FROM PUBLIC;
GRANT USAGE ON SCHEMA commercial,platform TO acs_phase2_rating;
GRANT SELECT,INSERT ON commercial.rate_plans,commercial.rate_rules,commercial.rate_tiers,commercial.rating_applicabilities TO acs_phase2_rating;
GRANT UPDATE(name,updated_by,updated_at) ON commercial.rate_plans TO acs_phase2_rating;
GRANT SELECT,INSERT ON commercial.rated_facts TO acs_phase2_rating;
GRANT UPDATE(status) ON commercial.rated_facts TO acs_phase2_rating;
GRANT SELECT,INSERT,UPDATE ON commercial.rate_plan_versions,commercial.rating_operations TO acs_phase2_rating;
GRANT SELECT ON commercial.subscriptions,commercial.entitlements,commercial.usage_aggregates,platform.memberships TO acs_phase2_rating;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_phase2_rating;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase2_rating;
COMMIT;
