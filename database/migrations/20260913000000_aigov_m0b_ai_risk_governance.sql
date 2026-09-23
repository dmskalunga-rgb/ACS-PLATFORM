BEGIN;

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('aigov.risk.read','Read tenant-bound AI-specific risk governance metadata.'),
 ('aigov.risk.create','Register an AI-specific risk without authorizing treatment or acceptance.'),
 ('aigov.risk.update','Update non-protected AI-specific risk metadata.'),
 ('aigov.risk.assess','Record an immutable AI-risk assessment without activating rating bands.'),
 ('aigov.risk.treat','Record an AI-risk treatment plan without executing the plan.'),
 ('aigov.risk.review','Record a residual-risk review without acceptance or rejection.'),
 ('aigov.risk.monitor','Record an AI-risk monitoring observation or reassessment trigger.')
ON CONFLICT(permission_key) DO NOTHING;

CREATE TABLE ai_governance.risks (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  risk_id uuid NOT NULL,
  risk_code text NOT NULL CHECK(risk_code ~ '^[A-Z][A-Z0-9-]{2,31}$'),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  description text NOT NULL CHECK(length(description) BETWEEN 1 AND 2000),
  primary_category text NOT NULL CHECK(primary_category IN
    ('AIR-T01','AIR-T02','AIR-T03','AIR-T04','AIR-T05','AIR-T06',
     'AIR-T07','AIR-T08','AIR-T09','AIR-T10','AIR-T11','AIR-T12')),
  owner_user_id uuid NOT NULL REFERENCES platform.users(id),
  status text NOT NULL DEFAULT 'IDENTIFIED' CHECK(status IN
    ('IDENTIFIED','ASSESSED','TREATMENT_REQUIRED','RESIDUAL_RISK_REVIEW','REASSESSMENT_REQUIRED')),
  ai_system_id uuid,
  model_id uuid,
  model_version_id uuid,
  dataset_id uuid,
  dataset_version_id uuid,
  prompt_id uuid,
  prompt_version_id uuid,
  evidence_reference uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,risk_id),
  UNIQUE(tenant_id,risk_code),
  FOREIGN KEY(tenant_id,owner_user_id) REFERENCES platform.memberships(tenant_id,user_id),
  CHECK(num_nonnulls(ai_system_id,model_id,model_version_id,dataset_id,
    dataset_version_id,prompt_id,prompt_version_id) <= 1),
  FOREIGN KEY(tenant_id,ai_system_id) REFERENCES ai_governance.ai_systems(tenant_id,system_id),
  FOREIGN KEY(tenant_id,model_id) REFERENCES ai_governance.models(tenant_id,model_id),
  FOREIGN KEY(tenant_id,model_version_id) REFERENCES ai_governance.model_versions(tenant_id,model_version_id),
  FOREIGN KEY(tenant_id,dataset_id) REFERENCES ai_governance.datasets(tenant_id,dataset_id),
  FOREIGN KEY(tenant_id,dataset_version_id) REFERENCES ai_governance.dataset_versions(tenant_id,dataset_version_id),
  FOREIGN KEY(tenant_id,prompt_id) REFERENCES ai_governance.prompts(tenant_id,prompt_id),
  FOREIGN KEY(tenant_id,prompt_version_id) REFERENCES ai_governance.prompt_versions(tenant_id,prompt_version_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.risk_assessments (
  tenant_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  risk_id uuid NOT NULL,
  previous_assessment_id uuid,
  likelihood smallint NOT NULL CHECK(likelihood BETWEEN 1 AND 5),
  impact smallint NOT NULL CHECK(impact BETWEEN 1 AND 5),
  exposure smallint NOT NULL CHECK(exposure BETWEEN 1 AND 5),
  detectability smallint NOT NULL CHECK(detectability BETWEEN 1 AND 5),
  autonomy smallint NOT NULL CHECK(autonomy BETWEEN 1 AND 5),
  blast_radius smallint NOT NULL CHECK(blast_radius BETWEEN 1 AND 5),
  control_strength numeric(5,4) NOT NULL CHECK(control_strength BETWEEN 0 AND 1),
  inherent_score numeric(8,2) NOT NULL CHECK(inherent_score BETWEEN 1 AND 125),
  residual_score numeric(8,2) NOT NULL CHECK(residual_score BETWEEN 0 AND 125),
  CONSTRAINT risk_inherent_formula CHECK(inherent_score = round(
    likelihood * impact * ((exposure + detectability + autonomy + blast_radius)::numeric / 4),2)),
  CONSTRAINT risk_residual_formula CHECK(residual_score = round(
    inherent_score * (1 - control_strength),2)),
  scoring_formula_reference text NOT NULL
    CHECK(scoring_formula_reference='ACS-AI-GOV-001:v1.0:formula'),
  reason_reference text NOT NULL CHECK(length(reason_reference) BETWEEN 1 AND 256),
  trigger_reference text NOT NULL CHECK(length(trigger_reference) BETWEEN 1 AND 256),
  evidence_reference uuid NOT NULL,
  assessed_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,assessment_id),
  UNIQUE(tenant_id,risk_id,assessment_id),
  FOREIGN KEY(tenant_id,risk_id) REFERENCES ai_governance.risks(tenant_id,risk_id),
  FOREIGN KEY(tenant_id,risk_id,previous_assessment_id)
    REFERENCES ai_governance.risk_assessments(tenant_id,risk_id,assessment_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.risk_treatments (
  tenant_id uuid NOT NULL,
  treatment_id uuid NOT NULL,
  risk_id uuid NOT NULL,
  treatment_type text NOT NULL CHECK(treatment_type IN
    ('MITIGATE','AVOID','TRANSFER','ACCEPT','MONITOR')),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK(status='PROPOSED'),
  rationale_reference text NOT NULL CHECK(length(rationale_reference) BETWEEN 1 AND 256),
  planned_actions_reference text NOT NULL CHECK(length(planned_actions_reference) BETWEEN 1 AND 256),
  evidence_reference uuid NOT NULL,
  proposed_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,treatment_id),
  FOREIGN KEY(tenant_id,risk_id) REFERENCES ai_governance.risks(tenant_id,risk_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.risk_residual_reviews (
  tenant_id uuid NOT NULL,
  review_id uuid NOT NULL,
  risk_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  reason_reference text NOT NULL CHECK(length(reason_reference) BETWEEN 1 AND 256),
  evidence_reference uuid NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,review_id),
  FOREIGN KEY(tenant_id,risk_id) REFERENCES ai_governance.risks(tenant_id,risk_id),
  FOREIGN KEY(tenant_id,risk_id,assessment_id)
    REFERENCES ai_governance.risk_assessments(tenant_id,risk_id,assessment_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.risk_monitoring (
  tenant_id uuid NOT NULL,
  monitoring_id uuid NOT NULL,
  risk_id uuid NOT NULL,
  trigger_kind text NOT NULL CHECK(trigger_kind IN
    ('PERIODIC','NEW_EVIDENCE','CONTROL_CHANGE','INVENTORY_CHANGE','INCIDENT','OTHER')),
  reassessment_required boolean NOT NULL,
  reason_reference text NOT NULL CHECK(length(reason_reference) BETWEEN 1 AND 256),
  evidence_reference uuid NOT NULL,
  recorded_by uuid NOT NULL REFERENCES platform.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,monitoring_id),
  FOREIGN KEY(tenant_id,risk_id) REFERENCES ai_governance.risks(tenant_id,risk_id),
  FOREIGN KEY(tenant_id,evidence_reference) REFERENCES cyberdefense.evidence_records(tenant_id,evidence_id)
);

CREATE TABLE ai_governance.risk_command_results (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  idempotency_key uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES platform.users(id),
  command text NOT NULL CHECK(command LIKE 'risk.%'),
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,idempotency_key)
);

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['risk_assessments','risk_treatments',
   'risk_residual_reviews','risk_monitoring','risk_command_results'] LOOP
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON ai_governance.%I
     FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_mutation()',
     table_name||'_append_only',table_name);
 END LOOP;
END $$;

CREATE FUNCTION ai_governance.reject_risk_identity_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.risk_id IS DISTINCT FROM NEW.risk_id
    OR OLD.risk_code IS DISTINCT FROM NEW.risk_code
    OR OLD.primary_category IS DISTINCT FROM NEW.primary_category
    OR OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
    OR OLD.ai_system_id IS DISTINCT FROM NEW.ai_system_id
    OR OLD.model_id IS DISTINCT FROM NEW.model_id
    OR OLD.model_version_id IS DISTINCT FROM NEW.model_version_id
    OR OLD.dataset_id IS DISTINCT FROM NEW.dataset_id
    OR OLD.dataset_version_id IS DISTINCT FROM NEW.dataset_version_id
    OR OLD.prompt_id IS DISTINCT FROM NEW.prompt_id
    OR OLD.prompt_version_id IS DISTINCT FROM NEW.prompt_version_id THEN
    RAISE EXCEPTION 'AI risk identity and ownership are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risks_identity_immutable BEFORE UPDATE ON ai_governance.risks
FOR EACH ROW EXECUTE FUNCTION ai_governance.reject_risk_identity_mutation();
REVOKE ALL ON FUNCTION ai_governance.reject_risk_identity_mutation() FROM PUBLIC;

CREATE FUNCTION ai_governance.has_risk_context(row_tenant_id uuid, allowed text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
   SELECT 1 FROM unnest(allowed) AS permission_key
   WHERE platform.has_trusted_tenant_context(row_tenant_id,NULL,permission_key)
 )
$$;
REVOKE ALL ON FUNCTION ai_governance.has_risk_context(uuid,text[]) FROM PUBLIC;

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['risks','risk_assessments','risk_treatments',
   'risk_residual_reviews','risk_monitoring'] LOOP
   EXECUTE format('ALTER TABLE ai_governance.%I ENABLE ROW LEVEL SECURITY',table_name);
   EXECUTE format('ALTER TABLE ai_governance.%I FORCE ROW LEVEL SECURITY',table_name);
   EXECUTE format(
     'CREATE POLICY %I ON ai_governance.%I FOR SELECT TO acs_aigov_m0b_risk USING
      (ai_governance.has_risk_context(tenant_id,ARRAY[
       ''aigov.risk.read'',''aigov.risk.create'',''aigov.risk.update'',
       ''aigov.risk.assess'',''aigov.risk.treat'',''aigov.risk.review'',
       ''aigov.risk.monitor'']))',
     table_name||'_m0b_read_scope',table_name);
 END LOOP;
END $$;

ALTER TABLE ai_governance.risk_command_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_governance.risk_command_results FORCE ROW LEVEL SECURITY;

CREATE POLICY risk_insert_m0b ON ai_governance.risks FOR INSERT TO acs_aigov_m0b_risk
 WITH CHECK(platform.has_trusted_tenant_context(tenant_id,owner_user_id,'aigov.risk.create'));
CREATE POLICY risk_update_m0b ON ai_governance.risks FOR UPDATE TO acs_aigov_m0b_risk
 USING(ai_governance.has_risk_context(tenant_id,ARRAY[
   'aigov.risk.update','aigov.risk.assess','aigov.risk.treat',
   'aigov.risk.review','aigov.risk.monitor']))
 WITH CHECK(ai_governance.has_risk_context(tenant_id,ARRAY[
   'aigov.risk.update','aigov.risk.assess','aigov.risk.treat',
   'aigov.risk.review','aigov.risk.monitor']));
CREATE POLICY risk_assessment_insert_m0b ON ai_governance.risk_assessments FOR INSERT TO acs_aigov_m0b_risk
 WITH CHECK(ai_governance.has_risk_context(tenant_id,ARRAY['aigov.risk.assess']));
CREATE POLICY risk_treatment_insert_m0b ON ai_governance.risk_treatments FOR INSERT TO acs_aigov_m0b_risk
 WITH CHECK(ai_governance.has_risk_context(tenant_id,ARRAY['aigov.risk.treat']));
CREATE POLICY risk_review_insert_m0b ON ai_governance.risk_residual_reviews FOR INSERT TO acs_aigov_m0b_risk
 WITH CHECK(ai_governance.has_risk_context(tenant_id,ARRAY['aigov.risk.review']));
CREATE POLICY risk_monitoring_insert_m0b ON ai_governance.risk_monitoring FOR INSERT TO acs_aigov_m0b_risk
 WITH CHECK(ai_governance.has_risk_context(tenant_id,ARRAY['aigov.risk.monitor']));

-- M0B reads canonical M0A inventory identities, not a shadow registry.
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['ai_systems','models','model_versions','datasets',
   'dataset_versions','prompts','prompt_versions'] LOOP
   EXECUTE format(
     'CREATE POLICY %I ON ai_governance.%I FOR SELECT TO acs_aigov_m0b_risk USING
      (ai_governance.has_risk_context(tenant_id,ARRAY[
       ''aigov.risk.create'',''aigov.risk.update'',''aigov.risk.read'']))',
     table_name||'_m0b_risk_reference',table_name);
 END LOOP;
END $$;

CREATE POLICY aigov_risk_commands_select ON ai_governance.risk_command_results
 FOR SELECT TO acs_aigov_m0b_risk USING(ai_governance.has_risk_context(tenant_id,ARRAY[
  'aigov.risk.create','aigov.risk.update','aigov.risk.assess',
  'aigov.risk.treat','aigov.risk.review','aigov.risk.monitor']));
CREATE POLICY aigov_risk_commands_insert ON ai_governance.risk_command_results
 FOR INSERT TO acs_aigov_m0b_risk WITH CHECK(ai_governance.has_risk_context(tenant_id,ARRAY[
  'aigov.risk.create','aigov.risk.update','aigov.risk.assess',
  'aigov.risk.treat','aigov.risk.review','aigov.risk.monitor']));

CREATE POLICY audit_logs_aigov_m0b_insert ON platform.audit_logs FOR INSERT TO acs_aigov_m0b_risk
 WITH CHECK(ai_governance.has_risk_context(tenant_id,ARRAY[
  'aigov.risk.create','aigov.risk.update','aigov.risk.assess',
  'aigov.risk.treat','aigov.risk.review','aigov.risk.monitor']));
CREATE POLICY domain_events_aigov_m0b_insert ON platform.domain_events FOR INSERT TO acs_aigov_m0b_risk
 WITH CHECK(producer='acs-platform-api' AND event_type LIKE 'aigov.risk.%'
  AND ai_governance.has_risk_context(tenant_id,ARRAY[
   'aigov.risk.create','aigov.risk.update','aigov.risk.assess',
   'aigov.risk.treat','aigov.risk.review','aigov.risk.monitor']));

GRANT USAGE ON SCHEMA platform,ai_governance TO acs_aigov_m0b_risk;
GRANT SELECT,INSERT,UPDATE ON ai_governance.risks TO acs_aigov_m0b_risk;
GRANT SELECT,INSERT ON ai_governance.risk_assessments,ai_governance.risk_treatments,
 ai_governance.risk_residual_reviews,ai_governance.risk_monitoring,
 ai_governance.risk_command_results TO acs_aigov_m0b_risk;
GRANT SELECT ON ai_governance.ai_systems,ai_governance.models,ai_governance.model_versions,
 ai_governance.datasets,ai_governance.dataset_versions,ai_governance.prompts,
 ai_governance.prompt_versions TO acs_aigov_m0b_risk;
GRANT INSERT ON platform.audit_logs,platform.domain_events TO acs_aigov_m0b_risk;
GRANT EXECUTE ON FUNCTION platform.activate_tenant_context(uuid,text),
 platform.has_trusted_tenant_context(uuid,uuid,text),
 ai_governance.has_risk_context(uuid,text[]) TO acs_aigov_m0b_risk;

COMMIT;
