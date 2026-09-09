CREATE SCHEMA IF NOT EXISTS cyberdefense;

INSERT INTO platform.permissions(permission_key,description) VALUES
  ('cyberdefense.evidence.read','Read tenant-scoped governed evidence.'),
  ('cyberdefense.evidence.collect','Collect tenant-scoped governed evidence.'),
  ('cyberdefense.evidence.verify','Verify tenant-scoped evidence integrity.'),
  ('cyberdefense.evidence.derive','Create tenant-scoped evidence derivations.'),
  ('cyberdefense.evidence.export','Export evidence through canonical MPA.'),
  ('cyberdefense.evidence.retain','Apply tenant-scoped evidence retention and legal hold.'),
  ('cyberdefense.evidence.retention_override','Override retention through canonical MPA.'),
  ('cyberdefense.evidence.destroy','Authorize destruction through canonical MPA.')
ON CONFLICT (permission_key) DO NOTHING;

CREATE TABLE cyberdefense.evidence_sources (
  source_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  machine_principal_id uuid NOT NULL, source_type text NOT NULL, connector_type text NOT NULL,
  external_binding text NOT NULL, credential_reference text NOT NULL,
  trust_classification text NOT NULL CHECK (trust_classification IN ('UNTRUSTED','VALIDATED','TRUSTED')),
  ingestion_policy_version text NOT NULL, status text NOT NULL DEFAULT 'REGISTERED'
    CHECK (status IN ('UNREGISTERED','REGISTERED','QUARANTINED','REVOKED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0), created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,source_id), UNIQUE(tenant_id,machine_principal_id),
  FOREIGN KEY (machine_principal_id,tenant_id) REFERENCES platform.machine_principals(id,tenant_id)
);

CREATE TABLE cyberdefense.evidence_blob_references (
  blob_reference_id uuid NOT NULL, tenant_id uuid NOT NULL, storage_model text NOT NULL DEFAULT 'POSTGRESQL_BYTEA_V1'
    CHECK (storage_model='POSTGRESQL_BYTEA_V1'), raw_bytes bytea NOT NULL, media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes >= 0 AND size_bytes=octet_length(raw_bytes)),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,blob_reference_id)
);

CREATE TABLE cyberdefense.evidence_records (
  evidence_id uuid NOT NULL, tenant_id uuid NOT NULL, evidence_source_id uuid NOT NULL,
  parent_evidence_id uuid, blob_reference_id uuid NOT NULL, source_event_id text NOT NULL,
  record_contract_version text NOT NULL DEFAULT '1.0.0' CHECK(record_contract_version='1.0.0'),
  canonicalization_version text NOT NULL CHECK(canonicalization_version='xcap005-evidence-metadata-v1'),
  canonical_metadata jsonb NOT NULL, metadata_sha256 text NOT NULL CHECK(metadata_sha256 ~ '^[0-9a-f]{64}$'),
  ingestion_request_hash text NOT NULL CHECK(ingestion_request_hash ~ '^[0-9a-f]{64}$'),
  classification_at_ingest text NOT NULL CHECK(classification_at_ingest IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED_SECURITY')),
  retention_policy_id text NOT NULL, observed_at timestamptz NOT NULL, collected_by uuid NOT NULL,
  request_id uuid NOT NULL, correlation_id uuid NOT NULL, version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,evidence_id),
  UNIQUE(tenant_id,evidence_source_id,source_event_id),
  FOREIGN KEY(tenant_id,evidence_source_id) REFERENCES cyberdefense.evidence_sources(tenant_id,source_id),
  FOREIGN KEY(tenant_id,blob_reference_id) REFERENCES cyberdefense.evidence_blob_references(tenant_id,blob_reference_id),
  FOREIGN KEY(tenant_id,parent_evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE cyberdefense.evidence_integrity_verifications (
  verification_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, evidence_id uuid NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('VERIFIED','FAILED','UNVERIFIABLE')), bounded_reason text,
  verifier_user_id uuid NOT NULL, content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  metadata_sha256 text NOT NULL CHECK(metadata_sha256 ~ '^[0-9a-f]{64}$'), request_id uuid NOT NULL,
  correlation_id uuid NOT NULL, verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,verification_id), FOREIGN KEY(tenant_id,evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE cyberdefense.evidence_derivations (
  derivation_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, parent_evidence_id uuid NOT NULL,
  derived_evidence_id uuid NOT NULL, transformation_id text NOT NULL, transformation_version text NOT NULL,
  actor_user_id uuid NOT NULL, request_id uuid NOT NULL, correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,derivation_id),
  UNIQUE(tenant_id,derived_evidence_id),
  FOREIGN KEY(tenant_id,parent_evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id),
  FOREIGN KEY(tenant_id,derived_evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE cyberdefense.evidence_custody_entries (
  custody_entry_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, evidence_id uuid NOT NULL,
  sequence bigint NOT NULL, action text NOT NULL CHECK(action IN ('COLLECT','VERIFY','DERIVE','EXPORT','QUARANTINE','CLASSIFICATION','RETENTION_APPLIED','LEGAL_HOLD','DESTRUCTION')),
  actor_user_id uuid, machine_principal_id uuid, reason_reference text, request_id uuid NOT NULL,
  correlation_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,custody_entry_id), UNIQUE(tenant_id,evidence_id,sequence),
  FOREIGN KEY(tenant_id,evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE cyberdefense.evidence_classification_decisions (
  decision_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, evidence_id uuid NOT NULL,
  classification text NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED_SECURITY')),
  actor_user_id uuid NOT NULL, reason_reference text NOT NULL, request_id uuid NOT NULL, correlation_id uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,decision_id),
  FOREIGN KEY(tenant_id,evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE cyberdefense.evidence_retention_policies (
  tenant_id uuid NOT NULL, retention_policy_id text NOT NULL, policy_version text NOT NULL,
  retention_class text NOT NULL, start_trigger text NOT NULL, expiry_interval interval NOT NULL CHECK(expiry_interval > interval '0'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,retention_policy_id,policy_version)
);

CREATE TABLE cyberdefense.evidence_retention_bindings (
  binding_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, evidence_id uuid NOT NULL,
  retention_policy_id text NOT NULL, policy_version text NOT NULL, action text NOT NULL
    CHECK(action IN ('APPLY','OVERRIDE','DESTRUCTION_AUTHORIZED')),
  retention_start timestamptz NOT NULL, retention_expiry timestamptz NOT NULL, actor_user_id uuid NOT NULL,
  reason_reference text NOT NULL, mpa_authorization_id uuid, request_id uuid NOT NULL, correlation_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,binding_id),
  FOREIGN KEY(tenant_id,evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id),
  FOREIGN KEY(tenant_id,retention_policy_id,policy_version) REFERENCES cyberdefense.evidence_retention_policies(tenant_id,retention_policy_id,policy_version)
);

CREATE TABLE cyberdefense.evidence_legal_hold_decisions (
  hold_decision_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, evidence_id uuid NOT NULL,
  hold_reference text NOT NULL, action text NOT NULL CHECK(action IN ('APPLY','RELEASE')),
  actor_user_id uuid NOT NULL, reason_reference text NOT NULL, mpa_authorization_id uuid,
  request_id uuid NOT NULL, correlation_id uuid NOT NULL, decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,hold_decision_id), FOREIGN KEY(tenant_id,evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE cyberdefense.evidence_exports (
  export_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, evidence_id uuid NOT NULL,
  requester_user_id uuid NOT NULL, mpa_authorization_id uuid NOT NULL, classification text NOT NULL,
  content_sha256 text NOT NULL, reason_reference text NOT NULL, request_id uuid NOT NULL, correlation_id uuid NOT NULL,
  exported_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,export_id),
  FOREIGN KEY(tenant_id,evidence_id) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE cyberdefense.evidence_command_results (
  tenant_id uuid NOT NULL, idempotency_key uuid NOT NULL, actor_id uuid NOT NULL, command text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'), result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,idempotency_key)
);

CREATE FUNCTION cyberdefense.prevent_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'XCAP-005 immutable or append-only evidence cannot be changed' USING ERRCODE='55000'; END; $$;

CREATE TRIGGER evidence_blobs_immutable BEFORE UPDATE OR DELETE ON cyberdefense.evidence_blob_references FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();
CREATE TRIGGER evidence_records_immutable BEFORE UPDATE OR DELETE ON cyberdefense.evidence_records FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();
CREATE TRIGGER evidence_integrity_append_only BEFORE UPDATE OR DELETE ON cyberdefense.evidence_integrity_verifications FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();
CREATE TRIGGER evidence_derivations_append_only BEFORE UPDATE OR DELETE ON cyberdefense.evidence_derivations FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();
CREATE TRIGGER evidence_custody_append_only BEFORE UPDATE OR DELETE ON cyberdefense.evidence_custody_entries FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();
CREATE TRIGGER evidence_classification_append_only BEFORE UPDATE OR DELETE ON cyberdefense.evidence_classification_decisions FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();
CREATE TRIGGER evidence_retention_append_only BEFORE UPDATE OR DELETE ON cyberdefense.evidence_retention_bindings FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();
CREATE TRIGGER evidence_holds_append_only BEFORE UPDATE OR DELETE ON cyberdefense.evidence_legal_hold_decisions FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();
CREATE TRIGGER evidence_exports_append_only BEFORE UPDATE OR DELETE ON cyberdefense.evidence_exports FOR EACH ROW EXECUTE FUNCTION cyberdefense.prevent_evidence_mutation();

CREATE FUNCTION cyberdefense.has_evidence_context(row_tenant_id uuid, allowed text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM platform.tenant_context_grants g
  WHERE g.token=CASE WHEN current_setting('app.context_token',true) ~ '^[0-9a-f-]{36}$' THEN current_setting('app.context_token',true)::uuid END
  AND g.tenant_id=row_tenant_id AND g.permission_key=ANY(allowed) AND g.activated_backend_pid=pg_backend_pid()
  AND g.activated_transaction_id=txid_current() AND g.activated_at IS NOT NULL AND g.expires_at>g.activated_at)
$$;

CREATE FUNCTION cyberdefense.register_evidence_machine_principal(
  requested_tenant_id uuid,
  requested_external_binding text,
  required_human_permission text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE created_id uuid;
BEGIN
  IF required_human_permission <> 'cyberdefense.evidence.collect'
     OR NOT platform.has_trusted_tenant_context(requested_tenant_id,NULL,required_human_permission)
  THEN RETURN NULL; END IF;
  INSERT INTO platform.machine_principals(tenant_id,principal_type,external_binding)
  VALUES(requested_tenant_id,'EVIDENCE_SOURCE',requested_external_binding)
  RETURNING id INTO created_id;
  INSERT INTO platform.machine_principal_permissions(tenant_id,machine_principal_id,permission_key)
  VALUES(requested_tenant_id,created_id,'cyberdefense.evidence.collect');
  RETURN created_id;
END; $$;

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['evidence_sources','evidence_blob_references','evidence_records','evidence_integrity_verifications','evidence_derivations','evidence_custody_entries','evidence_classification_decisions','evidence_retention_policies','evidence_retention_bindings','evidence_legal_hold_decisions','evidence_exports','evidence_command_results'] LOOP
 EXECUTE format('ALTER TABLE cyberdefense.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE cyberdefense.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON cyberdefense.%I FOR SELECT TO acs_xcap005_evidence USING (cyberdefense.has_evidence_context(tenant_id,ARRAY[''cyberdefense.evidence.read'',''cyberdefense.evidence.collect'',''cyberdefense.evidence.verify'',''cyberdefense.evidence.derive'',''cyberdefense.evidence.export'',''cyberdefense.evidence.retain'',''cyberdefense.evidence.retention_override'',''cyberdefense.evidence.destroy'',''platform.mpa.consume'']))',t||'_read_scope',t);
 END LOOP; END $$;

CREATE POLICY evidence_sources_insert ON cyberdefense.evidence_sources FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect']));
CREATE POLICY evidence_sources_update ON cyberdefense.evidence_sources FOR UPDATE TO acs_xcap005_evidence USING (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect'])) WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect']));
CREATE POLICY evidence_blobs_insert ON cyberdefense.evidence_blob_references FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect','cyberdefense.evidence.derive']));
CREATE POLICY evidence_records_insert ON cyberdefense.evidence_records FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect','cyberdefense.evidence.derive']));
CREATE POLICY evidence_integrity_insert ON cyberdefense.evidence_integrity_verifications FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect','cyberdefense.evidence.verify','cyberdefense.evidence.derive']));
CREATE POLICY evidence_derivations_insert ON cyberdefense.evidence_derivations FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.derive']));
CREATE POLICY evidence_custody_insert ON cyberdefense.evidence_custody_entries FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect','cyberdefense.evidence.verify','cyberdefense.evidence.derive','cyberdefense.evidence.retain','platform.mpa.consume']));
CREATE POLICY evidence_classification_insert ON cyberdefense.evidence_classification_decisions FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.retain']));
CREATE POLICY evidence_retention_insert ON cyberdefense.evidence_retention_bindings FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect','cyberdefense.evidence.derive','cyberdefense.evidence.retain','platform.mpa.consume']));
CREATE POLICY evidence_holds_insert ON cyberdefense.evidence_legal_hold_decisions FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.retain','platform.mpa.consume']));
CREATE POLICY evidence_exports_insert ON cyberdefense.evidence_exports FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['platform.mpa.consume']));
CREATE POLICY evidence_commands_insert ON cyberdefense.evidence_command_results FOR INSERT TO acs_xcap005_evidence WITH CHECK (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect','cyberdefense.evidence.verify','cyberdefense.evidence.derive','cyberdefense.evidence.retain']));

CREATE POLICY audit_logs_xcap005_insert ON platform.audit_logs FOR INSERT TO acs_xcap005_evidence WITH CHECK
 (cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect','cyberdefense.evidence.verify','cyberdefense.evidence.derive','cyberdefense.evidence.retain','platform.mpa.consume']));
CREATE POLICY domain_events_xcap005_insert ON platform.domain_events FOR INSERT TO acs_xcap005_evidence WITH CHECK
 (producer='acs-platform-api' AND event_type LIKE 'cyberdefense.evidence.%' AND cyberdefense.has_evidence_context(tenant_id,ARRAY['cyberdefense.evidence.collect','cyberdefense.evidence.verify','cyberdefense.evidence.derive','cyberdefense.evidence.retain','platform.mpa.consume']));

REVOKE ALL ON SCHEMA cyberdefense FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA cyberdefense FROM PUBLIC;
GRANT USAGE ON SCHEMA platform,cyberdefense TO acs_xcap005_evidence;
GRANT SELECT,INSERT,UPDATE ON cyberdefense.evidence_sources TO acs_xcap005_evidence;
GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA cyberdefense TO acs_xcap005_evidence;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_xcap005_evidence;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),platform.has_trusted_tenant_context(uuid,uuid,text),platform.set_machine_principal_status(uuid,uuid,text,text),cyberdefense.has_evidence_context(uuid,text[]),cyberdefense.register_evidence_machine_principal(uuid,text,text) TO acs_xcap005_evidence;

-- Narrow canonical MPA consumer privileges; no MPA policy/authority administration grant.
GRANT SELECT,UPDATE ON platform.mpa_authorization_envelopes TO acs_xcap005_evidence;
GRANT SELECT,INSERT ON platform.mpa_consumptions,platform.mpa_command_results TO acs_xcap005_evidence;
GRANT EXECUTE ON FUNCTION platform.materialize_mpa_expiry(uuid,uuid,uuid,text,uuid,uuid) TO acs_xcap005_evidence;
