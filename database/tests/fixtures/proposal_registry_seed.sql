INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
SELECT t.tenant_id, t.membership_id, p.permission_key
FROM (VALUES
 ('00000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000055'::uuid),
 ('00000000-0000-4000-8000-000000000022'::uuid,'30000000-0000-4000-8000-000000000088'::uuid)
) AS t(tenant_id,membership_id)
CROSS JOIN (SELECT permission_key FROM platform.permissions WHERE permission_key LIKE 'commercial.proposal.%') p
ON CONFLICT DO NOTHING;
