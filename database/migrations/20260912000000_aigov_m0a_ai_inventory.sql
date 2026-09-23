BEGIN;

CREATE SCHEMA IF NOT EXISTS ai_governance;

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('aigov.inventory.read','Read tenant-bound AI Inventory metadata.'),
 ('aigov.ai_system.create','Register an AI system without activating or deploying it.'),
 ('aigov.ai_system.update','Update non-protected AI system metadata.'),
 ('aigov.model.create','Register an AI model identity.'),
 ('aigov.model.update','Update non-protected AI model metadata.'),
 ('aigov.model_version.register','Register immutable AI model-version provenance.'),
 ('aigov.dataset.create','Register an AI dataset identity.'),
 ('aigov.dataset.update','Update non-protected AI dataset metadata.'),
 ('aigov.dataset_version.register','Register immutable AI dataset-version provenance.'),
 ('aigov.prompt.create','Register an AI prompt identity without prompt content.'),
 ('aigov.prompt.update','Update non-protected AI prompt metadata.'),
 ('aigov.prompt_version.register','Register immutable AI prompt-version provenance without prompt content.')
ON CONFLICT(permission_key) DO NOTHING;

CREATE TABLE ai_governance.ai_systems (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  system_id uuid NOT NULL,
  system_key text NOT NULL CHECK(system_key ~ '^[a-z][a-z0-9_.-]+$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  purpose text NOT NULL CHECK(length(purpose) BETWEEN 1 AND 1000),
  owner_reference text NOT NULL CHECK(length(owner_reference) BETWEEN 1 AND 256),
  classification text NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED_SECURITY')),
  status text NOT NULL DEFAULT 'REGISTERED' CHECK(status='REGISTERED'),
  evidence_reference uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,system_id),
  UNIQUE(tenant_id,system_key),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.models (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  model_id uuid NOT NULL,
  system_id uuid NOT NULL,
  model_key text NOT NULL CHECK(model_key ~ '^[a-z][a-z0-9_.-]+$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  provider_reference text NOT NULL CHECK(length(provider_reference) BETWEEN 1 AND 256),
  classification text NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED_SECURITY')),
  status text NOT NULL DEFAULT 'REGISTERED' CHECK(status='REGISTERED'),
  evidence_reference uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,model_id),
  UNIQUE(tenant_id,model_key),
  FOREIGN KEY(tenant_id,system_id) REFERENCES ai_governance.ai_systems(tenant_id,system_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.model_versions (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  model_version_id uuid NOT NULL,
  model_id uuid NOT NULL,
  version_label text NOT NULL CHECK(length(version_label) BETWEEN 1 AND 128),
  artifact_sha256 text NOT NULL CHECK(artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_reference text NOT NULL CHECK(length(artifact_reference) BETWEEN 1 AND 256),
  source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 256),
  provider_reference text NOT NULL CHECK(length(provider_reference) BETWEEN 1 AND 256),
  provenance_reference uuid NOT NULL,
  evidence_reference uuid NOT NULL,
  trust_state text NOT NULL DEFAULT 'UNVERIFIED' CHECK(trust_state='UNVERIFIED'),
  status text NOT NULL DEFAULT 'REGISTERED' CHECK(status='REGISTERED'),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,model_version_id),
  UNIQUE(tenant_id,model_id,version_label),
  UNIQUE(tenant_id,model_id,artifact_sha256),
  FOREIGN KEY(tenant_id,model_id) REFERENCES ai_governance.models(tenant_id,model_id),
  FOREIGN KEY(tenant_id,provenance_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.datasets (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  dataset_id uuid NOT NULL,
  system_id uuid NOT NULL,
  dataset_key text NOT NULL CHECK(dataset_key ~ '^[a-z][a-z0-9_.-]+$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  classification text NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED_SECURITY')),
  status text NOT NULL DEFAULT 'REGISTERED' CHECK(status='REGISTERED'),
  evidence_reference uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,dataset_id),
  UNIQUE(tenant_id,dataset_key),
  FOREIGN KEY(tenant_id,system_id) REFERENCES ai_governance.ai_systems(tenant_id,system_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.dataset_versions (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  dataset_version_id uuid NOT NULL,
  dataset_id uuid NOT NULL,
  version_label text NOT NULL CHECK(length(version_label) BETWEEN 1 AND 128),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  content_reference text NOT NULL CHECK(length(content_reference) BETWEEN 1 AND 256),
  provenance_reference uuid NOT NULL,
  permitted_uses text[] NOT NULL CHECK(cardinality(permitted_uses) BETWEEN 1 AND 32),
  residency_policy_reference text NOT NULL CHECK(length(residency_policy_reference) BETWEEN 1 AND 256),
  retention_policy_reference text NOT NULL CHECK(length(retention_policy_reference) BETWEEN 1 AND 256),
  evidence_reference uuid NOT NULL,
  status text NOT NULL DEFAULT 'REGISTERED' CHECK(status='REGISTERED'),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,dataset_version_id),
  UNIQUE(tenant_id,dataset_id,version_label),
  UNIQUE(tenant_id,dataset_id,content_sha256),
  FOREIGN KEY(tenant_id,dataset_id) REFERENCES ai_governance.datasets(tenant_id,dataset_id),
  FOREIGN KEY(tenant_id,provenance_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.prompts (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  prompt_id uuid NOT NULL,
  system_id uuid NOT NULL,
  prompt_key text NOT NULL CHECK(prompt_key ~ '^[a-z][a-z0-9_.-]+$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  classification text NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED_SECURITY')),
  status text NOT NULL DEFAULT 'REGISTERED' CHECK(status='REGISTERED'),
  evidence_reference uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,prompt_id),
  UNIQUE(tenant_id,prompt_key),
  FOREIGN KEY(tenant_id,system_id) REFERENCES ai_governance.ai_systems(tenant_id,system_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.prompt_versions (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  prompt_version_id uuid NOT NULL,
  prompt_id uuid NOT NULL,
  version_label text NOT NULL CHECK(length(version_label) BETWEEN 1 AND 128),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  content_reference text NOT NULL CHECK(length(content_reference) BETWEEN 1 AND 256),
  change_reason text NOT NULL CHECK(length(change_reason) BETWEEN 1 AND 512),
  evidence_reference uuid NOT NULL,
  status text NOT NULL DEFAULT 'REGISTERED' CHECK(status='REGISTERED'),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,prompt_version_id),
  UNIQUE(tenant_id,prompt_id,version_label),
  UNIQUE(tenant_id,prompt_id,content_sha256),
  FOREIGN KEY(tenant_id,prompt_id) REFERENCES ai_governance.prompts(tenant_id,prompt_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.command_results (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  command text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,idempotency_key)
);

CREATE TRIGGER aigov_model_versions_immutable BEFORE UPDATE OR DELETE ON ai_governance.model_versions
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
CREATE TRIGGER aigov_dataset_versions_immutable BEFORE UPDATE OR DELETE ON ai_governance.dataset_versions
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
CREATE TRIGGER aigov_prompt_versions_immutable BEFORE UPDATE OR DELETE ON ai_governance.prompt_versions
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();
CREATE TRIGGER aigov_command_results_immutable BEFORE UPDATE OR DELETE ON ai_governance.command_results
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation();

CREATE FUNCTION ai_governance.has_inventory_context(row_tenant_id uuid, allowed text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
   SELECT 1 FROM unnest(allowed) AS permission_key
   WHERE platform.has_trusted_tenant_context(row_tenant_id,NULL,permission_key)
 )
$$;
REVOKE ALL ON FUNCTION ai_governance.has_inventory_context(uuid,text[]) FROM PUBLIC;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['ai_systems','models','model_versions','datasets',
   'dataset_versions','prompts','prompt_versions','command_results'] LOOP
   EXECUTE format('ALTER TABLE ai_governance.%I ENABLE ROW LEVEL SECURITY',table_name);
   EXECUTE format('ALTER TABLE ai_governance.%I FORCE ROW LEVEL SECURITY',table_name);
   EXECUTE format(
     'CREATE POLICY %I ON ai_governance.%I FOR SELECT TO acs_aigov_m0a_inventory USING
      (ai_governance.has_inventory_context(tenant_id,ARRAY[
       ''aigov.inventory.read'',''aigov.ai_system.create'',''aigov.ai_system.update'',
       ''aigov.model.create'',''aigov.model.update'',''aigov.model_version.register'',
       ''aigov.dataset.create'',''aigov.dataset.update'',''aigov.dataset_version.register'',
       ''aigov.prompt.create'',''aigov.prompt.update'',''aigov.prompt_version.register'']))',
     table_name||'_read_scope',table_name);
 END LOOP;
END $$;

CREATE POLICY systems_insert ON ai_governance.ai_systems FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.ai_system.create']));
CREATE POLICY systems_update ON ai_governance.ai_systems FOR UPDATE TO acs_aigov_m0a_inventory
 USING(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.ai_system.update']))
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.ai_system.update']));
CREATE POLICY models_insert ON ai_governance.models FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.model.create']));
CREATE POLICY models_update ON ai_governance.models FOR UPDATE TO acs_aigov_m0a_inventory
 USING(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.model.update']))
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.model.update']));
CREATE POLICY model_versions_insert ON ai_governance.model_versions FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.model_version.register']));
CREATE POLICY datasets_insert ON ai_governance.datasets FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.dataset.create']));
CREATE POLICY datasets_update ON ai_governance.datasets FOR UPDATE TO acs_aigov_m0a_inventory
 USING(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.dataset.update']))
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.dataset.update']));
CREATE POLICY dataset_versions_insert ON ai_governance.dataset_versions FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.dataset_version.register']));
CREATE POLICY prompts_insert ON ai_governance.prompts FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.prompt.create']));
CREATE POLICY prompts_update ON ai_governance.prompts FOR UPDATE TO acs_aigov_m0a_inventory
 USING(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.prompt.update']))
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.prompt.update']));
CREATE POLICY prompt_versions_insert ON ai_governance.prompt_versions FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY['aigov.prompt_version.register']));
CREATE POLICY command_results_insert ON ai_governance.command_results FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY[
  'aigov.ai_system.create','aigov.ai_system.update','aigov.model.create','aigov.model.update',
  'aigov.model_version.register','aigov.dataset.create','aigov.dataset.update',
  'aigov.dataset_version.register','aigov.prompt.create','aigov.prompt.update',
  'aigov.prompt_version.register']));

CREATE POLICY audit_logs_aigov_m0a_insert ON platform.audit_logs FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(ai_governance.has_inventory_context(tenant_id,ARRAY[
  'aigov.ai_system.create','aigov.ai_system.update','aigov.model.create','aigov.model.update',
  'aigov.model_version.register','aigov.dataset.create','aigov.dataset.update',
  'aigov.dataset_version.register','aigov.prompt.create','aigov.prompt.update',
  'aigov.prompt_version.register']));
CREATE POLICY domain_events_aigov_m0a_insert ON platform.domain_events FOR INSERT TO acs_aigov_m0a_inventory
 WITH CHECK(producer='acs-platform-api' AND event_type LIKE 'aigov.%'
  AND ai_governance.has_inventory_context(tenant_id,ARRAY[
   'aigov.ai_system.create','aigov.ai_system.update','aigov.model.create','aigov.model.update',
   'aigov.model_version.register','aigov.dataset.create','aigov.dataset.update',
   'aigov.dataset_version.register','aigov.prompt.create','aigov.prompt.update',
   'aigov.prompt_version.register']));

REVOKE ALL ON SCHEMA ai_governance FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ai_governance FROM PUBLIC;
GRANT USAGE ON SCHEMA platform,ai_governance TO acs_aigov_m0a_inventory;
GRANT SELECT,INSERT,UPDATE ON ai_governance.ai_systems,ai_governance.models,
 ai_governance.datasets,ai_governance.prompts TO acs_aigov_m0a_inventory;
GRANT SELECT,INSERT ON ai_governance.model_versions,ai_governance.dataset_versions,
 ai_governance.prompt_versions,ai_governance.command_results TO acs_aigov_m0a_inventory;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_aigov_m0a_inventory;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),
 platform.has_trusted_tenant_context(uuid,uuid,text),
 ai_governance.has_inventory_context(uuid,text[]) TO acs_aigov_m0a_inventory;

COMMIT;
