BEGIN;

CREATE SCHEMA IF NOT EXISTS xcf;

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('xcf.framework_source.read','Read registered XCF framework-source metadata and state.'),
 ('xcf.framework_source.register','Register a validated non-active XCF framework source.'),
 ('xcf.framework_source.activate','Activate a validated XCF framework source through canonical MPA.'),
 ('xcf.framework_source.suspend','Fail closed by suspending an active XCF framework source.'),
 ('xcf.framework_source.revoke','Revoke an XCF framework source through canonical MPA.'),
 ('xcf.publisher.read','Read XCF publisher identity and trust state.'),
 ('xcf.publisher.administer','Administer non-activating XCF publisher metadata.'),
 ('xcf.framework_release.read','Read immutable XCF framework-release provenance.'),
 ('xcf.framework_release.ingest','Ingest an XCF release into a non-active validation state.'),
 ('xcf.framework_release.approve','Approve an ingested XCF release without activating it.'),
 ('xcf.framework_release.activate','Activate exactly one approved XCF framework release through canonical MPA.'),
 ('xcf.framework_release.revoke','Revoke an approved or active XCF framework release through canonical MPA.')
ON CONFLICT(permission_key) DO NOTHING;

INSERT INTO platform.mpa_authority_classes(authority_class_id) VALUES
 ('xcf.knowledge_custodian_authority'),
 ('xcf.security_governance_authority')
ON CONFLICT(authority_class_id) DO NOTHING;

INSERT INTO platform.mpa_policies
 (policy_id,policy_version,operation,consumption_policy,expiry_interval,status) VALUES
 ('xcf.framework_source.activate.standard','1.0.0','xcf.framework_source.activate','SINGLE_USE',interval '15 minutes','ACTIVE'),
 ('xcf.framework_source.revoke.standard','1.0.0','xcf.framework_source.revoke','SINGLE_USE',interval '15 minutes','ACTIVE'),
 ('xcf.framework_release.activate.standard','1.0.0','xcf.framework_release.activate','SINGLE_USE',interval '15 minutes','ACTIVE'),
 ('xcf.framework_release.revoke.standard','1.0.0','xcf.framework_release.revoke','SINGLE_USE',interval '15 minutes','ACTIVE')
ON CONFLICT(policy_id,policy_version) DO NOTHING;

INSERT INTO platform.mpa_policy_authority_requirements
 (policy_id,policy_version,authority_class_id,required_count,requester_independent) VALUES
 ('xcf.framework_source.activate.standard','1.0.0','xcf.knowledge_custodian_authority',1,true),
 ('xcf.framework_source.activate.standard','1.0.0','xcf.security_governance_authority',1,true),
 ('xcf.framework_source.revoke.standard','1.0.0','xcf.knowledge_custodian_authority',1,true),
 ('xcf.framework_source.revoke.standard','1.0.0','xcf.security_governance_authority',1,true),
 ('xcf.framework_release.activate.standard','1.0.0','xcf.knowledge_custodian_authority',1,true),
 ('xcf.framework_release.activate.standard','1.0.0','xcf.security_governance_authority',1,true),
 ('xcf.framework_release.revoke.standard','1.0.0','xcf.knowledge_custodian_authority',1,true),
 ('xcf.framework_release.revoke.standard','1.0.0','xcf.security_governance_authority',1,true)
ON CONFLICT(policy_id,policy_version,authority_class_id) DO NOTHING;

CREATE TABLE xcf.publishers (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  publisher_id uuid NOT NULL,
  publisher_key text NOT NULL CHECK(publisher_key ~ '^[a-z][a-z0-9_.-]+$'),
  legal_name text NOT NULL CHECK(length(legal_name) BETWEEN 1 AND 200),
  trust_status text NOT NULL CHECK(trust_status IN ('TRUSTED','SUSPENDED','REVOKED')),
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(governance_tenant_id,publisher_id),
  UNIQUE(governance_tenant_id,publisher_key)
);

CREATE TABLE xcf.frameworks (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  framework_id uuid NOT NULL,
  publisher_id uuid NOT NULL,
  framework_key text NOT NULL CHECK(framework_key ~ '^[a-z][a-z0-9_.-]+$'),
  framework_name text NOT NULL CHECK(length(framework_name) BETWEEN 1 AND 200),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(governance_tenant_id,framework_id),
  UNIQUE(governance_tenant_id,framework_key),
  FOREIGN KEY(governance_tenant_id,publisher_id)
    REFERENCES xcf.publishers(governance_tenant_id,publisher_id)
);

CREATE TABLE xcf.framework_sources (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  source_id uuid NOT NULL,
  publisher_id uuid NOT NULL,
  framework_id uuid NOT NULL,
  framework_key text NOT NULL,
  framework_name text NOT NULL,
  canonical_uri text NOT NULL CHECK(canonical_uri ~ '^https://'),
  allowed_uri_prefixes text[] NOT NULL CHECK(cardinality(allowed_uri_prefixes) BETWEEN 1 AND 16),
  source_format text NOT NULL,
  authentication_method text NOT NULL,
  signature_policy text NOT NULL CHECK(signature_policy IN ('DETACHED_ED25519','DETACHED_RSA_SHA256')),
  trusted_key_reference text NOT NULL,
  hash_algorithm text NOT NULL CHECK(hash_algorithm='SHA-256'),
  license text NOT NULL,
  license_version text NOT NULL,
  license_state text NOT NULL CHECK(license_state IN ('ACTIVE','SUSPENDED','REVOKED')),
  license_allowed_use text NOT NULL CHECK(license_allowed_use IN ('ACS_INTERNAL','ACS_INTERNAL_AND_REDISTRIBUTION')),
  license_activation_compatible boolean NOT NULL,
  redistribution_constraints text NOT NULL,
  status text NOT NULL CHECK(status IN ('VALIDATED','ACTIVE','SUSPENDED','REVOKED')),
  status_reason_reference text,
  review_due_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(governance_tenant_id,source_id),
  UNIQUE(governance_tenant_id,canonical_uri),
  FOREIGN KEY(governance_tenant_id,publisher_id)
    REFERENCES xcf.publishers(governance_tenant_id,publisher_id),
  FOREIGN KEY(governance_tenant_id,framework_id)
    REFERENCES xcf.frameworks(governance_tenant_id,framework_id),
  CHECK(review_due_at > created_at),
  CHECK((status IN ('VALIDATED','ACTIVE') AND status_reason_reference IS NULL)
     OR (status IN ('SUSPENDED','REVOKED') AND status_reason_reference IS NOT NULL))
);

CREATE TABLE xcf.source_artifacts (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  artifact_id uuid NOT NULL,
  source_id uuid NOT NULL,
  artifact_uri text NOT NULL CHECK(artifact_uri ~ '^https://'),
  media_type text NOT NULL,
  artifact_bytes bytea NOT NULL CHECK(octet_length(artifact_bytes) > 0),
  size_bytes bigint NOT NULL CHECK(size_bytes=octet_length(artifact_bytes)),
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[0-9a-f]{64}$'),
  signature_result text NOT NULL CHECK(signature_result IN ('VALID','INVALID')),
  signature_algorithm text NOT NULL CHECK(signature_algorithm IN ('ED25519','RSA-SHA256')),
  trusted_key_reference text NOT NULL,
  license_identity text,
  license_version text,
  retrieved_at timestamptz NOT NULL,
  validation_policy_version text NOT NULL,
  evidence_reference text,
  correlation_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(governance_tenant_id,artifact_id),
  UNIQUE(governance_tenant_id,source_id,artifact_sha256),
  FOREIGN KEY(governance_tenant_id,source_id)
    REFERENCES xcf.framework_sources(governance_tenant_id,source_id)
);

CREATE TABLE xcf.framework_releases (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  release_id uuid NOT NULL,
  source_id uuid NOT NULL,
  framework_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  release_version text NOT NULL,
  released_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('INGESTED','APPROVED','ACTIVE','SUPERSEDED','REVOKED','QUARANTINED','REJECTED')),
  status_reason_reference text,
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[0-9a-f]{64}$'),
  object_count integer NOT NULL CHECK(object_count BETWEEN 0 AND 20000),
  ingested_by uuid NOT NULL REFERENCES platform.users(id),
  approved_by uuid REFERENCES platform.users(id),
  approved_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(governance_tenant_id,release_id),
  UNIQUE(governance_tenant_id,framework_id,release_version),
  FOREIGN KEY(governance_tenant_id,source_id)
    REFERENCES xcf.framework_sources(governance_tenant_id,source_id),
  FOREIGN KEY(governance_tenant_id,framework_id)
    REFERENCES xcf.frameworks(governance_tenant_id,framework_id),
  FOREIGN KEY(governance_tenant_id,artifact_id)
    REFERENCES xcf.source_artifacts(governance_tenant_id,artifact_id),
  CHECK((approved_by IS NULL AND approved_at IS NULL) OR
        (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>ingested_by)),
  CHECK(status NOT IN ('REVOKED','QUARANTINED','REJECTED') OR status_reason_reference IS NOT NULL)
);
CREATE UNIQUE INDEX framework_releases_one_active_idx
  ON xcf.framework_releases(governance_tenant_id,framework_id) WHERE status='ACTIVE';

CREATE TABLE xcf.framework_objects (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  object_id uuid NOT NULL,
  release_id uuid NOT NULL,
  external_id text NOT NULL,
  object_type text NOT NULL,
  canonical_payload_sha256 text NOT NULL CHECK(canonical_payload_sha256 ~ '^[0-9a-f]{64}$'),
  parent_external_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(governance_tenant_id,object_id),
  UNIQUE(governance_tenant_id,release_id,external_id),
  FOREIGN KEY(governance_tenant_id,release_id)
    REFERENCES xcf.framework_releases(governance_tenant_id,release_id)
);

CREATE TABLE xcf.release_supersessions (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  supersession_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prior_release_id uuid NOT NULL,
  new_release_id uuid NOT NULL,
  reason_reference text NOT NULL,
  authorized_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(governance_tenant_id,prior_release_id)
    REFERENCES xcf.framework_releases(governance_tenant_id,release_id),
  FOREIGN KEY(governance_tenant_id,new_release_id)
    REFERENCES xcf.framework_releases(governance_tenant_id,release_id),
  UNIQUE(governance_tenant_id,prior_release_id,new_release_id),
  CHECK(prior_release_id<>new_release_id)
);

CREATE TABLE xcf.revocations (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  revocation_id uuid PRIMARY KEY,
  target_type text NOT NULL CHECK(target_type IN ('FRAMEWORK_SOURCE','FRAMEWORK_RELEASE')),
  target_id uuid NOT NULL,
  reason_reference text NOT NULL,
  mpa_authorization_id uuid NOT NULL,
  effective_at timestamptz NOT NULL,
  requested_by uuid NOT NULL REFERENCES platform.users(id),
  downstream_invalidation_state text NOT NULL CHECK(downstream_invalidation_state IN ('PENDING','COMPLETE','FAILED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(governance_tenant_id,target_type,target_id)
);

CREATE TABLE xcf.command_results (
  governance_tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  command text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(governance_tenant_id,idempotency_key)
);

CREATE TRIGGER xcf_artifacts_append_only BEFORE UPDATE OR DELETE ON xcf.source_artifacts
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
CREATE TRIGGER xcf_objects_append_only BEFORE UPDATE OR DELETE ON xcf.framework_objects
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
CREATE TRIGGER xcf_supersessions_append_only BEFORE UPDATE OR DELETE ON xcf.release_supersessions
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
CREATE TRIGGER xcf_revocations_append_only BEFORE UPDATE OR DELETE ON xcf.revocations
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();

CREATE FUNCTION xcf.has_registry_context(row_tenant_id uuid, allowed text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
   SELECT 1 FROM unnest(allowed) AS permission_key
   WHERE platform.has_trusted_tenant_context(row_tenant_id,NULL,permission_key)
 )
$$;
REVOKE ALL ON FUNCTION xcf.has_registry_context(uuid,text[]) FROM PUBLIC;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['publishers','frameworks','framework_sources','source_artifacts',
   'framework_releases','framework_objects','release_supersessions','revocations','command_results'] LOOP
   EXECUTE format('ALTER TABLE xcf.%I ENABLE ROW LEVEL SECURITY',table_name);
   EXECUTE format('ALTER TABLE xcf.%I FORCE ROW LEVEL SECURITY',table_name);
   EXECUTE format(
     'CREATE POLICY %I ON xcf.%I FOR SELECT TO acs_xcf_m1_registry USING
      (xcf.has_registry_context(governance_tenant_id,ARRAY[
        ''xcf.publisher.read'',''xcf.publisher.administer'',''xcf.framework_source.read'',
        ''xcf.framework_source.register'',''xcf.framework_source.suspend'',
        ''xcf.framework_release.read'',''xcf.framework_release.ingest'',
        ''xcf.framework_release.approve'',''platform.mpa.consume'']))',
     table_name||'_read_scope',table_name);
 END LOOP;
END $$;

CREATE POLICY publishers_insert ON xcf.publishers FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.publisher.administer']));
CREATE POLICY frameworks_insert ON xcf.frameworks FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_source.register']));
CREATE POLICY sources_insert ON xcf.framework_sources FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_source.register']));
CREATE POLICY sources_update ON xcf.framework_sources FOR UPDATE TO acs_xcf_m1_registry
 USING(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_source.suspend','platform.mpa.consume']))
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_source.suspend','platform.mpa.consume']));
CREATE POLICY artifacts_insert ON xcf.source_artifacts FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_release.ingest']));
CREATE POLICY releases_insert ON xcf.framework_releases FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_release.ingest']));
CREATE POLICY releases_update ON xcf.framework_releases FOR UPDATE TO acs_xcf_m1_registry
 USING(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_release.approve','platform.mpa.consume']))
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_release.approve','platform.mpa.consume']));
CREATE POLICY objects_insert ON xcf.framework_objects FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['xcf.framework_release.ingest']));
CREATE POLICY supersessions_insert ON xcf.release_supersessions FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['platform.mpa.consume']));
CREATE POLICY revocations_insert ON xcf.revocations FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY['platform.mpa.consume']));
CREATE POLICY commands_insert ON xcf.command_results FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(governance_tenant_id,ARRAY[
  'xcf.publisher.administer','xcf.framework_source.register','xcf.framework_source.suspend',
  'xcf.framework_release.ingest','xcf.framework_release.approve']));

CREATE POLICY audit_logs_xcf_m1_insert ON platform.audit_logs FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(xcf.has_registry_context(tenant_id,ARRAY[
  'xcf.publisher.administer','xcf.framework_source.register','xcf.framework_source.suspend',
  'xcf.framework_release.ingest','xcf.framework_release.approve','platform.mpa.consume']));
CREATE POLICY domain_events_xcf_m1_insert ON platform.domain_events FOR INSERT TO acs_xcf_m1_registry
 WITH CHECK(producer='acs-platform-api' AND event_type LIKE 'xcf.%'
  AND xcf.has_registry_context(tenant_id,ARRAY[
   'xcf.publisher.administer','xcf.framework_source.register','xcf.framework_source.suspend',
   'xcf.framework_release.ingest','xcf.framework_release.approve','platform.mpa.consume']));

REVOKE ALL ON SCHEMA xcf FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA xcf FROM PUBLIC;
GRANT USAGE ON SCHEMA platform,xcf TO acs_xcf_m1_registry;
GRANT SELECT,INSERT ON xcf.publishers,xcf.frameworks,xcf.source_artifacts,xcf.framework_objects,
 xcf.release_supersessions,xcf.revocations,xcf.command_results TO acs_xcf_m1_registry;
GRANT SELECT,INSERT,UPDATE ON xcf.framework_sources,xcf.framework_releases TO acs_xcf_m1_registry;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_xcf_m1_registry;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),
 platform.has_trusted_tenant_context(uuid,uuid,text),xcf.has_registry_context(uuid,text[])
 TO acs_xcf_m1_registry;

-- Narrow canonical MPA consumer privileges only; no MPA administration grant.
GRANT SELECT,UPDATE ON platform.mpa_authorization_envelopes TO acs_xcf_m1_registry;
GRANT SELECT,INSERT ON platform.mpa_consumptions,platform.mpa_command_results TO acs_xcf_m1_registry;
GRANT EXECUTE ON FUNCTION platform.materialize_mpa_expiry(uuid,uuid,uuid,text,uuid,uuid)
 TO acs_xcf_m1_registry;

COMMIT;
