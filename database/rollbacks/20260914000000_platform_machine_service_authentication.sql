BEGIN;
DROP FUNCTION IF EXISTS platform.machine_auth_issue_context(uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS platform.machine_auth_set_permission(uuid,uuid,text,boolean,uuid,uuid,text,text);
DROP FUNCTION IF EXISTS platform.machine_auth_disable(uuid,uuid,uuid,uuid,text,text);
DROP FUNCTION IF EXISTS platform.machine_auth_revoke(uuid,uuid,uuid,uuid,uuid,text,text);
DROP FUNCTION IF EXISTS platform.machine_auth_rotate(uuid,uuid,uuid,uuid,text,timestamptz,uuid,uuid,text,text);
DROP FUNCTION IF EXISTS platform.machine_auth_resolve(uuid);
DROP FUNCTION IF EXISTS platform.machine_auth_provision(uuid,text,text,uuid,text,timestamptz,uuid,uuid,text,text);
DELETE FROM platform.tenant_context_grants WHERE principal_kind='MACHINE'
  AND machine_principal_id IN (SELECT machine_principal_id FROM platform.machine_credentials);
DROP TABLE IF EXISTS platform.machine_credentials;
DELETE FROM platform.tenant_context_grants WHERE permission_key IN
  ('platform.machine_principals.provision','platform.machine_credentials.manage','platform.machine_permissions.manage');
DELETE FROM platform.membership_permissions WHERE permission_key IN
  ('platform.machine_principals.provision','platform.machine_credentials.manage','platform.machine_permissions.manage');
DELETE FROM platform.role_permissions WHERE permission_key IN
  ('platform.machine_principals.provision','platform.machine_credentials.manage','platform.machine_permissions.manage');
DELETE FROM platform.permissions WHERE permission_key IN
  ('platform.machine_principals.provision','platform.machine_credentials.manage','platform.machine_permissions.manage');
COMMIT;
