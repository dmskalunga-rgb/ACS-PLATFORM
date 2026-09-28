BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_principal_classification_writer') THEN
    CREATE ROLE acs_principal_classification_writer NOLOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

INSERT INTO platform.permissions(permission_key, description) VALUES
  ('platform.principals.classify', 'Govern a tenant principal classification'),
  ('platform.principals.classify.operator', 'Operate a two-person principal classification'),
  ('platform.principals.classify.verifier', 'Independently verify a principal classification'),
  ('platform.principals.link_person', 'Govern a tenant principal-to-person link'),
  ('platform.principals.genesis.execute', 'Execute one signed human authority genesis')
ON CONFLICT (permission_key) DO NOTHING;

-- Public-only trust material. The real ACS-HGR-001 key is a separately governed
-- bootstrap datum; this migration never generates or stores private material.
CREATE TABLE platform.human_governance_trust_roots (
  trust_root_id text PRIMARY KEY CHECK (trust_root_id ~ '^ACS-HGR-[0-9]{3,}$'),
  purpose text NOT NULL CHECK (purpose = 'HUMAN_PRINCIPAL_GENESIS_AUTHORIZATION'),
  algorithm text NOT NULL CHECK (algorithm = 'ECDSA_P256_SHA256'),
  public_key text NOT NULL CHECK (length(public_key) BETWEEN 100 AND 4096),
  public_key_fingerprint text NOT NULL UNIQUE CHECK (public_key_fingerprint ~ '^[0-9a-f]{64}$'),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE','SUPERSEDED','REVOKED')),
  not_before timestamptz NOT NULL,
  not_after timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  supersedes_trust_root_id text REFERENCES platform.human_governance_trust_roots(trust_root_id),
  CHECK (not_after > not_before),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);
REVOKE ALL ON platform.human_governance_trust_roots FROM PUBLIC;

CREATE FUNCTION platform.resolve_human_governance_trust_root(requested_id text)
RETURNS TABLE (
  trust_root_id text, purpose text, algorithm text, public_key text,
  public_key_fingerprint text, version integer, status text,
  not_before timestamptz, not_after timestamptz, revoked_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT r.trust_root_id,r.purpose,r.algorithm,r.public_key,
    r.public_key_fingerprint,r.version,r.status,r.not_before,r.not_after,r.revoked_at
  FROM platform.human_governance_trust_roots r WHERE r.trust_root_id = requested_id;
$$;
REVOKE ALL ON FUNCTION platform.resolve_human_governance_trust_root(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.resolve_human_governance_trust_root(text)
  TO acs_phase1_tenant_admin;

CREATE TABLE platform.persons (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('VERIFIED','SUSPENDED','REVOKED')),
  policy_version text NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 80),
  evidence_id uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (tenant_id, person_id)
);
ALTER TABLE platform.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.persons FORCE ROW LEVEL SECURITY;
CREATE POLICY persons_read ON platform.persons FOR SELECT TO acs_principal_classification_writer USING (
  platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.classify')
);
CREATE POLICY persons_insert ON platform.persons FOR INSERT TO acs_principal_classification_writer
  WITH CHECK (
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.classify') OR
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.genesis.execute')
  );
REVOKE ALL ON platform.persons FROM PUBLIC;

CREATE TABLE platform.principal_classifications (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES platform.users(id),
  principal_type text NOT NULL CHECK (principal_type IN
    ('HUMAN','SERVICE','MACHINE','AUTOMATION','AI_AGENT','UNKNOWN')),
  status text NOT NULL CHECK (status IN ('VERIFIED','SUSPENDED','REVOKED')),
  person_id uuid,
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 512),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  classification_source text NOT NULL CHECK (classification_source IN
    ('GOVERNED_OPERATOR','SIGNED_GENESIS')),
  policy_version text NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 80),
  evidence_id uuid NOT NULL,
  classified_by uuid NOT NULL REFERENCES platform.users(id),
  verified_by uuid REFERENCES platform.users(id),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES platform.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, person_id) REFERENCES platform.persons(tenant_id, person_id),
  CHECK (principal_type = 'HUMAN' OR person_id IS NULL),
  CHECK (principal_type <> 'HUMAN' OR status <> 'VERIFIED' OR person_id IS NOT NULL)
);

ALTER TABLE platform.principal_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.principal_classifications FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_classifications_read ON platform.principal_classifications
  FOR SELECT TO acs_principal_classification_writer USING (
    platform.has_trusted_tenant_context(tenant_id, NULL, 'platform.principals.classify')
  );
CREATE POLICY principal_classifications_insert ON platform.principal_classifications
  FOR INSERT TO acs_principal_classification_writer WITH CHECK (
    platform.has_trusted_tenant_context(tenant_id,classified_by,'platform.principals.classify') OR
    (classification_source='SIGNED_GENESIS' AND
      platform.has_trusted_tenant_context(tenant_id,classified_by,'platform.principals.genesis.execute'))
  );
CREATE POLICY principal_classifications_update ON platform.principal_classifications
  FOR UPDATE TO acs_principal_classification_writer USING (
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.classify')
  ) WITH CHECK (
    platform.has_trusted_tenant_context(tenant_id,classified_by,'platform.principals.classify') OR
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.link_person') OR
    (classification_source='SIGNED_GENESIS' AND
      platform.has_trusted_tenant_context(tenant_id,classified_by,'platform.principals.genesis.execute'))
  );
REVOKE ALL ON platform.principal_classifications FROM PUBLIC;

-- Immutable governance snapshots preserve the prior HUMAN assertion when a
-- lifecycle transition or independently verified reclassification changes it.
CREATE TABLE platform.principal_classification_lifecycle (
  transition_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES platform.users(id),
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  kind text NOT NULL CHECK (kind IN ('SUSPEND','REACTIVATE','REVOKE','REQUALIFY')),
  from_version bigint NOT NULL CHECK (from_version > 0),
  to_version bigint NOT NULL CHECK (to_version = from_version + 1),
  prior_record jsonb NOT NULL CHECK (jsonb_typeof(prior_record) = 'object'),
  new_record jsonb NOT NULL CHECK (jsonb_typeof(new_record) = 'object'),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  evidence_id uuid NOT NULL,
  authorization_reference_hash text NOT NULL CHECK (authorization_reference_hash ~ '^[0-9a-f]{64}$'),
  command_hash text NOT NULL CHECK (command_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, transition_id)
);
CREATE INDEX principal_classification_lifecycle_user_idx
  ON platform.principal_classification_lifecycle(tenant_id,user_id,to_version);
ALTER TABLE platform.principal_classification_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.principal_classification_lifecycle FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_classification_lifecycle_read
  ON platform.principal_classification_lifecycle FOR SELECT
  TO acs_principal_classification_writer USING (
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.classify')
  );
CREATE POLICY principal_classification_lifecycle_insert
  ON platform.principal_classification_lifecycle FOR INSERT
  TO acs_principal_classification_writer WITH CHECK (
    platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.principals.classify')
  );
CREATE TRIGGER principal_classification_lifecycle_append_only
  BEFORE UPDATE OR DELETE ON platform.principal_classification_lifecycle
  FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
REVOKE ALL ON platform.principal_classification_lifecycle FROM PUBLIC;

CREATE TABLE platform.principal_classification_requests (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES platform.users(id),
  operator_user_id uuid NOT NULL REFERENCES platform.users(id),
  operator_person_id uuid NOT NULL,
  verifier_user_id uuid REFERENCES platform.users(id),
  verifier_person_id uuid,
  proposed_person_id uuid,
  desired_type text NOT NULL CHECK (desired_type = 'HUMAN'),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','VERIFIED','REJECTED')),
  evidence_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 80),
  expected_classification_version bigint NOT NULL CHECK (expected_classification_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  verified_at timestamptz,
  PRIMARY KEY (tenant_id,request_id),
  FOREIGN KEY (tenant_id,operator_person_id) REFERENCES platform.persons(tenant_id,person_id),
  FOREIGN KEY (tenant_id,verifier_person_id) REFERENCES platform.persons(tenant_id,person_id),
  FOREIGN KEY (tenant_id,proposed_person_id) REFERENCES platform.persons(tenant_id,person_id),
  CHECK (expires_at > created_at),
  CHECK (state <> 'VERIFIED' OR
    (verifier_user_id IS NOT NULL AND verifier_person_id IS NOT NULL
      AND proposed_person_id IS NOT NULL AND verified_at IS NOT NULL
      AND operator_person_id <> verifier_person_id))
);
ALTER TABLE platform.principal_classification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.principal_classification_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_classification_requests_read
  ON platform.principal_classification_requests FOR SELECT
  TO acs_principal_classification_writer USING (
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.classify')
  );
CREATE POLICY principal_classification_requests_insert
  ON platform.principal_classification_requests FOR INSERT
  TO acs_principal_classification_writer WITH CHECK (
    platform.has_trusted_tenant_context(tenant_id,operator_user_id,'platform.principals.classify')
  );
CREATE POLICY principal_classification_requests_update
  ON platform.principal_classification_requests FOR UPDATE
  TO acs_principal_classification_writer USING (
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.classify')
  ) WITH CHECK (
    platform.has_trusted_tenant_context(tenant_id,verifier_user_id,'platform.principals.classify')
  );
REVOKE ALL ON platform.principal_classification_requests FROM PUBLIC;

CREATE FUNCTION platform.request_human_classification(
  requested_tenant_id uuid,
  requested_operator_user_id uuid,
  requested_target_user_id uuid,
  requested_evidence_id uuid,
  requested_policy_version text,
  requested_expected_version bigint,
  requested_request_id uuid,
  requested_correlation_id uuid
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  operator_person_id uuid;
  current_version bigint;
  current_type text;
  current_status text;
  new_request_id uuid;
BEGIN
  IF NOT platform.has_trusted_tenant_context(
    requested_tenant_id,requested_operator_user_id,'platform.principals.classify'
  ) OR requested_operator_user_id=requested_target_user_id
    OR length(requested_policy_version) NOT BETWEEN 1 AND 80
    OR requested_expected_version < 0 THEN RETURN NULL; END IF;
  SELECT c.person_id INTO operator_person_id
  FROM platform.principal_classifications c
  JOIN platform.persons p ON p.tenant_id=c.tenant_id AND p.person_id=c.person_id
  WHERE c.tenant_id=requested_tenant_id AND c.user_id=requested_operator_user_id
    AND c.principal_type='HUMAN' AND c.status='VERIFIED'
    AND p.status='VERIFIED'
    AND platform.is_tenant_action_authorized(requested_operator_user_id,requested_tenant_id,
      'platform.principals.classify.operator');
  IF operator_person_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM platform.users u
    CROSS JOIN LATERAL platform.resolve_active_tenant_membership(
      u.external_subject,requested_tenant_id) m
    WHERE u.id=requested_target_user_id AND m.user_id=u.id
  ) THEN RETURN NULL; END IF;
  SELECT version,principal_type,status INTO current_version,current_type,current_status
    FROM platform.principal_classifications
    WHERE tenant_id=requested_tenant_id AND user_id=requested_target_user_id FOR UPDATE;
  IF COALESCE(current_version,0) <> requested_expected_version
    OR (current_type='HUMAN' AND current_status<>'REVOKED') THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM platform.principal_classifications c
    WHERE c.tenant_id=requested_tenant_id AND c.user_id=requested_target_user_id
      AND c.person_id=operator_person_id
  ) THEN RETURN NULL; END IF;
  INSERT INTO platform.principal_classification_requests(
    tenant_id,target_user_id,operator_user_id,operator_person_id,desired_type,
    evidence_id,policy_version,expected_classification_version
  ) VALUES (
    requested_tenant_id,requested_target_user_id,requested_operator_user_id,
    operator_person_id,'HUMAN',requested_evidence_id,requested_policy_version,
    requested_expected_version
  ) RETURNING request_id INTO new_request_id;
  INSERT INTO platform.audit_logs(
    id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata
  ) VALUES (
    gen_random_uuid(),requested_tenant_id,requested_operator_user_id,
    'platform.principals.classify.request','platform:principal-classification',
    'ALLOWED',requested_correlation_id::text,requested_request_id::text,
    jsonb_build_object('classification_request_id',new_request_id,
      'target_user_id',requested_target_user_id,'evidence_id',requested_evidence_id)
  );
  INSERT INTO platform.domain_events(
    event_type,schema_version,tenant_id,correlation_id,producer,classification,payload
  ) VALUES (
    'platform.principal.classification_requested','1.0.0',requested_tenant_id,
    requested_correlation_id,'acs-platform-api','INTERNAL',
    jsonb_build_object('classification_request_id',new_request_id,
      'target_user_id',requested_target_user_id)
  );
  RETURN new_request_id;
END;
$$;
REVOKE ALL ON FUNCTION platform.request_human_classification(
  uuid,uuid,uuid,uuid,text,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.request_human_classification(
  uuid,uuid,uuid,uuid,text,bigint,uuid,uuid) TO acs_phase1_tenant_admin;

CREATE FUNCTION platform.pending_human_classification_evidence(
  requested_tenant_id uuid,
  requested_verifier_user_id uuid,
  requested_classification_request_id uuid
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  result uuid;
BEGIN
  IF NOT platform.has_trusted_tenant_context(
    requested_tenant_id,requested_verifier_user_id,'platform.principals.classify'
  ) OR NOT platform.is_tenant_action_authorized(
    requested_verifier_user_id,requested_tenant_id,'platform.principals.classify.verifier'
  ) THEN RETURN NULL; END IF;
  SELECT evidence_id INTO result FROM platform.principal_classification_requests
  WHERE tenant_id=requested_tenant_id AND request_id=requested_classification_request_id
    AND state='PENDING' AND expires_at>clock_timestamp()
    AND operator_user_id<>requested_verifier_user_id
    AND target_user_id<>requested_verifier_user_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION platform.pending_human_classification_evidence(uuid,uuid,uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.pending_human_classification_evidence(uuid,uuid,uuid)
  TO acs_phase1_tenant_admin;

CREATE FUNCTION platform.verify_human_classification(
  requested_tenant_id uuid,
  requested_verifier_user_id uuid,
  requested_classification_request_id uuid,
  requested_request_id uuid,
  requested_correlation_id uuid
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  pending platform.principal_classification_requests%ROWTYPE;
  resolved_verifier_person_id uuid;
  target_subject text;
  subject_parts jsonb;
  current_version bigint;
  current_type text;
  current_status text;
  prior_classification platform.principal_classifications%ROWTYPE;
  new_classification platform.principal_classifications%ROWTYPE;
  created_person_id uuid;
BEGIN
  IF NOT platform.has_trusted_tenant_context(
    requested_tenant_id,requested_verifier_user_id,'platform.principals.classify'
  ) THEN RETURN NULL; END IF;
  SELECT * INTO pending FROM platform.principal_classification_requests
    WHERE tenant_id=requested_tenant_id
      AND request_id=requested_classification_request_id FOR UPDATE;
  IF pending.request_id IS NULL OR pending.state <> 'PENDING'
    OR pending.expires_at <= clock_timestamp()
    OR pending.target_user_id=requested_verifier_user_id
    OR pending.operator_user_id=requested_verifier_user_id THEN RETURN NULL; END IF;
  SELECT c.person_id INTO resolved_verifier_person_id
  FROM platform.principal_classifications c
  JOIN platform.persons p ON p.tenant_id=c.tenant_id AND p.person_id=c.person_id
  WHERE c.tenant_id=requested_tenant_id AND c.user_id=requested_verifier_user_id
    AND c.principal_type='HUMAN' AND c.status='VERIFIED'
    AND p.status='VERIFIED'
    AND platform.is_tenant_action_authorized(requested_verifier_user_id,requested_tenant_id,
      'platform.principals.classify.verifier');
  IF resolved_verifier_person_id IS NULL OR resolved_verifier_person_id=pending.operator_person_id
    OR NOT EXISTS (
      SELECT 1 FROM platform.principal_classifications c
      JOIN platform.persons p ON p.tenant_id=c.tenant_id AND p.person_id=c.person_id
      WHERE c.tenant_id=requested_tenant_id AND c.user_id=pending.operator_user_id
        AND c.person_id=pending.operator_person_id
        AND c.principal_type='HUMAN' AND c.status='VERIFIED' AND p.status='VERIFIED'
    ) THEN RETURN NULL; END IF;
  SELECT u.external_subject INTO target_subject
    FROM platform.users u
    CROSS JOIN LATERAL platform.resolve_active_tenant_membership(
      u.external_subject,requested_tenant_id) m
    WHERE u.id=pending.target_user_id AND m.user_id=u.id;
  IF target_subject IS NULL THEN RETURN NULL; END IF;
  BEGIN
    subject_parts := target_subject::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
  END;
  IF jsonb_typeof(subject_parts) <> 'array' OR jsonb_array_length(subject_parts) <> 2
    OR jsonb_typeof(subject_parts->0) <> 'string'
    OR jsonb_typeof(subject_parts->1) <> 'string' THEN RETURN NULL; END IF;
  SELECT * INTO prior_classification FROM platform.principal_classifications
    WHERE tenant_id=requested_tenant_id AND user_id=pending.target_user_id FOR UPDATE;
  current_version := prior_classification.version;
  current_type := prior_classification.principal_type;
  current_status := prior_classification.status;
  IF COALESCE(current_version,0) <> pending.expected_classification_version
    OR (current_type='HUMAN' AND current_status<>'REVOKED') THEN RETURN NULL; END IF;
  INSERT INTO platform.persons(tenant_id,status,policy_version,evidence_id)
    VALUES(requested_tenant_id,'VERIFIED',pending.policy_version,pending.evidence_id)
    RETURNING person_id INTO created_person_id;
  IF current_version IS NULL THEN
    INSERT INTO platform.principal_classifications(
      tenant_id,user_id,principal_type,status,person_id,issuer,subject,
      classification_source,policy_version,evidence_id,classified_by,verified_by
    ) VALUES (
      requested_tenant_id,pending.target_user_id,'HUMAN','VERIFIED',created_person_id,
      subject_parts->>0,subject_parts->>1,'GOVERNED_OPERATOR',pending.policy_version,
      pending.evidence_id,pending.operator_user_id,requested_verifier_user_id
    );
  ELSE
    UPDATE platform.principal_classifications SET
      principal_type='HUMAN',status='VERIFIED',person_id=created_person_id,
      issuer=subject_parts->>0,subject=subject_parts->>1,
      policy_version=pending.policy_version,evidence_id=pending.evidence_id,
      classified_by=pending.operator_user_id,verified_by=requested_verifier_user_id,
      verified_at=clock_timestamp(),version=version+1
    WHERE tenant_id=requested_tenant_id AND user_id=pending.target_user_id
    RETURNING * INTO new_classification;
    IF current_type='HUMAN' AND current_status='REVOKED' THEN
      INSERT INTO platform.principal_classification_lifecycle(
        tenant_id,user_id,actor_user_id,kind,from_version,to_version,
        prior_record,new_record,reason_code,evidence_id,
        authorization_reference_hash,command_hash
      ) VALUES (
        requested_tenant_id,pending.target_user_id,requested_verifier_user_id,
        'REQUALIFY',prior_classification.version,new_classification.version,
        to_jsonb(prior_classification),to_jsonb(new_classification),
        'GOVERNED_RECLASSIFICATION',pending.evidence_id,
        encode(sha256(convert_to(current_setting('app.context_token',true),'UTF8')),'hex'),
        encode(sha256(convert_to(pending.request_id::text,'UTF8')),'hex')
      );
    END IF;
  END IF;
  UPDATE platform.principal_classification_requests SET
    state='VERIFIED',verifier_user_id=requested_verifier_user_id,
    verifier_person_id=resolved_verifier_person_id,proposed_person_id=created_person_id,
    verified_at=clock_timestamp()
  WHERE tenant_id=requested_tenant_id AND request_id=pending.request_id;
  INSERT INTO platform.audit_logs(
    id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata
  ) VALUES (
    gen_random_uuid(),requested_tenant_id,requested_verifier_user_id,
    'platform.principals.classify.verify','platform:principal-classification',
    'ALLOWED',requested_correlation_id::text,requested_request_id::text,
    jsonb_build_object('classification_request_id',pending.request_id,
      'target_user_id',pending.target_user_id,'person_id',created_person_id,
      'operator_user_id',pending.operator_user_id,'evidence_id',pending.evidence_id)
  );
  INSERT INTO platform.domain_events(
    event_type,schema_version,tenant_id,correlation_id,producer,classification,payload
  ) VALUES (
    'platform.principal.classification_verified','1.0.0',requested_tenant_id,
    requested_correlation_id,'acs-platform-api','INTERNAL',
    jsonb_build_object('classification_request_id',pending.request_id,
      'target_user_id',pending.target_user_id,'person_id',created_person_id)
  );
  RETURN created_person_id;
END;
$$;
REVOKE ALL ON FUNCTION platform.verify_human_classification(
  uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.verify_human_classification(
  uuid,uuid,uuid,uuid,uuid) TO acs_phase1_tenant_admin;

CREATE TABLE platform.human_operation_attestations (
  reference_hash text PRIMARY KEY CHECK (reference_hash ~ '^[0-9a-f]{64}$'),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  person_id uuid NOT NULL,
  authorization_id uuid NOT NULL,
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 120),
  approval_request_key uuid NOT NULL,
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  classification_version bigint NOT NULL CHECK (classification_version > 0),
  authorization_version bigint NOT NULL CHECK (authorization_version > 0),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (tenant_id,authorization_id)
    REFERENCES platform.mpa_authorization_envelopes(tenant_id,authorization_id),
  FOREIGN KEY (tenant_id,person_id) REFERENCES platform.persons(tenant_id,person_id),
  CHECK (expires_at > issued_at)
);
CREATE INDEX human_operation_attestations_actor_idx
  ON platform.human_operation_attestations(tenant_id,actor_user_id,expires_at);
ALTER TABLE platform.human_operation_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.human_operation_attestations FORCE ROW LEVEL SECURITY;
CREATE POLICY human_attestations_read ON platform.human_operation_attestations
  FOR SELECT TO acs_principal_classification_writer USING (
    platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.approve')
  );
CREATE POLICY human_attestations_insert ON platform.human_operation_attestations
  FOR INSERT TO acs_principal_classification_writer WITH CHECK (
    platform.has_trusted_tenant_context(tenant_id,actor_user_id,'platform.mpa.approve')
  );
REVOKE ALL ON platform.human_operation_attestations FROM PUBLIC;

CREATE FUNCTION platform.issue_human_operation_attestation(
  requested_tenant_id uuid,
  requested_actor_user_id uuid,
  requested_authorization_id uuid,
  requested_approval_request_key uuid,
  requested_expected_version bigint,
  requested_request_id uuid,
  requested_correlation_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  current_envelope platform.mpa_authorization_envelopes%ROWTYPE;
  current_classification platform.principal_classifications%ROWTYPE;
  fresh_reference uuid;
  valid_until timestamptz;
BEGIN
  IF NOT platform.has_trusted_tenant_context(
    requested_tenant_id,requested_actor_user_id,'platform.mpa.approve'
  ) THEN RETURN NULL; END IF;
  SELECT * INTO current_envelope FROM platform.mpa_authorization_envelopes
    WHERE tenant_id=requested_tenant_id AND authorization_id=requested_authorization_id;
  IF current_envelope.authorization_id IS NULL
    OR current_envelope.version <> requested_expected_version
    OR current_envelope.state NOT IN ('REQUESTED','PARTIALLY_APPROVED')
    OR current_envelope.expires_at <= clock_timestamp() THEN RETURN NULL; END IF;
  SELECT * INTO current_classification FROM platform.principal_classifications
    WHERE tenant_id=requested_tenant_id AND user_id=requested_actor_user_id;
  IF current_classification.user_id IS NULL
    OR current_classification.principal_type <> 'HUMAN'
    OR current_classification.status <> 'VERIFIED'
    OR current_classification.person_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM platform.persons p
      WHERE p.tenant_id=requested_tenant_id
        AND p.person_id=current_classification.person_id AND p.status='VERIFIED'
    )
    OR NOT EXISTS (
      SELECT 1 FROM platform.users u
      CROSS JOIN LATERAL platform.resolve_active_tenant_membership(
        u.external_subject,requested_tenant_id) m
      WHERE u.id=requested_actor_user_id AND m.user_id=u.id
        AND CASE WHEN u.external_subject IS JSON ARRAY
          THEN u.external_subject::jsonb = jsonb_build_array(
            current_classification.issuer,current_classification.subject)
          ELSE false END
    ) THEN RETURN NULL; END IF;
  fresh_reference := gen_random_uuid();
  valid_until := LEAST(current_envelope.expires_at,clock_timestamp()+interval '5 minutes');
  INSERT INTO platform.human_operation_attestations(
    reference_hash,tenant_id,actor_user_id,person_id,authorization_id,operation,
    approval_request_key,policy_id,policy_version,classification_version,
    authorization_version,expires_at
  ) VALUES (
    encode(sha256(convert_to(fresh_reference::text,'UTF8')),'hex'),
    requested_tenant_id,requested_actor_user_id,current_classification.person_id,
    requested_authorization_id,
    current_envelope.operation,requested_approval_request_key,
    current_envelope.policy_id,current_envelope.policy_version,
    current_classification.version,current_envelope.version,valid_until
  );
  INSERT INTO platform.audit_logs(
    id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata
  ) VALUES (
    gen_random_uuid(),requested_tenant_id,requested_actor_user_id,'platform.principals.attest',
    'platform:human-operation-attestation','ALLOWED',requested_correlation_id::text,
    requested_request_id::text,
    jsonb_build_object('authorization_id',requested_authorization_id,
      'operation',current_envelope.operation,'policy_id',current_envelope.policy_id,
      'policy_version',current_envelope.policy_version,
      'classification_version',current_classification.version)
  );
  INSERT INTO platform.domain_events(
    event_type,schema_version,tenant_id,correlation_id,producer,classification,payload
  ) VALUES (
    'platform.principal.attested','1.0.0',requested_tenant_id,requested_correlation_id,
    'acs-platform-api','INTERNAL',
    jsonb_build_object('authorization_id',requested_authorization_id,
      'operation',current_envelope.operation,'actor_user_id',requested_actor_user_id)
  );
  RETURN jsonb_build_object('reference',fresh_reference,'expires_at',valid_until);
END;
$$;
REVOKE ALL ON FUNCTION platform.issue_human_operation_attestation(
  uuid,uuid,uuid,uuid,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.issue_human_operation_attestation(
  uuid,uuid,uuid,uuid,bigint,uuid,uuid) TO acs_platform_mpa;

CREATE FUNCTION platform.verify_human_operation_attestation(
  requested_tenant_id uuid,
  requested_actor_user_id uuid,
  requested_reference_hash text,
  requested_authorization_id uuid,
  requested_approval_request_key uuid
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  att platform.human_operation_attestations%ROWTYPE;
  envelope platform.mpa_authorization_envelopes%ROWTYPE;
  actor_person_id uuid;
BEGIN
  IF NOT platform.has_trusted_tenant_context(
    requested_tenant_id,requested_actor_user_id,'platform.mpa.approve'
  ) OR requested_reference_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  SELECT * INTO att FROM platform.human_operation_attestations
  WHERE reference_hash=requested_reference_hash AND tenant_id=requested_tenant_id
    AND actor_user_id=requested_actor_user_id
    AND authorization_id=requested_authorization_id
    AND approval_request_key=requested_approval_request_key
    AND expires_at>clock_timestamp();
  IF att.reference_hash IS NULL THEN RETURN false; END IF;
  SELECT * INTO envelope FROM platform.mpa_authorization_envelopes
  WHERE tenant_id=requested_tenant_id AND authorization_id=requested_authorization_id;
  IF envelope.authorization_id IS NULL OR envelope.version<>att.authorization_version
    OR envelope.policy_id<>att.policy_id OR envelope.policy_version<>att.policy_version
    OR envelope.operation<>att.operation
    OR envelope.state NOT IN ('REQUESTED','PARTIALLY_APPROVED')
    OR envelope.expires_at<=clock_timestamp() THEN RETURN false; END IF;
  SELECT c.person_id INTO actor_person_id
  FROM platform.principal_classifications c
  JOIN platform.persons p ON p.tenant_id=c.tenant_id AND p.person_id=c.person_id
  JOIN platform.users u ON u.id=c.user_id
  CROSS JOIN LATERAL platform.resolve_active_tenant_membership(
    u.external_subject,requested_tenant_id) m
  WHERE c.tenant_id=requested_tenant_id AND c.user_id=requested_actor_user_id
    AND c.person_id=att.person_id AND c.version=att.classification_version
    AND c.principal_type='HUMAN' AND c.status='VERIFIED' AND p.status='VERIFIED'
    AND m.user_id=u.id
    AND CASE WHEN u.external_subject IS JSON ARRAY
      THEN u.external_subject::jsonb = jsonb_build_array(c.issuer,c.subject)
      ELSE false END;
  IF actor_person_id IS NULL THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM platform.mpa_policy_authority_requirements r
    WHERE r.policy_id=envelope.policy_id AND r.policy_version=envelope.policy_version
      AND r.requester_independent
  ) AND NOT EXISTS (
    SELECT 1 FROM platform.principal_classifications c
    JOIN platform.persons p ON p.tenant_id=c.tenant_id AND p.person_id=c.person_id
    WHERE c.tenant_id=requested_tenant_id AND c.user_id=envelope.requester_user_id
      AND c.principal_type='HUMAN' AND c.status='VERIFIED' AND p.status='VERIFIED'
      AND c.person_id<>actor_person_id
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM platform.mpa_authorization_decisions d
    LEFT JOIN platform.principal_classifications c
      ON c.tenant_id=d.tenant_id AND c.user_id=d.actor_user_id
    LEFT JOIN platform.persons p ON p.tenant_id=c.tenant_id AND p.person_id=c.person_id
    WHERE d.tenant_id=requested_tenant_id
      AND d.authorization_id=requested_authorization_id AND d.decision='APPROVE'
      AND (c.user_id IS NULL OR c.principal_type<>'HUMAN' OR c.status<>'VERIFIED'
        OR p.status IS DISTINCT FROM 'VERIFIED'
        OR c.person_id=actor_person_id)
  ) THEN RETURN false; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION platform.verify_human_operation_attestation(
  uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.verify_human_operation_attestation(
  uuid,uuid,text,uuid,uuid) TO acs_platform_mpa;

CREATE FUNCTION platform.set_principal_classification(
  requested_tenant_id uuid,
  requested_actor_user_id uuid,
  requested_target_user_id uuid,
  requested_type text,
  requested_status text,
  requested_policy_version text,
  requested_evidence_id uuid,
  expected_version bigint,
  requested_request_id uuid,
  requested_correlation_id uuid
) RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  target_subject text;
  subject_parts jsonb;
  current_version bigint;
  current_type text;
  next_version bigint;
  operator_person_id uuid;
BEGIN
  IF NOT platform.has_trusted_tenant_context(
    requested_tenant_id, requested_actor_user_id, 'platform.principals.classify'
  ) OR requested_actor_user_id = requested_target_user_id
    OR requested_type = 'HUMAN'
    OR requested_type NOT IN ('HUMAN','SERVICE','MACHINE','AUTOMATION','AI_AGENT','UNKNOWN')
    OR requested_status NOT IN ('VERIFIED','SUSPENDED','REVOKED')
    OR length(requested_policy_version) NOT BETWEEN 1 AND 80
    OR requested_evidence_id IS NULL
    OR expected_version < 0 THEN
    RETURN NULL;
  END IF;
  SELECT c.person_id INTO operator_person_id
  FROM platform.principal_classifications c
  JOIN platform.persons p ON p.tenant_id=c.tenant_id AND p.person_id=c.person_id
  WHERE c.tenant_id=requested_tenant_id AND c.user_id=requested_actor_user_id
    AND c.principal_type='HUMAN' AND c.status='VERIFIED'
    AND p.status='VERIFIED'
    AND platform.is_tenant_action_authorized(requested_actor_user_id,requested_tenant_id,
      'platform.principals.classify.operator');
  IF operator_person_id IS NULL THEN RETURN NULL; END IF;
  SELECT u.external_subject INTO target_subject
  FROM platform.users u
  CROSS JOIN LATERAL platform.resolve_active_tenant_membership(
    u.external_subject,requested_tenant_id) m
  WHERE u.id=requested_target_user_id AND m.user_id=u.id;
  IF target_subject IS NULL THEN RETURN NULL; END IF;
  BEGIN
    subject_parts := target_subject::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
  IF jsonb_typeof(subject_parts) <> 'array' OR jsonb_array_length(subject_parts) <> 2
    OR jsonb_typeof(subject_parts->0) <> 'string'
    OR jsonb_typeof(subject_parts->1) <> 'string'
    OR length(subject_parts->>0) NOT BETWEEN 1 AND 512
    OR length(subject_parts->>1) NOT BETWEEN 1 AND 255 THEN RETURN NULL; END IF;

  SELECT version,principal_type INTO current_version,current_type
    FROM platform.principal_classifications
    WHERE tenant_id=requested_tenant_id AND user_id=requested_target_user_id FOR UPDATE;
  IF COALESCE(current_version,0) <> expected_version OR current_type='HUMAN'
    THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM platform.principal_classifications c
    WHERE c.tenant_id=requested_tenant_id AND c.user_id=requested_target_user_id
      AND c.person_id=operator_person_id
  ) THEN RETURN NULL; END IF;
  IF current_version IS NULL THEN
    INSERT INTO platform.principal_classifications(
      tenant_id,user_id,principal_type,status,issuer,subject,classification_source,
      policy_version,evidence_id,classified_by
    ) VALUES (
      requested_tenant_id,requested_target_user_id,requested_type,requested_status,
      subject_parts->>0,subject_parts->>1,'GOVERNED_OPERATOR',
      requested_policy_version,requested_evidence_id,requested_actor_user_id
    ) RETURNING version INTO next_version;
  ELSE
    UPDATE platform.principal_classifications SET
      principal_type=requested_type,status=requested_status,
      person_id=NULL,verified_by=NULL,
      issuer=subject_parts->>0,subject=subject_parts->>1,
      policy_version=requested_policy_version,
      evidence_id=requested_evidence_id,
      classified_by=requested_actor_user_id,
      verified_at=clock_timestamp(),version=version+1
    WHERE tenant_id=requested_tenant_id AND user_id=requested_target_user_id
    RETURNING version INTO next_version;
  END IF;
  INSERT INTO platform.audit_logs(
    id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata
  ) VALUES (
    gen_random_uuid(),requested_tenant_id,requested_actor_user_id,'platform.principals.classify',
    'platform:principal-classification','ALLOWED',requested_correlation_id::text,
    requested_request_id::text,
    jsonb_build_object('target_user_id',requested_target_user_id,'principal_type',requested_type,
      'classification_status',requested_status,'policy_version',requested_policy_version,
      'classification_version',next_version)
  );
  INSERT INTO platform.domain_events(
    event_type,schema_version,tenant_id,correlation_id,producer,classification,payload
  ) VALUES (
    'platform.principal.classified','1.0.0',requested_tenant_id,requested_correlation_id,
    'acs-platform-api','INTERNAL',
    jsonb_build_object('user_id',requested_target_user_id,'principal_type',requested_type,
      'classification_status',requested_status,'version',next_version)
  );
  RETURN next_version;
END;
$$;
REVOKE ALL ON FUNCTION platform.set_principal_classification(
  uuid,uuid,uuid,text,text,text,uuid,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.set_principal_classification(
  uuid,uuid,uuid,text,text,text,uuid,bigint,uuid,uuid) TO acs_phase1_tenant_admin;

CREATE FUNCTION platform.transition_human_classification(
  requested_tenant_id uuid,
  requested_actor_user_id uuid,
  requested_target_user_id uuid,
  requested_transition text,
  requested_reason_code text,
  requested_evidence_id uuid,
  requested_expected_version bigint,
  requested_idempotency_key uuid,
  requested_request_id uuid,
  requested_correlation_id uuid
) RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor_person_id uuid;
  prior_transition platform.principal_classification_lifecycle%ROWTYPE;
  prior_classification platform.principal_classifications%ROWTYPE;
  next_classification platform.principal_classifications%ROWTYPE;
  next_status text;
  bound_command_hash text;
  authorization_hash text;
BEGIN
  IF NOT platform.has_trusted_tenant_context(
    requested_tenant_id,requested_actor_user_id,'platform.principals.classify'
  ) OR requested_actor_user_id=requested_target_user_id
    OR requested_transition NOT IN ('SUSPEND','REACTIVATE','REVOKE')
    OR requested_reason_code !~ '^[A-Z][A-Z0-9_]{2,63}$'
    OR requested_evidence_id IS NULL OR requested_expected_version < 1
    OR requested_idempotency_key IS NULL THEN RETURN NULL; END IF;
  SELECT c.person_id INTO actor_person_id
  FROM platform.principal_classifications c
  JOIN platform.persons p ON p.tenant_id=c.tenant_id AND p.person_id=c.person_id
  WHERE c.tenant_id=requested_tenant_id AND c.user_id=requested_actor_user_id
    AND c.principal_type='HUMAN' AND c.status='VERIFIED' AND p.status='VERIFIED'
    AND platform.is_tenant_action_authorized(requested_actor_user_id,requested_tenant_id,
      'platform.principals.classify.operator');
  IF actor_person_id IS NULL THEN RETURN NULL; END IF;
  bound_command_hash := encode(sha256(convert_to(jsonb_build_array(
    requested_tenant_id,requested_actor_user_id,requested_target_user_id,
    requested_transition,requested_reason_code,requested_evidence_id,
    requested_expected_version)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    requested_tenant_id::text || requested_idempotency_key::text,0));
  SELECT * INTO prior_transition FROM platform.principal_classification_lifecycle
    WHERE tenant_id=requested_tenant_id AND transition_id=requested_idempotency_key;
  IF prior_transition.transition_id IS NOT NULL THEN
    IF prior_transition.command_hash=bound_command_hash THEN
      RETURN prior_transition.to_version;
    END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM platform.users u
    CROSS JOIN LATERAL platform.resolve_active_tenant_membership(
      u.external_subject,requested_tenant_id) m
    WHERE u.id=requested_target_user_id AND m.user_id=u.id
  ) THEN RETURN NULL; END IF;
  SELECT * INTO prior_classification FROM platform.principal_classifications
    WHERE tenant_id=requested_tenant_id AND user_id=requested_target_user_id FOR UPDATE;
  IF prior_classification.user_id IS NULL
    OR prior_classification.principal_type<>'HUMAN'
    OR prior_classification.version<>requested_expected_version
    OR prior_classification.person_id IS NULL
    OR prior_classification.person_id=actor_person_id
    OR NOT EXISTS (
      SELECT 1 FROM platform.persons p
      WHERE p.tenant_id=requested_tenant_id
        AND p.person_id=prior_classification.person_id AND p.status='VERIFIED'
    ) THEN RETURN NULL; END IF;
  next_status := CASE
    WHEN requested_transition='SUSPEND' AND prior_classification.status='VERIFIED'
      THEN 'SUSPENDED'
    WHEN requested_transition='REACTIVATE' AND prior_classification.status='SUSPENDED'
      THEN 'VERIFIED'
    WHEN requested_transition='REVOKE'
      AND prior_classification.status IN ('VERIFIED','SUSPENDED') THEN 'REVOKED'
    ELSE NULL END;
  IF next_status IS NULL THEN RETURN NULL; END IF;
  UPDATE platform.principal_classifications SET
    status=next_status,version=version+1
  WHERE tenant_id=requested_tenant_id AND user_id=requested_target_user_id
    AND version=requested_expected_version
  RETURNING * INTO next_classification;
  IF next_classification.user_id IS NULL THEN RETURN NULL; END IF;
  authorization_hash := encode(sha256(convert_to(
    current_setting('app.context_token',true),'UTF8')),'hex');
  INSERT INTO platform.principal_classification_lifecycle(
    transition_id,tenant_id,user_id,actor_user_id,kind,from_version,to_version,
    prior_record,new_record,reason_code,evidence_id,authorization_reference_hash,
    command_hash
  ) VALUES (
    requested_idempotency_key,requested_tenant_id,requested_target_user_id,
    requested_actor_user_id,requested_transition,prior_classification.version,
    next_classification.version,to_jsonb(prior_classification),
    to_jsonb(next_classification),requested_reason_code,requested_evidence_id,
    authorization_hash,bound_command_hash
  );
  INSERT INTO platform.audit_logs(
    id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata
  ) VALUES (
    gen_random_uuid(),requested_tenant_id,requested_actor_user_id,
    'platform.principals.lifecycle.' || lower(requested_transition),
    'platform:principal-classification','ALLOWED',requested_correlation_id::text,
    requested_request_id::text,jsonb_build_object(
      'transition_id',requested_idempotency_key,'target_user_id',requested_target_user_id,
      'reason_code',requested_reason_code,'evidence_id',requested_evidence_id,
      'authorization_reference_hash',authorization_hash,
      'from_version',prior_classification.version,'to_version',next_classification.version)
  );
  INSERT INTO platform.domain_events(
    event_type,schema_version,tenant_id,correlation_id,producer,classification,payload
  ) VALUES (
    'platform.principal.human_lifecycle_changed','1.0.0',requested_tenant_id,
    requested_correlation_id,'acs-platform-api','INTERNAL',jsonb_build_object(
      'transition_id',requested_idempotency_key,'user_id',requested_target_user_id,
      'status',next_status,'version',next_classification.version)
  );
  RETURN next_classification.version;
END;
$$;
REVOKE ALL ON FUNCTION platform.transition_human_classification(
  uuid,uuid,uuid,text,text,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.transition_human_classification(
  uuid,uuid,uuid,text,text,uuid,bigint,uuid,uuid,uuid) TO acs_phase1_tenant_admin;

CREATE TABLE platform.human_genesis_ceremonies (
  genesis_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES platform.tenants(id),
  nonce uuid NOT NULL UNIQUE,
  manifest_hash text NOT NULL UNIQUE CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  signature_base64 text NOT NULL CHECK (length(signature_base64) BETWEEN 64 AND 1024),
  trust_root_id text NOT NULL REFERENCES platform.human_governance_trust_roots(trust_root_id),
  executor_user_id uuid NOT NULL REFERENCES platform.users(id),
  state text NOT NULL CHECK (state = 'COMPLETED'),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE platform.human_genesis_ceremonies ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.human_genesis_ceremonies FORCE ROW LEVEL SECURITY;
CREATE POLICY human_genesis_read ON platform.human_genesis_ceremonies FOR SELECT
  TO acs_principal_classification_writer USING (
    platform.has_trusted_tenant_context(tenant_id,NULL,'platform.principals.genesis.execute'));
CREATE POLICY human_genesis_insert ON platform.human_genesis_ceremonies FOR INSERT
  TO acs_principal_classification_writer WITH CHECK (
    platform.has_trusted_tenant_context(
      tenant_id,executor_user_id,'platform.principals.genesis.execute'));
REVOKE ALL ON platform.human_genesis_ceremonies FROM PUBLIC;

CREATE FUNCTION platform.complete_human_genesis(
  requested_tenant_id uuid,
  requested_executor_user_id uuid,
  requested_genesis_id uuid,
  requested_nonce uuid,
  requested_manifest_hash text,
  requested_signature_base64 text,
  requested_root_id text,
  requested_issued_at timestamptz,
  requested_not_before timestamptz,
  requested_expires_at timestamptz,
  requested_candidates jsonb,
  requested_request_id uuid,
  requested_correlation_id uuid
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  candidate record;
  root_row platform.human_governance_trust_roots%ROWTYPE;
  target_subject text;
  subject_parts jsonb;
  current_type text;
  genesis_now timestamptz := clock_timestamp();
BEGIN
  IF NOT platform.has_trusted_tenant_context(
    requested_tenant_id,requested_executor_user_id,'platform.principals.genesis.execute')
    OR NOT platform.is_tenant_action_authorized(
      requested_executor_user_id,requested_tenant_id,'platform.principals.genesis.execute')
    OR requested_manifest_hash !~ '^[0-9a-f]{64}$'
    OR length(requested_signature_base64) NOT BETWEEN 64 AND 1024
    OR requested_issued_at > genesis_now OR requested_not_before > genesis_now
    OR requested_expires_at <= genesis_now OR requested_issued_at > requested_not_before
    OR requested_not_before >= requested_expires_at
    OR jsonb_typeof(requested_candidates) <> 'array'
    OR jsonb_array_length(requested_candidates) <> 3
  THEN RETURN false; END IF;

  SELECT * INTO root_row FROM platform.human_governance_trust_roots
    WHERE trust_root_id=requested_root_id FOR SHARE;
  IF root_row.trust_root_id IS NULL OR root_row.status <> 'ACTIVE'
    OR root_row.purpose <> 'HUMAN_PRINCIPAL_GENESIS_AUTHORIZATION'
    OR root_row.algorithm <> 'ECDSA_P256_SHA256'
    OR root_row.revoked_at IS NOT NULL
    OR root_row.not_before > genesis_now OR root_row.not_after <= genesis_now
  THEN RETURN false; END IF;

  PERFORM 1 FROM platform.tenants WHERE id=requested_tenant_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM platform.human_genesis_ceremonies WHERE tenant_id=requested_tenant_id
  ) OR EXISTS (
    SELECT 1 FROM platform.principal_classifications
    WHERE tenant_id=requested_tenant_id AND principal_type='HUMAN'
  ) THEN RETURN false; END IF;

  IF (SELECT count(DISTINCT principal_id) FROM jsonb_to_recordset(requested_candidates)
      AS c(principal_id uuid,person_id uuid,evidence_reference uuid)) <> 3
    OR (SELECT count(DISTINCT person_id) FROM jsonb_to_recordset(requested_candidates)
      AS c(principal_id uuid,person_id uuid,evidence_reference uuid)) <> 3
    OR (SELECT count(DISTINCT evidence_reference) FROM jsonb_to_recordset(requested_candidates)
      AS c(principal_id uuid,person_id uuid,evidence_reference uuid)) <> 3
  THEN RETURN false; END IF;

  FOR candidate IN SELECT * FROM jsonb_to_recordset(requested_candidates)
    AS c(principal_id uuid,person_id uuid,evidence_reference uuid)
  LOOP
    IF candidate.principal_id IS NULL OR candidate.person_id IS NULL
      OR candidate.evidence_reference IS NULL OR candidate.principal_id=requested_executor_user_id
      OR EXISTS (SELECT 1 FROM platform.persons p
        WHERE p.tenant_id=requested_tenant_id AND p.person_id=candidate.person_id)
      OR EXISTS (SELECT 1 FROM platform.machine_principals p
        WHERE p.id=candidate.principal_id AND p.tenant_id=requested_tenant_id)
    THEN RETURN false; END IF;
    SELECT u.external_subject INTO target_subject FROM platform.users u
      CROSS JOIN LATERAL platform.resolve_active_tenant_membership(
        u.external_subject,requested_tenant_id) m
      WHERE u.id=candidate.principal_id AND m.user_id=u.id;
    IF target_subject IS NULL THEN RETURN false; END IF;
    BEGIN
      subject_parts := target_subject::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN RETURN false;
    END;
    IF jsonb_typeof(subject_parts) <> 'array' OR jsonb_array_length(subject_parts) <> 2
      OR jsonb_typeof(subject_parts->0) <> 'string'
      OR jsonb_typeof(subject_parts->1) <> 'string'
      OR length(subject_parts->>0) NOT BETWEEN 1 AND 512
      OR length(subject_parts->>1) NOT BETWEEN 1 AND 255
    THEN RETURN false; END IF;
    SELECT principal_type INTO current_type FROM platform.principal_classifications
      WHERE tenant_id=requested_tenant_id AND user_id=candidate.principal_id FOR UPDATE;
    IF current_type IS NOT NULL AND current_type <> 'UNKNOWN' THEN RETURN false; END IF;
  END LOOP;

  INSERT INTO platform.human_genesis_ceremonies(
    genesis_id,tenant_id,nonce,manifest_hash,signature_base64,
    trust_root_id,executor_user_id,state
  ) VALUES (
    requested_genesis_id,requested_tenant_id,requested_nonce,requested_manifest_hash,
    requested_signature_base64,requested_root_id,requested_executor_user_id,'COMPLETED'
  );
  FOR candidate IN SELECT * FROM jsonb_to_recordset(requested_candidates)
    AS c(principal_id uuid,person_id uuid,evidence_reference uuid)
  LOOP
    SELECT u.external_subject::jsonb INTO subject_parts FROM platform.users u
      WHERE u.id=candidate.principal_id;
    INSERT INTO platform.persons(tenant_id,person_id,status,policy_version,evidence_id)
      VALUES(requested_tenant_id,candidate.person_id,'VERIFIED','HUMAN_GENESIS_V1',
        candidate.evidence_reference);
    INSERT INTO platform.principal_classifications(
      tenant_id,user_id,principal_type,status,person_id,issuer,subject,
      classification_source,policy_version,evidence_id,classified_by
    ) VALUES (
      requested_tenant_id,candidate.principal_id,'HUMAN','VERIFIED',candidate.person_id,
      subject_parts->>0,subject_parts->>1,'SIGNED_GENESIS','HUMAN_GENESIS_V1',
      candidate.evidence_reference,requested_executor_user_id
    ) ON CONFLICT (tenant_id,user_id) DO UPDATE SET
      principal_type='HUMAN',status='VERIFIED',person_id=EXCLUDED.person_id,
      issuer=EXCLUDED.issuer,subject=EXCLUDED.subject,
      classification_source='SIGNED_GENESIS',policy_version='HUMAN_GENESIS_V1',
      evidence_id=EXCLUDED.evidence_id,classified_by=requested_executor_user_id,
      verified_by=NULL,verified_at=clock_timestamp(),version=platform.principal_classifications.version+1;
  END LOOP;
  INSERT INTO platform.audit_logs(
    id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata
  ) VALUES (
    gen_random_uuid(),requested_tenant_id,requested_executor_user_id,
    'platform.principals.genesis.execute','platform:human-principal-genesis','ALLOWED',
    requested_correlation_id::text,requested_request_id::text,
    jsonb_build_object('genesis_id',requested_genesis_id,'manifest_hash',requested_manifest_hash,
      'trust_root_id',requested_root_id,'person_count',3)
  );
  INSERT INTO platform.domain_events(
    event_type,schema_version,tenant_id,correlation_id,producer,classification,payload
  ) VALUES (
    'platform.human_genesis.completed','1.0.0',requested_tenant_id,
    requested_correlation_id,'acs-platform-api','INTERNAL',
    jsonb_build_object('genesis_id',requested_genesis_id,'person_count',3)
  );
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION platform.complete_human_genesis(
  uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,timestamptz,jsonb,uuid,uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.complete_human_genesis(
  uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,timestamptz,jsonb,uuid,uuid)
  TO acs_phase1_tenant_admin;

COMMIT;
