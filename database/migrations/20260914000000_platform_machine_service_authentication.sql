BEGIN;

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('platform.machine_principals.provision','Provision tenant-bound machine and service principals'),
 ('platform.machine_credentials.manage','Rotate, revoke, or disable machine and service credentials'),
 ('platform.machine_permissions.manage','Grant or remove tenant-bound machine permissions')
ON CONFLICT(permission_key) DO NOTHING;

CREATE TABLE platform.machine_credentials (
  credential_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  machine_principal_id uuid NOT NULL,
  verifier_sha256 text NOT NULL CHECK (verifier_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','SUPERSEDED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES platform.users(id),
  FOREIGN KEY(machine_principal_id,tenant_id)
    REFERENCES platform.machine_principals(id,tenant_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),
  CHECK ((status='ACTIVE' AND revoked_at IS NULL) OR (status<>'ACTIVE' AND revoked_at IS NOT NULL))
);
CREATE INDEX machine_credentials_principal_idx
  ON platform.machine_credentials(tenant_id,machine_principal_id,status);
CREATE UNIQUE INDEX machine_credentials_one_active_idx
  ON platform.machine_credentials(tenant_id,machine_principal_id) WHERE status='ACTIVE';
ALTER TABLE platform.machine_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.machine_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY machine_credentials_manage_scope ON platform.machine_credentials
  FOR SELECT TO acs_platform_machine_auth USING (
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.machine_credentials.manage')
  );
REVOKE ALL ON platform.machine_credentials FROM PUBLIC;

CREATE FUNCTION platform.machine_auth_provision(
  requested_tenant uuid, requested_type text, requested_binding text,
  new_credential_id uuid, new_verifier text, new_expiry timestamptz,
  actor_user uuid, context_token uuid, request_id text, correlation_id text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE created_principal uuid;
BEGIN
  PERFORM platform.activate_tenant_context(context_token,'platform.machine_principals.provision');
  IF NOT platform.has_trusted_tenant_context(requested_tenant,actor_user,'platform.machine_principals.provision')
     OR requested_type NOT IN ('MACHINE','SERVICE','AUTOMATION')
     OR length(requested_binding) NOT BETWEEN 1 AND 200
     OR new_verifier !~ '^[0-9a-f]{64}$'
     OR new_expiry <= clock_timestamp() OR new_expiry > clock_timestamp()+interval '30 days'
  THEN RETURN NULL; END IF;
  INSERT INTO platform.machine_principals(tenant_id,principal_type,external_binding)
  VALUES(requested_tenant,requested_type,requested_binding) RETURNING id INTO created_principal;
  INSERT INTO platform.machine_credentials(credential_id,tenant_id,machine_principal_id,verifier_sha256,expires_at,created_by)
  VALUES(new_credential_id,requested_tenant,created_principal,new_verifier,new_expiry,actor_user);
  INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
  VALUES(gen_random_uuid(),requested_tenant,actor_user,'platform.machine_principals.provision',
    'platform:machine-service-identity','ALLOWED',correlation_id,request_id,
    jsonb_build_object('principal_id',created_principal,'credential_id',new_credential_id,'principal_type',requested_type));
  RETURN created_principal;
END $$;

CREATE FUNCTION platform.machine_auth_resolve(requested_credential_id uuid)
RETURNS TABLE(credential_id uuid,principal_id uuid,principal_type text,tenant_id uuid,
  verifier text,credential_status text,principal_status text,expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT c.credential_id,p.id,p.principal_type,c.tenant_id,c.verifier_sha256,c.status,p.status,c.expires_at
  FROM platform.machine_credentials c JOIN platform.machine_principals p
    ON p.id=c.machine_principal_id AND p.tenant_id=c.tenant_id
  WHERE c.credential_id=requested_credential_id;
$$;

CREATE FUNCTION platform.machine_auth_rotate(
  requested_tenant uuid, requested_principal uuid, expected_credential_id uuid, new_credential_id uuid,
  new_verifier text, new_expiry timestamptz, actor_user uuid,
  context_token uuid, request_id text, correlation_id text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous_id uuid;
BEGIN
  PERFORM platform.activate_tenant_context(context_token,'platform.machine_credentials.manage');
  IF NOT platform.has_trusted_tenant_context(requested_tenant,actor_user,'platform.machine_credentials.manage')
     OR new_verifier !~ '^[0-9a-f]{64}$'
     OR new_expiry <= clock_timestamp() OR new_expiry > clock_timestamp()+interval '30 days'
     OR NOT EXISTS(SELECT 1 FROM platform.machine_principals p WHERE p.id=requested_principal AND p.tenant_id=requested_tenant AND p.status='ACTIVE')
  THEN RETURN false; END IF;
  SELECT credential_id INTO previous_id FROM platform.machine_credentials
    WHERE tenant_id=requested_tenant AND machine_principal_id=requested_principal
      AND credential_id=expected_credential_id AND status='ACTIVE' FOR UPDATE;
  IF previous_id IS NULL THEN RETURN false; END IF;
  UPDATE platform.machine_credentials SET status='SUPERSEDED',revoked_at=clock_timestamp() WHERE credential_id=previous_id;
  INSERT INTO platform.machine_credentials(credential_id,tenant_id,machine_principal_id,verifier_sha256,expires_at,created_by)
  VALUES(new_credential_id,requested_tenant,requested_principal,new_verifier,new_expiry,actor_user);
  INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
  VALUES(gen_random_uuid(),requested_tenant,actor_user,'platform.machine_credentials.rotate','platform:machine-service-identity',
    'ALLOWED',correlation_id,request_id,jsonb_build_object('principal_id',requested_principal,'credential_id',new_credential_id,'superseded_id',previous_id));
  INSERT INTO platform.domain_events(event_type,tenant_id,correlation_id,payload)
  VALUES('platform.machine_credential.rotated',requested_tenant,correlation_id::uuid,
    jsonb_build_object('principal_id',requested_principal,'credential_id',new_credential_id));
  RETURN true;
END $$;

CREATE FUNCTION platform.machine_auth_revoke(
  requested_tenant uuid, requested_principal uuid, requested_credential uuid,
  actor_user uuid, context_token uuid, request_id text, correlation_id text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM platform.activate_tenant_context(context_token,'platform.machine_credentials.manage');
  IF NOT platform.has_trusted_tenant_context(requested_tenant,actor_user,'platform.machine_credentials.manage') THEN RETURN false; END IF;
  UPDATE platform.machine_credentials SET status='REVOKED',revoked_at=clock_timestamp()
   WHERE credential_id=requested_credential AND tenant_id=requested_tenant
     AND machine_principal_id=requested_principal AND status='ACTIVE';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
  VALUES(gen_random_uuid(),requested_tenant,actor_user,'platform.machine_credentials.revoke','platform:machine-service-identity',
    'ALLOWED',correlation_id,request_id,jsonb_build_object('principal_id',requested_principal,'credential_id',requested_credential));
  INSERT INTO platform.domain_events(event_type,tenant_id,correlation_id,payload)
  VALUES('platform.machine_credential.revoked',requested_tenant,correlation_id::uuid,
    jsonb_build_object('principal_id',requested_principal,'credential_id',requested_credential));
  RETURN true;
END $$;

CREATE FUNCTION platform.machine_auth_disable(
  requested_tenant uuid, requested_principal uuid, actor_user uuid,
  context_token uuid, request_id text, correlation_id text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM platform.activate_tenant_context(context_token,'platform.machine_credentials.manage');
  IF NOT platform.has_trusted_tenant_context(requested_tenant,actor_user,'platform.machine_credentials.manage') THEN RETURN false; END IF;
  UPDATE platform.machine_principals SET status='DISABLED',version=version+1,updated_at=clock_timestamp()
    WHERE id=requested_principal AND tenant_id=requested_tenant AND status='ACTIVE';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
  VALUES(gen_random_uuid(),requested_tenant,actor_user,'platform.machine_principals.disable','platform:machine-service-identity',
    'ALLOWED',correlation_id,request_id,jsonb_build_object('principal_id',requested_principal));
  INSERT INTO platform.domain_events(event_type,tenant_id,correlation_id,payload)
  VALUES('platform.machine_principal.disabled',requested_tenant,correlation_id::uuid,
    jsonb_build_object('principal_id',requested_principal));
  RETURN true;
END $$;

CREATE FUNCTION platform.machine_auth_set_permission(
  requested_tenant uuid, requested_principal uuid, requested_permission text,
  should_grant boolean, actor_user uuid, context_token uuid, request_id text, correlation_id text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM platform.activate_tenant_context(context_token,'platform.machine_permissions.manage');
  IF NOT platform.has_trusted_tenant_context(requested_tenant,actor_user,'platform.machine_permissions.manage')
    OR NOT EXISTS(SELECT 1 FROM platform.machine_principals p WHERE p.id=requested_principal AND p.tenant_id=requested_tenant AND p.status='ACTIVE')
    OR NOT EXISTS(SELECT 1 FROM platform.permissions p WHERE p.permission_key=requested_permission)
  THEN RETURN false; END IF;
  IF should_grant THEN
    INSERT INTO platform.machine_principal_permissions(tenant_id,machine_principal_id,permission_key)
      VALUES(requested_tenant,requested_principal,requested_permission)
      ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM platform.machine_principal_permissions WHERE tenant_id=requested_tenant
      AND machine_principal_id=requested_principal AND permission_key=requested_permission;
  END IF;
  INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
  VALUES(gen_random_uuid(),requested_tenant,actor_user,'platform.machine_permissions.manage','platform:machine-service-identity',
    'ALLOWED',correlation_id,request_id,jsonb_build_object('principal_id',requested_principal,'permission',requested_permission,'granted',should_grant));
  RETURN true;
END $$;

CREATE FUNCTION platform.machine_auth_issue_context(
  requested_credential uuid, requested_principal uuid, requested_tenant uuid, requested_permission text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE issued uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM platform.machine_credentials c
    JOIN platform.machine_principals p ON p.id=c.machine_principal_id AND p.tenant_id=c.tenant_id
    WHERE c.credential_id=requested_credential AND c.machine_principal_id=requested_principal
      AND c.tenant_id=requested_tenant AND c.status='ACTIVE' AND c.expires_at>clock_timestamp()
      AND p.status='ACTIVE') THEN RETURN NULL; END IF;
  SELECT context_token INTO issued FROM platform.issue_machine_tenant_context(requested_principal,requested_tenant,requested_permission);
  RETURN issued;
END $$;

REVOKE ALL ON FUNCTION platform.machine_auth_provision(uuid,text,text,uuid,text,timestamptz,uuid,uuid,text,text),
 platform.machine_auth_resolve(uuid),
 platform.machine_auth_rotate(uuid,uuid,uuid,uuid,text,timestamptz,uuid,uuid,text,text),
 platform.machine_auth_revoke(uuid,uuid,uuid,uuid,uuid,text,text),
 platform.machine_auth_disable(uuid,uuid,uuid,uuid,text,text),
 platform.machine_auth_set_permission(uuid,uuid,text,boolean,uuid,uuid,text,text),
 platform.machine_auth_issue_context(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO acs_platform_machine_auth;
GRANT EXECUTE ON FUNCTION platform.machine_auth_provision(uuid,text,text,uuid,text,timestamptz,uuid,uuid,text,text),
 platform.machine_auth_resolve(uuid),
 platform.machine_auth_rotate(uuid,uuid,uuid,uuid,text,timestamptz,uuid,uuid,text,text),
 platform.machine_auth_revoke(uuid,uuid,uuid,uuid,uuid,text,text),
 platform.machine_auth_disable(uuid,uuid,uuid,uuid,text,text),
 platform.machine_auth_set_permission(uuid,uuid,text,boolean,uuid,uuid,text,text)
 TO acs_platform_machine_auth;
GRANT EXECUTE ON FUNCTION platform.machine_auth_issue_context(uuid,uuid,uuid,text)
 TO acs_machine_context_issuer;
COMMIT;
