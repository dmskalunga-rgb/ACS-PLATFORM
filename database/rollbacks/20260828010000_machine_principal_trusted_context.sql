BEGIN;
DROP FUNCTION IF EXISTS platform.issue_machine_tenant_context(uuid,uuid,text);
DROP FUNCTION IF EXISTS platform.create_machine_principal(uuid,text,text,text,text);
DROP FUNCTION IF EXISTS platform.set_machine_principal_status(uuid,uuid,text,text);
DROP TRIGGER audit_logs_append_only ON platform.audit_logs;
DELETE FROM platform.audit_logs WHERE actor_kind = 'MACHINE';
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON platform.audit_logs
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
ALTER TABLE platform.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_mode;
ALTER TABLE platform.audit_logs DROP COLUMN IF EXISTS machine_principal_id;
ALTER TABLE platform.audit_logs DROP COLUMN IF EXISTS actor_kind;
ALTER TABLE platform.audit_logs ALTER COLUMN actor_user_id SET NOT NULL;
ALTER TABLE platform.tenant_context_grants DROP CONSTRAINT IF EXISTS tenant_context_grants_principal_mode;
ALTER TABLE platform.tenant_context_grants DROP COLUMN IF EXISTS machine_principal_id;
ALTER TABLE platform.tenant_context_grants DROP COLUMN IF EXISTS principal_kind;
ALTER TABLE platform.tenant_context_grants ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE platform.tenant_context_grants ALTER COLUMN membership_id SET NOT NULL;
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
DROP TABLE IF EXISTS platform.machine_principal_permissions;
DROP TABLE IF EXISTS platform.machine_principals;
COMMIT;
