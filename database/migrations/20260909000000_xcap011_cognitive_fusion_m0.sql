CREATE SCHEMA IF NOT EXISTS cyberdefense;

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('cyberdefense.fusion.request','Submit a tenant-scoped governed Fusion M0 request.'),
 ('cyberdefense.fusion.read','Read a tenant-scoped governed Fusion M0 result.')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE cyberdefense.fusion_command_receipts (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  operation text NOT NULL CHECK(operation='cyberdefense.fusion.request'),
  request_schema_version text NOT NULL CHECK(request_schema_version='1.0.0'),
  result_schema_version text NOT NULL CHECK(result_schema_version='1.0.0'),
  reference_schema_version text NOT NULL CHECK(reference_schema_version='1.0.0'),
  status text NOT NULL CHECK(status IN ('IN_PROGRESS','COMPLETED','FAILED')),
  fusion_request_id uuid,
  fusion_result_id uuid,
  request_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  result_hash text CHECK(result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$'),
  failure_code text CHECK(failure_code IS NULL OR failure_code IN (
    'AUTHENTICATION_REQUIRED','MEMBERSHIP_INACTIVE','TENANT_CONTEXT_INVALID','AUTHORIZATION_DENIED',
    'CROSS_TENANT_REFERENCE','REFERENCE_UNAUTHORIZED','REFERENCE_NOT_FOUND',
    'REFERENCE_VERSION_MISMATCH','REFERENCE_OWNER_UNAVAILABLE','REFERENCE_OWNER_UNSUPPORTED',
    'REFERENCE_INTEGRITY_FAILED','REFERENCE_PROVENANCE_INVALID','PROVENANCE_MISSING',
    'PROVENANCE_INVALID','PROVENANCE_TAMPERED','CONFIDENCE_INVALID','INSUFFICIENT_CONFIDENCE',
    'CONTEXT_STALE','POLICY_VERSION_MISMATCH','DEPENDENCY_UNAVAILABLE','DEPENDENCY_TIMEOUT',
    'SCHEMA_INVALID','REPLAY_CONFLICT','IDEMPOTENCY_CONFLICT','UNTRUSTED_CONTENT',
    'SENSITIVE_CONTENT_REJECTED','MODEL_PROVIDER_UNTRUSTED','MODEL_RESULT_INVALID')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK(row_version > 0),
  PRIMARY KEY(tenant_id,idempotency_key),
  CHECK(expires_at > created_at),
  CHECK((status='IN_PROGRESS' AND completed_at IS NULL AND result_hash IS NULL AND failure_code IS NULL)
     OR (status='COMPLETED' AND completed_at IS NOT NULL AND fusion_request_id IS NOT NULL AND fusion_result_id IS NOT NULL AND result_hash IS NOT NULL AND failure_code IS NULL)
     OR (status='FAILED' AND completed_at IS NOT NULL AND fusion_request_id IS NOT NULL AND fusion_result_id IS NULL AND result_hash IS NULL AND failure_code IS NOT NULL))
);
CREATE INDEX fusion_command_receipts_expiry_idx
  ON cyberdefense.fusion_command_receipts(tenant_id,expires_at);

CREATE FUNCTION cyberdefense.has_fusion_context(row_tenant_id uuid, allowed text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
   SELECT 1 FROM unnest(allowed) AS permission_key
   WHERE platform.has_trusted_tenant_context(row_tenant_id,NULL,permission_key)
 )
$$;

ALTER TABLE cyberdefense.fusion_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyberdefense.fusion_command_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY fusion_receipts_select ON cyberdefense.fusion_command_receipts FOR SELECT TO acs_xcap011_fusion
 USING(cyberdefense.has_fusion_context(tenant_id,ARRAY['cyberdefense.fusion.request','cyberdefense.fusion.read']));
CREATE POLICY fusion_receipts_insert ON cyberdefense.fusion_command_receipts FOR INSERT TO acs_xcap011_fusion
 WITH CHECK(cyberdefense.has_fusion_context(tenant_id,ARRAY['cyberdefense.fusion.request']));
CREATE POLICY fusion_receipts_update ON cyberdefense.fusion_command_receipts FOR UPDATE TO acs_xcap011_fusion
 USING(cyberdefense.has_fusion_context(tenant_id,ARRAY['cyberdefense.fusion.request']))
 WITH CHECK(cyberdefense.has_fusion_context(tenant_id,ARRAY['cyberdefense.fusion.request']));

CREATE POLICY audit_logs_xcap011_insert ON platform.audit_logs FOR INSERT TO acs_xcap011_fusion
 WITH CHECK(cyberdefense.has_fusion_context(tenant_id,ARRAY['cyberdefense.fusion.request']));
CREATE POLICY domain_events_xcap011_insert ON platform.domain_events FOR INSERT TO acs_xcap011_fusion
 WITH CHECK(producer='acs-platform-api' AND event_type LIKE 'cyberdefense.fusion.%'
   AND cyberdefense.has_fusion_context(tenant_id,ARRAY['cyberdefense.fusion.request']));

CREATE FUNCTION cyberdefense.cleanup_expired_fusion_receipts(requested_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE deleted_count integer; actor_id uuid;
BEGIN
 IF NOT platform.has_trusted_tenant_context(requested_tenant_id,NULL,'cyberdefense.fusion.request') THEN
   RAISE EXCEPTION 'fusion receipt cleanup denied' USING ERRCODE='42501';
 END IF;
 SELECT g.user_id INTO actor_id FROM platform.tenant_context_grants g
  WHERE g.token=current_setting('app.context_token')::uuid AND g.tenant_id=requested_tenant_id
  AND g.activated_backend_pid=pg_backend_pid() AND g.activated_transaction_id=txid_current();
 DELETE FROM cyberdefense.fusion_command_receipts
  WHERE tenant_id=requested_tenant_id AND expires_at<=clock_timestamp();
 GET DIAGNOSTICS deleted_count = ROW_COUNT;
 INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,classification,correlation_id,request_id,metadata)
 VALUES(gen_random_uuid(),requested_tenant_id,actor_id,'cyberdefense.fusion.receipt.cleanup','cyberdefense:fusion-command-receipts','ALLOWED','SECURITY',gen_random_uuid()::text,gen_random_uuid()::text,jsonb_build_object('deleted_count',deleted_count));
 RETURN deleted_count;
END; $$;

REVOKE ALL ON SCHEMA cyberdefense FROM PUBLIC;
REVOKE ALL ON TABLE cyberdefense.fusion_command_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION cyberdefense.cleanup_expired_fusion_receipts(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA platform,cyberdefense TO acs_xcap011_fusion;
GRANT SELECT,INSERT,UPDATE ON cyberdefense.fusion_command_receipts TO acs_xcap011_fusion;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_xcap011_fusion;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),platform.has_trusted_tenant_context(uuid,uuid,text),cyberdefense.has_fusion_context(uuid,text[]),cyberdefense.cleanup_expired_fusion_receipts(uuid) TO acs_xcap011_fusion;
