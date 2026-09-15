DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='acs_xcap011_fusion_login_test') THEN
  CREATE ROLE acs_xcap011_fusion_login_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'acs_phase1_test_only';
 END IF;
END $$;
GRANT acs_xcap011_fusion TO acs_xcap011_fusion_login_test;
INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT tenant_id,membership_id,permission_key FROM (VALUES
 ('00000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000011'::uuid),
 ('00000000-0000-4000-8000-000000000022'::uuid,'30000000-0000-4000-8000-000000000044'::uuid)
) memberships(tenant_id,membership_id) CROSS JOIN (VALUES
 ('cyberdefense.fusion.request'),('cyberdefense.fusion.read'),('cyberdefense.evidence.read')
) permissions(permission_key) ON CONFLICT DO NOTHING;
