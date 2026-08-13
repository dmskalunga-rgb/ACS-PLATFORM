BEGIN;

ALTER TABLE platform.memberships ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE platform.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  role_key text NOT NULL CHECK (role_key ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, role_key), UNIQUE (id, tenant_id)
);
CREATE TABLE platform.role_permissions (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), role_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES platform.permissions(permission_key),
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(), assigned_by uuid NOT NULL REFERENCES platform.users(id),
  PRIMARY KEY (tenant_id, role_id, permission_key),
  FOREIGN KEY (role_id, tenant_id) REFERENCES platform.roles(id, tenant_id)
);
CREATE TABLE platform.membership_roles (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), membership_id uuid NOT NULL, role_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(), assigned_by uuid NOT NULL REFERENCES platform.users(id),
  PRIMARY KEY (tenant_id, membership_id, role_id),
  FOREIGN KEY (membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (role_id, tenant_id) REFERENCES platform.roles(id, tenant_id)
);
CREATE TABLE platform.administrative_operations (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id), idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id), operation text NOT NULL, resource_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'), result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (tenant_id, idempotency_key)
);
CREATE TABLE platform.domain_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  schema_version text NOT NULL DEFAULT '1.0.0', tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL, causation_id uuid,
  producer text NOT NULL DEFAULT 'acs-platform-api', classification text NOT NULL DEFAULT 'INTERNAL', payload jsonb NOT NULL
);
CREATE INDEX roles_tenant_status_idx ON platform.roles (tenant_id, status);
CREATE INDEX membership_roles_membership_idx ON platform.membership_roles (tenant_id, membership_id);
CREATE INDEX role_permissions_permission_idx ON platform.role_permissions (tenant_id, permission_key);
CREATE INDEX domain_events_tenant_time_idx ON platform.domain_events (tenant_id, occurred_at DESC);

INSERT INTO platform.permissions (permission_key, description) VALUES
 ('platform.memberships.read', 'Read tenant memberships and assigned roles'),
 ('platform.memberships.manage', 'Activate or deactivate tenant memberships'),
 ('platform.roles.read', 'Read tenant roles and permissions'),
 ('platform.roles.manage', 'Assign or remove tenant roles') ON CONFLICT (permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION platform.is_tenant_action_authorized(p_user_id uuid, p_tenant_id uuid, p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, platform AS $$
 SELECT EXISTS (
  SELECT 1 FROM platform.memberships m JOIN platform.tenants t ON t.id=m.tenant_id
  WHERE m.user_id=p_user_id AND m.tenant_id=p_tenant_id AND m.status='ACTIVE' AND t.status='ACTIVE' AND (
   EXISTS (SELECT 1 FROM platform.membership_permissions mp WHERE mp.membership_id=m.id AND mp.tenant_id=m.tenant_id AND mp.permission_key=p_permission_key)
   OR EXISTS (SELECT 1 FROM platform.membership_roles mr JOIN platform.roles r ON r.id=mr.role_id AND r.tenant_id=mr.tenant_id
    JOIN platform.role_permissions rp ON rp.role_id=r.id AND rp.tenant_id=r.tenant_id
    WHERE mr.membership_id=m.id AND mr.tenant_id=m.tenant_id AND r.status='ACTIVE' AND rp.permission_key=p_permission_key)
  )
 );
$$;

CREATE OR REPLACE FUNCTION platform.reject_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'domain events are append-only' USING ERRCODE='42501'; END; $$;
CREATE TRIGGER domain_events_append_only BEFORE UPDATE OR DELETE ON platform.domain_events
FOR EACH ROW EXECUTE FUNCTION platform.reject_event_mutation();

ALTER TABLE platform.roles ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.role_permissions ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.membership_roles ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.membership_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.administrative_operations ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.administrative_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.domain_events ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.domain_events FORCE ROW LEVEL SECURITY;

CREATE POLICY roles_scope ON platform.roles FOR ALL USING (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'))
 WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'));
CREATE POLICY role_permissions_scope ON platform.role_permissions FOR ALL USING (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'))
 WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'));
CREATE POLICY membership_roles_scope ON platform.membership_roles FOR ALL USING (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'))
 WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'));
CREATE POLICY administrative_operations_scope ON platform.administrative_operations FOR ALL USING (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.manage') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'))
 WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.manage') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'));
CREATE POLICY domain_events_scope ON platform.domain_events FOR SELECT USING (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.read') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.read'));
CREATE POLICY domain_events_insert_scope ON platform.domain_events FOR INSERT WITH CHECK (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.manage') OR platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'));
CREATE POLICY memberships_admin_scope ON platform.memberships FOR UPDATE
 USING (platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.manage'))
 WITH CHECK (platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.manage'));
CREATE POLICY memberships_admin_read ON platform.memberships FOR SELECT USING (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.read') OR
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.memberships.manage') OR
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.roles.manage'));

CREATE POLICY audit_logs_admin_insert ON platform.audit_logs FOR INSERT WITH CHECK (
 platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.memberships.manage') OR
 platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.roles.manage'));

GRANT USAGE ON SCHEMA platform TO acs_phase1_tenant_admin;
GRANT SELECT, UPDATE ON platform.memberships TO acs_phase1_tenant_admin;
GRANT SELECT ON platform.users, platform.tenants TO acs_phase1_tenant_admin;
GRANT SELECT, INSERT, DELETE ON platform.membership_roles TO acs_phase1_tenant_admin;
GRANT SELECT ON platform.roles, platform.role_permissions TO acs_phase1_tenant_admin;
GRANT SELECT, INSERT ON platform.administrative_operations TO acs_phase1_tenant_admin;
GRANT INSERT ON platform.audit_logs, platform.domain_events TO acs_phase1_tenant_admin;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text), platform.has_trusted_tenant_context(uuid,uuid,text) TO acs_phase1_tenant_admin;
COMMIT;
