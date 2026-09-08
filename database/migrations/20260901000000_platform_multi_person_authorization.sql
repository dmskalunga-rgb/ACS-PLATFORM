BEGIN;

INSERT INTO platform.permissions(permission_key, description) VALUES
  ('platform.mpa.request', 'Request a policy-bound multi-person authorization'),
  ('platform.mpa.read', 'Read a tenant-bound multi-person authorization'),
  ('platform.mpa.approve', 'Approve a multi-person authorization when policy eligible'),
  ('platform.mpa.reject', 'Reject a multi-person authorization'),
  ('platform.mpa.revoke', 'Revoke a multi-person authorization before consumption'),
  ('platform.mpa.consume', 'Consume an approved authorization atomically')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE platform.mpa_policies (
  policy_id text NOT NULL,
  policy_version text NOT NULL CHECK (policy_version ~ '^\d+\.\d+\.\d+$'),
  operation text NOT NULL CHECK (operation ~ '^[a-z][a-z0-9_.:-]{2,119}$'),
  consumption_policy text NOT NULL CHECK (consumption_policy = 'SINGLE_USE'),
  expiry_interval interval NOT NULL CHECK (expiry_interval = interval '15 minutes'),
  status text NOT NULL CHECK (status = 'ACTIVE'),
  PRIMARY KEY (policy_id, policy_version)
);

CREATE TABLE platform.mpa_authority_classes (
  authority_class_id text PRIMARY KEY CHECK (authority_class_id ~ '^[a-z][a-z0-9_.:-]{2,119}$')
);

CREATE TABLE platform.mpa_policy_authority_requirements (
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  authority_class_id text NOT NULL REFERENCES platform.mpa_authority_classes(authority_class_id),
  required_count smallint NOT NULL CHECK (required_count BETWEEN 1 AND 2),
  requester_independent boolean NOT NULL CHECK (requester_independent),
  PRIMARY KEY (policy_id, policy_version, authority_class_id),
  FOREIGN KEY (policy_id, policy_version) REFERENCES platform.mpa_policies(policy_id, policy_version)
);

CREATE TABLE platform.mpa_membership_authorities (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  membership_id uuid NOT NULL,
  authority_class_id text NOT NULL REFERENCES platform.mpa_authority_classes(authority_class_id),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, membership_id, authority_class_id),
  FOREIGN KEY (membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id)
);

CREATE TABLE platform.mpa_authorization_envelopes (
  authorization_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  requester_user_id uuid NOT NULL REFERENCES platform.users(id),
  requester_membership_id uuid NOT NULL,
  operation text NOT NULL,
  target_reference_hash text NOT NULL CHECK (target_reference_hash ~ '^[0-9a-f]{64}$'),
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  state text NOT NULL CHECK (state IN ('REQUESTED','PARTIALLY_APPROVED','APPROVED','REJECTED','REVOKED','CONSUMED','EXPIRED')),
  approval_count smallint NOT NULL DEFAULT 0 CHECK (approval_count >= 0),
  required_approval_count smallint NOT NULL CHECK (required_approval_count BETWEEN 1 AND 2),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, authorization_id),
  FOREIGN KEY (requester_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (policy_id, policy_version) REFERENCES platform.mpa_policies(policy_id, policy_version),
  CHECK (expires_at > created_at)
);

CREATE TABLE platform.mpa_authorization_decisions (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  authorization_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  actor_membership_id uuid NOT NULL,
  authority_class_id text REFERENCES platform.mpa_authority_classes(authority_class_id),
  decision text NOT NULL CHECK (decision IN ('APPROVE','REJECT','REVOKE')),
  attestation_reference_hash text CHECK (attestation_reference_hash ~ '^[0-9a-f]{64}$'),
  expected_version bigint NOT NULL CHECK (expected_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES platform.memberships(id, tenant_id),
  FOREIGN KEY (tenant_id, authorization_id)
    REFERENCES platform.mpa_authorization_envelopes(tenant_id, authorization_id),
  UNIQUE (tenant_id, authorization_id, actor_user_id)
);

CREATE TABLE platform.mpa_consumptions (
  consumption_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  authorization_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  operation text NOT NULL,
  target_reference_hash text NOT NULL CHECK (target_reference_hash ~ '^[0-9a-f]{64}$'),
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  attestation_reference_hash text NOT NULL CHECK (attestation_reference_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, authorization_id)
    REFERENCES platform.mpa_authorization_envelopes(tenant_id, authorization_id),
  UNIQUE (tenant_id, authorization_id)
);

CREATE TABLE platform.mpa_command_results (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  command text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

INSERT INTO platform.mpa_authority_classes(authority_class_id) VALUES
  ('cyberdefense.evidence.export_authority'),
  ('cyberdefense.evidence.retention_override_authority'),
  ('cyberdefense.evidence.destroy_authority');

INSERT INTO platform.mpa_policies(policy_id,policy_version,operation,consumption_policy,expiry_interval,status) VALUES
  ('cyberdefense.evidence.export.standard','1.0.0','cyberdefense.evidence.export','SINGLE_USE',interval '15 minutes','ACTIVE'),
  ('cyberdefense.evidence.export.restricted_security','1.0.0','cyberdefense.evidence.export','SINGLE_USE',interval '15 minutes','ACTIVE'),
  ('cyberdefense.evidence.retention_override','1.0.0','cyberdefense.evidence.retention_override','SINGLE_USE',interval '15 minutes','ACTIVE'),
  ('cyberdefense.evidence.destroy','1.0.0','cyberdefense.evidence.destroy','SINGLE_USE',interval '15 minutes','ACTIVE');

INSERT INTO platform.mpa_policy_authority_requirements VALUES
  ('cyberdefense.evidence.export.standard','1.0.0','cyberdefense.evidence.export_authority',1,true),
  ('cyberdefense.evidence.export.restricted_security','1.0.0','cyberdefense.evidence.export_authority',2,true),
  ('cyberdefense.evidence.retention_override','1.0.0','cyberdefense.evidence.retention_override_authority',2,true),
  ('cyberdefense.evidence.destroy','1.0.0','cyberdefense.evidence.destroy_authority',2,true);

CREATE INDEX mpa_envelopes_tenant_state_expiry_idx ON platform.mpa_authorization_envelopes(tenant_id,state,expires_at);
CREATE INDEX mpa_decisions_authorization_idx ON platform.mpa_authorization_decisions(tenant_id,authorization_id);

CREATE TRIGGER mpa_decisions_append_only BEFORE UPDATE OR DELETE ON platform.mpa_authorization_decisions
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
CREATE TRIGGER mpa_consumptions_append_only BEFORE UPDATE OR DELETE ON platform.mpa_consumptions
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();

ALTER TABLE platform.mpa_membership_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_membership_authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_authorization_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_authorization_envelopes FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_authorization_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_authorization_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_consumptions FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_command_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mpa_command_results FORCE ROW LEVEL SECURITY;

CREATE POLICY mpa_authorities_scope ON platform.mpa_membership_authorities FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.approve'));
CREATE POLICY mpa_envelopes_read_scope ON platform.mpa_authorization_envelopes FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.read') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.request') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.approve') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.reject') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.revoke') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.consume'));
CREATE POLICY mpa_envelopes_insert_scope ON platform.mpa_authorization_envelopes FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,requester_user_id,'platform.mpa.request'));
CREATE POLICY mpa_envelopes_update_scope ON platform.mpa_authorization_envelopes FOR UPDATE USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.approve') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.reject') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.revoke') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.consume'));
CREATE POLICY mpa_decisions_scope ON platform.mpa_authorization_decisions FOR SELECT USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.read') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.approve'));
CREATE POLICY mpa_decisions_insert_scope ON platform.mpa_authorization_decisions FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.approve') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.reject') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.revoke'));
CREATE POLICY mpa_consumptions_scope ON platform.mpa_consumptions FOR ALL USING (
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.consume'))
  WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.consume'));
CREATE POLICY mpa_command_results_scope ON platform.mpa_command_results FOR ALL USING (
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,command))
  WITH CHECK (platform.has_trusted_tenant_context(tenant_id,actor_user_id,command));
CREATE POLICY audit_logs_mpa_insert ON platform.audit_logs FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.request') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.approve') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.reject') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.revoke') OR
  platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.consume'));
CREATE POLICY domain_events_mpa_insert ON platform.domain_events FOR INSERT WITH CHECK (
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.request') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.approve') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.reject') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.revoke') OR
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.mpa.consume'));

CREATE FUNCTION platform.materialize_mpa_expiry(
  requested_tenant_id uuid,
  requested_authorization_id uuid,
  requested_actor_user_id uuid,
  requested_permission text,
  requested_request_id uuid,
  requested_correlation_id uuid
)
RETURNS SETOF platform.mpa_authorization_envelopes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_envelope platform.mpa_authorization_envelopes%ROWTYPE;
BEGIN
  IF requested_permission NOT IN (
    'platform.mpa.read','platform.mpa.approve','platform.mpa.reject',
    'platform.mpa.revoke','platform.mpa.consume'
  ) OR NOT platform.has_trusted_tenant_context(
    requested_tenant_id,
    requested_actor_user_id,
    requested_permission
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO current_envelope
  FROM platform.mpa_authorization_envelopes
  WHERE tenant_id = requested_tenant_id
    AND authorization_id = requested_authorization_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  IF current_envelope.state IN ('REQUESTED','PARTIALLY_APPROVED','APPROVED')
     AND current_envelope.expires_at <= clock_timestamp() THEN
    UPDATE platform.mpa_authorization_envelopes
    SET state = 'EXPIRED', version = version + 1, updated_at = clock_timestamp()
    WHERE tenant_id = requested_tenant_id
      AND authorization_id = requested_authorization_id
    RETURNING * INTO current_envelope;

    INSERT INTO platform.audit_logs(
      id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata
    ) VALUES (
      gen_random_uuid(),requested_tenant_id,requested_actor_user_id,'platform.mpa.expire',
      'platform:mpa:' || requested_authorization_id::text,'ALLOWED',
      requested_correlation_id::text,requested_request_id::text,
      jsonb_build_object('state','EXPIRED','version',current_envelope.version)
    );

    INSERT INTO platform.domain_events(
      event_type,schema_version,tenant_id,correlation_id,causation_id,
      producer,classification,payload
    ) VALUES (
      'authorization.approval.expired','1.0.0',requested_tenant_id,
      requested_correlation_id,requested_request_id,
      'acs-platform-api','INTERNAL',
      jsonb_build_object(
        'authorization_id',current_envelope.authorization_id,
        'policy_id',current_envelope.policy_id,
        'policy_version',current_envelope.policy_version,
        'operation',current_envelope.operation,
        'target_reference_hash',current_envelope.target_reference_hash,
        'state','EXPIRED','version',current_envelope.version,
        'request_id',requested_request_id::text
      )
    );
  END IF;

  RETURN NEXT current_envelope;
END;
$$;

REVOKE ALL ON FUNCTION platform.materialize_mpa_expiry(uuid,uuid,uuid,text,uuid,uuid)
  FROM PUBLIC;

GRANT USAGE ON SCHEMA platform TO acs_platform_mpa;
GRANT SELECT ON platform.mpa_policies,platform.mpa_policy_authority_requirements,platform.mpa_authority_classes TO acs_platform_mpa;
GRANT SELECT ON platform.mpa_membership_authorities TO acs_platform_mpa;
GRANT SELECT,INSERT,UPDATE ON platform.mpa_authorization_envelopes TO acs_platform_mpa;
GRANT SELECT,INSERT ON platform.mpa_authorization_decisions,platform.mpa_consumptions,platform.mpa_command_results TO acs_platform_mpa;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_platform_mpa;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),platform.has_trusted_tenant_context(uuid,uuid,text),platform.materialize_mpa_expiry(uuid,uuid,uuid,text,uuid,uuid) TO acs_platform_mpa;

COMMIT;
