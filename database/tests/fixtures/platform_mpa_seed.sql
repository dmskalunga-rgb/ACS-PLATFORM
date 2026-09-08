INSERT INTO platform.users(id,external_subject,status) VALUES
  ('70000000-0000-4000-8000-000000000077','oidc|mpa-approver-2','ACTIVE');
INSERT INTO platform.memberships(id,tenant_id,user_id,status) VALUES
  ('80000000-0000-4000-8000-000000000077','00000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000077','ACTIVE');

INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT '00000000-0000-4000-8000-000000000011',membership_id,permission_key
FROM (VALUES
  ('30000000-0000-4000-8000-000000000011'::uuid),
  ('30000000-0000-4000-8000-000000000055'::uuid),
  ('80000000-0000-4000-8000-000000000077'::uuid)
) memberships(membership_id)
CROSS JOIN (VALUES
  ('platform.mpa.request'),('platform.mpa.read'),('platform.mpa.approve'),
  ('platform.mpa.reject'),('platform.mpa.revoke'),('platform.mpa.consume')
) permissions(permission_key)
ON CONFLICT DO NOTHING;

INSERT INTO platform.mpa_membership_authorities(tenant_id,membership_id,authority_class_id) VALUES
  ('00000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000055','cyberdefense.evidence.export_authority'),
  ('00000000-0000-4000-8000-000000000011','80000000-0000-4000-8000-000000000077','cyberdefense.evidence.export_authority');
