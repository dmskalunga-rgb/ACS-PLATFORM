CREATE OR REPLACE FUNCTION platform.list_active_tenant_memberships(
  trusted_external_subject text
)
RETURNS TABLE (
  membership_id uuid,
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
  SELECT m.id, u.id, t.id, t.slug, t.display_name
  FROM platform.users AS u
  JOIN platform.memberships AS m ON m.user_id = u.id
  JOIN platform.tenants AS t ON t.id = m.tenant_id
  WHERE u.external_subject = trusted_external_subject
    AND u.status = 'ACTIVE'
    AND m.status = 'ACTIVE'
    AND t.status = 'ACTIVE'
  ORDER BY t.slug, m.id;
$$;

REVOKE ALL ON FUNCTION platform.list_active_tenant_memberships(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.list_active_tenant_memberships(text)
  TO acs_phase1_context_issuer;
