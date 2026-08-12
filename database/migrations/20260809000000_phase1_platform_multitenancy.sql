BEGIN;

CREATE SCHEMA IF NOT EXISTS platform;

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
  UNIQUE (tenant_id, user_id),
  UNIQUE (id, tenant_id)
);

CREATE INDEX memberships_user_tenant_status_idx
  ON platform.memberships (user_id, tenant_id, status);

CREATE TABLE platform.permissions (
  permission_key text PRIMARY KEY CHECK (permission_key ~ '^[a-z][a-z0-9_.:-]{2,119}$'),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform.permissions (permission_key, description)
VALUES ('platform.context.read', 'Read the authenticated principal tenant context.');

CREATE TABLE platform.membership_permissions (
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES platform.permissions (permission_key),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, membership_id, permission_key),
  FOREIGN KEY (membership_id, tenant_id) REFERENCES platform.memberships (id, tenant_id)
);

CREATE TABLE platform.tenant_context_grants (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants (id),
  user_id uuid NOT NULL REFERENCES platform.users (id),
  membership_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES platform.permissions (permission_key),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '30 seconds'),
  activated_at timestamptz,
  activated_backend_pid integer,
  activated_transaction_id bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (membership_id, tenant_id) REFERENCES platform.memberships (id, tenant_id),
  CHECK (
    (activated_at IS NULL AND activated_backend_pid IS NULL AND activated_transaction_id IS NULL)
    OR
    (activated_at IS NOT NULL AND activated_backend_pid IS NOT NULL AND activated_transaction_id IS NOT NULL)
  )
);

CREATE INDEX tenant_context_grants_expiry_idx ON platform.tenant_context_grants (expires_at);

CREATE TABLE platform.audit_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants (id),
  actor_user_id uuid NOT NULL REFERENCES platform.users (id),
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  resource text NOT NULL CHECK (length(resource) BETWEEN 1 AND 200),
  outcome text NOT NULL CHECK (outcome IN ('ALLOWED', 'DENIED')),
  classification text NOT NULL DEFAULT 'SECURITY' CHECK (classification = 'SECURITY'),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 2048
  ),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX audit_logs_tenant_occurred_idx
  ON platform.audit_logs (tenant_id, occurred_at DESC);

CREATE TABLE platform.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_fingerprint text CHECK (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  requested_tenant_id uuid,
  selector_fingerprint text CHECK (selector_fingerprint ~ '^[a-f0-9]{64}$'),
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  resource text NOT NULL CHECK (length(resource) BETWEEN 1 AND 200),
  outcome text NOT NULL DEFAULT 'DENIED' CHECK (outcome = 'DENIED'),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  classification text NOT NULL DEFAULT 'SECURITY' CHECK (classification = 'SECURITY'),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX security_audit_logs_occurred_idx
  ON platform.security_audit_logs (occurred_at DESC);

CREATE OR REPLACE FUNCTION platform.resolve_active_tenant_membership(
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

CREATE OR REPLACE FUNCTION platform.is_tenant_action_authorized(
  requested_user_id uuid,
  requested_tenant_id uuid,
  required_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.users AS u
    JOIN platform.memberships AS m ON m.user_id = u.id
    JOIN platform.tenants AS t ON t.id = m.tenant_id
    JOIN platform.membership_permissions AS mp
      ON mp.membership_id = m.id AND mp.tenant_id = m.tenant_id
    WHERE u.id = requested_user_id
      AND t.id = requested_tenant_id
      AND u.status = 'ACTIVE'
      AND m.status = 'ACTIVE'
      AND t.status = 'ACTIVE'
      AND mp.permission_key = required_permission
  );
$$;

CREATE OR REPLACE FUNCTION platform.issue_tenant_context(
  trusted_external_subject text,
  requested_tenant_id uuid,
  required_permission text
)
RETURNS TABLE (
  context_token uuid,
  user_id uuid,
  tenant_id uuid,
  tenant_slug text,
  tenant_display_name text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH authorized_context AS (
    SELECT u.id AS resolved_user_id, t.id AS resolved_tenant_id,
           t.slug AS resolved_tenant_slug, t.display_name AS resolved_tenant_name,
           m.id AS resolved_membership_id
    FROM platform.users AS u
    JOIN platform.memberships AS m ON m.user_id = u.id
    JOIN platform.tenants AS t ON t.id = m.tenant_id
    JOIN platform.membership_permissions AS mp
      ON mp.membership_id = m.id AND mp.tenant_id = m.tenant_id
    WHERE u.external_subject = trusted_external_subject
      AND u.status = 'ACTIVE'
      AND m.status = 'ACTIVE'
      AND t.status = 'ACTIVE'
      AND t.id = requested_tenant_id
      AND mp.permission_key = required_permission
  ), issued AS (
    INSERT INTO platform.tenant_context_grants AS issued_grant
      (tenant_id, user_id, membership_id, permission_key)
    SELECT resolved_tenant_id, resolved_user_id, resolved_membership_id, required_permission
    FROM authorized_context
    RETURNING issued_grant.token, issued_grant.user_id, issued_grant.tenant_id
  )
  SELECT i.token, i.user_id, i.tenant_id,
         a.resolved_tenant_slug, a.resolved_tenant_name
  FROM issued AS i
  JOIN authorized_context AS a
    ON a.resolved_user_id = i.user_id AND a.resolved_tenant_id = i.tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION platform.activate_tenant_context(
  supplied_token uuid,
  required_permission text
)
RETURNS TABLE (
  user_id uuid,
  tenant_id uuid,
  tenant_slug text,
  tenant_display_name text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  resolved_user_id uuid;
  resolved_tenant_id uuid;
  resolved_tenant_slug text;
  resolved_tenant_name text;
BEGIN
  UPDATE platform.tenant_context_grants AS g
  SET activated_at = clock_timestamp(),
      activated_backend_pid = pg_backend_pid(),
      activated_transaction_id = txid_current()
  WHERE g.token = supplied_token
    AND g.permission_key = required_permission
    AND g.activated_at IS NULL
    AND g.expires_at > clock_timestamp()
  RETURNING g.user_id, g.tenant_id
  INTO resolved_user_id, resolved_tenant_id;

  IF resolved_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT t.slug, t.display_name
  INTO resolved_tenant_slug, resolved_tenant_name
  FROM platform.tenants AS t
  WHERE t.id = resolved_tenant_id;

  PERFORM set_config('app.context_token', supplied_token::text, true);
  RETURN QUERY SELECT resolved_user_id, resolved_tenant_id,
                      resolved_tenant_slug, resolved_tenant_name;
END;
$$;

CREATE OR REPLACE FUNCTION platform.has_trusted_tenant_context(
  row_tenant_id uuid,
  row_user_id uuid,
  required_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.tenant_context_grants AS g
    WHERE g.token = CASE
      WHEN current_setting('app.context_token', true) ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN current_setting('app.context_token', true)::uuid
      ELSE NULL
    END
      AND g.tenant_id = row_tenant_id
      AND (row_user_id IS NULL OR g.user_id = row_user_id)
      AND g.permission_key = required_permission
      AND g.activated_backend_pid = pg_backend_pid()
      AND g.activated_transaction_id = txid_current()
      AND g.activated_at IS NOT NULL
      AND g.expires_at > g.activated_at
  );
$$;

CREATE OR REPLACE FUNCTION platform.record_security_denial(
  p_actor_fingerprint text,
  p_requested_tenant_id uuid,
  p_selector_fingerprint text,
  p_reason_code text,
  p_action text,
  p_resource text,
  p_correlation_id text,
  p_request_id text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  INSERT INTO platform.security_audit_logs
    (actor_fingerprint, requested_tenant_id, selector_fingerprint, reason_code,
     action, resource, correlation_id, request_id)
  VALUES
    (p_actor_fingerprint, p_requested_tenant_id, p_selector_fingerprint, p_reason_code,
     p_action, p_resource, p_correlation_id, p_request_id);
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

CREATE TRIGGER security_audit_logs_append_only
BEFORE UPDATE OR DELETE ON platform.security_audit_logs
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();

ALTER TABLE platform.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_isolation ON platform.tenants FOR SELECT
  USING (platform.has_trusted_tenant_context(id, NULL, 'platform.context.read'));

CREATE POLICY memberships_isolation ON platform.memberships FOR SELECT
  USING (platform.has_trusted_tenant_context(tenant_id, user_id, 'platform.context.read'));

CREATE POLICY audit_logs_isolation ON platform.audit_logs FOR SELECT
  USING (platform.has_trusted_tenant_context(tenant_id, NULL, 'platform.context.read'));

CREATE POLICY audit_logs_insert_scope ON platform.audit_logs FOR INSERT
  WITH CHECK (
    platform.has_trusted_tenant_context(tenant_id, actor_user_id, 'platform.context.read')
  );

REVOKE ALL ON SCHEMA platform FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA platform FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA platform FROM PUBLIC;

GRANT USAGE ON SCHEMA platform TO acs_phase1_context_issuer;
GRANT EXECUTE ON FUNCTION platform.resolve_active_tenant_membership(text, uuid),
  platform.is_tenant_action_authorized(uuid, uuid, text),
  platform.issue_tenant_context(text, uuid, text) TO acs_phase1_context_issuer;

GRANT USAGE ON SCHEMA platform TO acs_phase1_tenant_app;
GRANT SELECT ON platform.tenants, platform.memberships, platform.audit_logs
  TO acs_phase1_tenant_app;
GRANT INSERT ON platform.audit_logs TO acs_phase1_tenant_app;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid, text),
  platform.has_trusted_tenant_context(uuid, uuid, text) TO acs_phase1_tenant_app;

GRANT USAGE ON SCHEMA platform TO acs_phase1_security_auditor;
GRANT EXECUTE ON FUNCTION platform.record_security_denial(
  text, uuid, text, text, text, text, text, text
) TO acs_phase1_security_auditor;

COMMENT ON TABLE platform.tenant_context_grants IS
  'Opaque, expiring, one-use grants bound at activation to a backend PID and transaction.';
COMMENT ON COLUMN platform.audit_logs.metadata IS
  'Bounded auxiliary security metadata only; never a substitute for relational domain fields.';
COMMENT ON TABLE platform.security_audit_logs IS
  'Durable redacted denial evidence without tenant existence disclosure to callers.';

COMMIT;
