BEGIN;

-- PostgreSQL does not permit CREATE OR REPLACE to change OUT parameters, so
-- the canonical function is replaced transactionally under the same identity.
DROP FUNCTION platform.issue_tenant_context(text, uuid, text);

CREATE FUNCTION platform.issue_tenant_context(
  trusted_external_subject text,
  requested_tenant_id uuid,
  required_permission text
)
RETURNS TABLE (
  context_token uuid,
  user_id uuid,
  tenant_id uuid,
  tenant_slug text,
  tenant_display_name text,
  valid_until timestamptz
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
    WHERE u.external_subject = trusted_external_subject
      AND u.status = 'ACTIVE'
      AND m.status = 'ACTIVE'
      AND t.status = 'ACTIVE'
      AND t.id = requested_tenant_id
      AND platform.is_tenant_action_authorized(u.id, t.id, required_permission)
  ), issued AS (
    INSERT INTO platform.tenant_context_grants AS issued_grant
      (tenant_id, user_id, membership_id, permission_key)
    SELECT resolved_tenant_id, resolved_user_id, resolved_membership_id, required_permission
    FROM authorized_context
    RETURNING issued_grant.token, issued_grant.user_id, issued_grant.tenant_id,
              issued_grant.expires_at
  )
  SELECT i.token, i.user_id, i.tenant_id,
         a.resolved_tenant_slug, a.resolved_tenant_name, i.expires_at
  FROM issued AS i
  JOIN authorized_context AS a
    ON a.resolved_user_id = i.user_id AND a.resolved_tenant_id = i.tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION platform.issue_tenant_context(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.issue_tenant_context(text, uuid, text)
  TO acs_phase1_context_issuer;

COMMIT;
