DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='acs_xcf_m1_registry_login_test') THEN
  CREATE ROLE acs_xcf_m1_registry_login_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
   INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'acs_phase1_test_only';
 END IF;
END $$;
GRANT acs_xcf_m1_registry TO acs_xcf_m1_registry_login_test;

INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT tenant_id,membership_id,permission_key FROM (VALUES
 ('00000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000011'::uuid),
 ('00000000-0000-4000-8000-000000000022'::uuid,'30000000-0000-4000-8000-000000000044'::uuid)
) memberships(tenant_id,membership_id) CROSS JOIN (VALUES
 ('xcf.publisher.read'),('xcf.publisher.administer'),
 ('xcf.framework_source.read'),('xcf.framework_source.register'),
 ('xcf.framework_source.activate'),('xcf.framework_source.suspend'),
 ('xcf.framework_source.revoke'),('xcf.framework_release.read'),
 ('xcf.framework_release.ingest'),
 ('xcf.framework_release.activate'),('xcf.framework_release.revoke')
) permissions(permission_key) ON CONFLICT DO NOTHING;

INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key) VALUES
 ('00000000-0000-4000-8000-000000000011','80000000-0000-4000-8000-000000000077','xcf.framework_release.read'),
 ('00000000-0000-4000-8000-000000000011','80000000-0000-4000-8000-000000000077','xcf.framework_release.approve')
ON CONFLICT DO NOTHING;

INSERT INTO platform.mpa_membership_authorities(tenant_id,membership_id,authority_class_id) VALUES
 ('00000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000055','xcf.knowledge_custodian_authority'),
 ('00000000-0000-4000-8000-000000000011','80000000-0000-4000-8000-000000000077','xcf.security_governance_authority')
ON CONFLICT DO NOTHING;
