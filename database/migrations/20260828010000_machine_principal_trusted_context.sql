BEGIN;

CREATE TABLE platform.machine_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  principal_type text NOT NULL CHECK (principal_type ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  external_binding text NOT NULL CHECK (length(external_binding) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','REVOKED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, principal_type, external_binding)
);

CREATE TABLE platform.machine_principal_permissions (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  machine_principal_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES platform.permissions(permission_key),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, machine_principal_id, permission_key),
  FOREIGN KEY (machine_principal_id, tenant_id)
    REFERENCES platform.machine_principals(id, tenant_id)
);

ALTER TABLE platform.tenant_context_grants
  ADD COLUMN principal_kind text NOT NULL DEFAULT 'HUMAN'
    CHECK (principal_kind IN ('HUMAN','MACHINE')),
  ADD COLUMN machine_principal_id uuid REFERENCES platform.machine_principals(id),
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN membership_id DROP NOT NULL,
  ADD CONSTRAINT tenant_context_grants_principal_mode CHECK (
    (principal_kind = 'HUMAN' AND user_id IS NOT NULL AND membership_id IS NOT NULL AND machine_principal_id IS NULL)
    OR
    (principal_kind = 'MACHINE' AND user_id IS NULL AND membership_id IS NULL AND machine_principal_id IS NOT NULL)
  );

ALTER TABLE platform.audit_logs
  ADD COLUMN actor_kind text NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_kind IN ('HUMAN','MACHINE')),
  ADD COLUMN machine_principal_id uuid REFERENCES platform.machine_principals(id),
  ALTER COLUMN actor_user_id DROP NOT NULL,
  ADD CONSTRAINT audit_logs_actor_mode CHECK (
    (actor_kind = 'HUMAN' AND actor_user_id IS NOT NULL AND machine_principal_id IS NULL)
    OR
    (actor_kind = 'MACHINE' AND actor_user_id IS NULL AND machine_principal_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION platform.issue_machine_tenant_context(
  authenticated_machine_principal_id uuid,
  requested_tenant_id uuid,
  required_permission text
)
RETURNS TABLE (context_token uuid, machine_principal_id uuid, tenant_id uuid)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH authorized AS (
    SELECT p.id, p.tenant_id
    FROM platform.machine_principals p
    JOIN platform.tenants t ON t.id = p.tenant_id
    JOIN platform.machine_principal_permissions pp
      ON pp.machine_principal_id = p.id AND pp.tenant_id = p.tenant_id
    WHERE p.id = authenticated_machine_principal_id
      AND p.tenant_id = requested_tenant_id
      AND p.status = 'ACTIVE'
      AND t.status = 'ACTIVE'
      AND pp.permission_key = required_permission
  ), issued AS (
    INSERT INTO platform.tenant_context_grants(
      tenant_id, principal_kind, machine_principal_id, permission_key
    )
    SELECT tenant_id, 'MACHINE', id, required_permission FROM authorized
    RETURNING token, machine_principal_id, tenant_id
  )
  SELECT token, machine_principal_id, tenant_id FROM issued;
$$;

CREATE OR REPLACE FUNCTION platform.create_machine_principal(
  requested_tenant_id uuid,
  requested_principal_type text,
  requested_external_binding text,
  requested_machine_permission text,
  required_human_permission text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE created_id uuid;
BEGIN
  IF NOT platform.has_trusted_tenant_context(requested_tenant_id, NULL, required_human_permission)
     OR requested_machine_permission <> 'commercial.usage.ingest' THEN
    RETURN NULL;
  END IF;
  INSERT INTO platform.machine_principals(tenant_id, principal_type, external_binding)
  VALUES(requested_tenant_id, requested_principal_type, requested_external_binding)
  RETURNING id INTO created_id;
  INSERT INTO platform.machine_principal_permissions(tenant_id, machine_principal_id, permission_key)
  VALUES(requested_tenant_id, created_id, requested_machine_permission);
  RETURN created_id;
END;
$$;

CREATE OR REPLACE FUNCTION platform.set_machine_principal_status(
  requested_machine_principal_id uuid,
  requested_tenant_id uuid,
  requested_status text,
  required_human_permission text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT platform.has_trusted_tenant_context(requested_tenant_id, NULL, required_human_permission)
     OR requested_status NOT IN ('ACTIVE','DISABLED','REVOKED') THEN RETURN false; END IF;
  UPDATE platform.machine_principals
  SET status=requested_status, version=version+1, updated_at=clock_timestamp()
  WHERE id=requested_machine_principal_id AND tenant_id=requested_tenant_id
    AND NOT (status='REVOKED' AND requested_status<>'REVOKED');
  RETURN FOUND;
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
  resolved_machine_principal_id uuid;
  resolved_principal_kind text;
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
    AND (
      g.principal_kind = 'HUMAN'
      OR EXISTS (
        SELECT 1 FROM platform.machine_principals p
        WHERE p.id = g.machine_principal_id
          AND p.tenant_id = g.tenant_id
          AND p.status = 'ACTIVE'
      )
    )
  RETURNING g.user_id, g.machine_principal_id, g.principal_kind, g.tenant_id
  INTO resolved_user_id, resolved_machine_principal_id, resolved_principal_kind, resolved_tenant_id;

  IF resolved_principal_kind IS NULL THEN RETURN; END IF;

  SELECT t.slug, t.display_name INTO resolved_tenant_slug, resolved_tenant_name
  FROM platform.tenants t WHERE t.id = resolved_tenant_id AND t.status = 'ACTIVE';
  IF resolved_tenant_slug IS NULL THEN RETURN; END IF;

  PERFORM set_config('app.context_token', supplied_token::text, true);
  PERFORM set_config('app.principal_kind', resolved_principal_kind, true);
  PERFORM set_config(
    'app.principal_id',
    COALESCE(resolved_user_id, resolved_machine_principal_id)::text,
    true
  );
  RETURN QUERY SELECT resolved_user_id, resolved_tenant_id,
                      resolved_tenant_slug, resolved_tenant_name;
END;
$$;

REVOKE ALL ON platform.machine_principals, platform.machine_principal_permissions FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.issue_machine_tenant_context(uuid,uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO acs_machine_context_issuer;
GRANT EXECUTE ON FUNCTION platform.issue_machine_tenant_context(uuid,uuid,text)
  TO acs_machine_context_issuer;
COMMIT;
