BEGIN;

CREATE SCHEMA IF NOT EXISTS platform;

CREATE OR REPLACE FUNCTION platform.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION platform.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE TABLE platform.tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.users (
  id uuid PRIMARY KEY,
  external_subject text NOT NULL UNIQUE CHECK (length(external_subject) BETWEEN 1 AND 255),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.memberships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants (id),
  user_id uuid NOT NULL REFERENCES platform.users (id),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX memberships_user_tenant_status_idx
  ON platform.memberships (user_id, tenant_id, status);

CREATE TABLE platform.audit_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants (id),
  actor_user_id uuid NOT NULL REFERENCES platform.users (id),
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  outcome text NOT NULL CHECK (outcome IN ('ALLOWED', 'DENIED')),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_tenant_occurred_idx
  ON platform.audit_logs (tenant_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION platform.resolve_tenant_context(
  trusted_external_subject text,
  requested_tenant_id uuid
)
RETURNS TABLE (
  user_id uuid,
  tenant_id uuid,
  tenant_slug text,
  tenant_display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT u.id, t.id, t.slug, t.display_name
  FROM platform.users AS u
  JOIN platform.memberships AS m ON m.user_id = u.id
  JOIN platform.tenants AS t ON t.id = m.tenant_id
  WHERE u.external_subject = trusted_external_subject
    AND u.status = 'ACTIVE'
    AND m.status = 'ACTIVE'
    AND t.status = 'ACTIVE'
    AND t.id = requested_tenant_id;
$$;

CREATE OR REPLACE FUNCTION platform.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'platform audit records are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON platform.audit_logs
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();

ALTER TABLE platform.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_isolation ON platform.tenants
  FOR SELECT
  USING (id = platform.current_tenant_id());

CREATE POLICY memberships_isolation ON platform.memberships
  FOR SELECT
  USING (
    tenant_id = platform.current_tenant_id()
    AND user_id = platform.current_user_id()
  );

CREATE POLICY audit_logs_isolation ON platform.audit_logs
  FOR SELECT
  USING (tenant_id = platform.current_tenant_id());

CREATE POLICY audit_logs_insert_scope ON platform.audit_logs
  FOR INSERT
  WITH CHECK (
    tenant_id = platform.current_tenant_id()
    AND actor_user_id = platform.current_user_id()
  );

REVOKE ALL ON SCHEMA platform FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA platform FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.resolve_tenant_context(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.reject_audit_mutation() FROM PUBLIC;

COMMENT ON FUNCTION platform.resolve_tenant_context(text, uuid) IS
  'Minimal trusted-subject resolver. Callers receive a context only for an active user, membership, and tenant.';
COMMENT ON TABLE platform.audit_logs IS
  'Append-only tenant-scoped security and access audit records.';

COMMIT;
