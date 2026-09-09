DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='acs_xcap005_evidence_login_test') THEN
    CREATE ROLE acs_xcap005_evidence_login_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'acs_phase1_test_only';
  END IF;
END $$;
GRANT acs_xcap005_evidence TO acs_xcap005_evidence_login_test;

INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT tenant_id,membership_id,permission_key
FROM (VALUES
  ('00000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000011'::uuid),
  ('00000000-0000-4000-8000-000000000022'::uuid,'30000000-0000-4000-8000-000000000044'::uuid)
) memberships(tenant_id,membership_id)
CROSS JOIN (VALUES
  ('cyberdefense.evidence.read'),('cyberdefense.evidence.collect'),('cyberdefense.evidence.verify'),
  ('cyberdefense.evidence.derive'),('cyberdefense.evidence.export'),('cyberdefense.evidence.retain'),
  ('cyberdefense.evidence.retention_override'),('cyberdefense.evidence.destroy'),('platform.mpa.consume')
) permissions(permission_key)
ON CONFLICT DO NOTHING;

INSERT INTO cyberdefense.evidence_retention_policies(
  tenant_id,retention_policy_id,policy_version,retention_class,start_trigger,expiry_interval
) VALUES
 ('00000000-0000-4000-8000-000000000011','xcap005-test-short','1.0.0','TEST','INGESTION',interval '1 second'),
 ('00000000-0000-4000-8000-000000000022','xcap005-test-short','1.0.0','TEST','INGESTION',interval '1 second');
