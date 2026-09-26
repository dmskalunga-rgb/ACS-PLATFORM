-- Disposable-only behavioral proof for canonical platform machine authentication.
INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
VALUES
 ('00000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','platform.machine_principals.provision'),
 ('00000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','platform.machine_credentials.manage'),
 ('00000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','platform.machine_permissions.manage')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  tenant_a uuid := '00000000-0000-4000-8000-000000000011';
  tenant_b uuid := '00000000-0000-4000-8000-000000000022';
  alice uuid := '10000000-0000-4000-8000-000000000011';
  request_id text := gen_random_uuid()::text;
  expected_correlation text := gen_random_uuid()::text;
  principal_id uuid;
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  human_token uuid;
  machine_token uuid;
  resolved record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='platform.machine_credentials'::regclass
    AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'Machine credentials require RLS and FORCE RLS';
  END IF;
  IF has_table_privilege('acs_platform_machine_auth','platform.machine_credentials','SELECT') THEN
    RAISE EXCEPTION 'Authentication role has direct credential table SELECT';
  END IF;
  SELECT context_token INTO human_token FROM platform.issue_tenant_context('oidc|alice',tenant_a,'platform.machine_principals.provision');
  principal_id := platform.machine_auth_provision(tenant_a,'SERVICE',gen_random_uuid()::text,
    first_id,repeat('a',64),clock_timestamp()+interval '1 hour',alice,human_token,request_id,expected_correlation);
  IF principal_id IS NULL THEN RAISE EXCEPTION 'Protected machine principal provisioning failed'; END IF;
  IF (SELECT verifier FROM platform.machine_auth_resolve(first_id)) <> repeat('a',64) THEN
    RAISE EXCEPTION 'Credential verifier binding failed';
  END IF;
  IF platform.machine_auth_issue_context(first_id,principal_id,tenant_a,'platform.context.read') IS NOT NULL THEN
    RAISE EXCEPTION 'Authentication alone granted domain permission';
  END IF;
  IF platform.machine_auth_issue_context(first_id,principal_id,tenant_b,'platform.context.read') IS NOT NULL THEN
    RAISE EXCEPTION 'Machine credential crossed tenant boundary';
  END IF;
  IF platform.machine_auth_issue_context(first_id,gen_random_uuid(),tenant_a,'platform.context.read') IS NOT NULL THEN
    RAISE EXCEPTION 'Machine credential was accepted for a different principal';
  END IF;
  SELECT context_token INTO human_token FROM platform.issue_tenant_context('oidc|alice',tenant_a,'platform.machine_permissions.manage');
  IF NOT platform.machine_auth_set_permission(tenant_a,principal_id,'platform.context.read',true,alice,human_token,request_id,expected_correlation)
  THEN RAISE EXCEPTION 'Protected machine permission assignment failed'; END IF;
  machine_token := platform.machine_auth_issue_context(first_id,principal_id,tenant_a,'platform.context.read');
  IF machine_token IS NULL THEN RAISE EXCEPTION 'Authorized machine tenant context not issued'; END IF;
  PERFORM platform.activate_tenant_context(machine_token,'platform.context.read');
  IF platform.has_trusted_tenant_context(tenant_a,alice,'platform.context.read') THEN
    RAISE EXCEPTION 'Machine context impersonated a HUMAN principal';
  END IF;
  SELECT context_token INTO human_token FROM platform.issue_tenant_context('oidc|alice',tenant_a,'platform.machine_credentials.manage');
  IF NOT platform.machine_auth_rotate(tenant_a,principal_id,first_id,second_id,repeat('b',64),
    clock_timestamp()+interval '1 hour',alice,human_token,request_id,expected_correlation)
  THEN RAISE EXCEPTION 'Credential rotation failed'; END IF;
  SELECT * INTO resolved FROM platform.machine_auth_resolve(first_id);
  IF resolved.credential_status <> 'SUPERSEDED' OR
     platform.machine_auth_issue_context(first_id,principal_id,tenant_a,'platform.context.read') IS NOT NULL THEN
    RAISE EXCEPTION 'Superseded credential remains usable';
  END IF;
  IF platform.machine_auth_issue_context(second_id,principal_id,tenant_a,'platform.context.read') IS NULL THEN
    RAISE EXCEPTION 'Rotated credential cannot issue context';
  END IF;
  SELECT context_token INTO human_token FROM platform.issue_tenant_context('oidc|alice',tenant_a,'platform.machine_credentials.manage');
  IF NOT platform.machine_auth_revoke(tenant_a,principal_id,second_id,alice,human_token,request_id,expected_correlation)
  THEN RAISE EXCEPTION 'Credential revocation failed'; END IF;
  IF platform.machine_auth_issue_context(second_id,principal_id,tenant_a,'platform.context.read') IS NOT NULL THEN
    RAISE EXCEPTION 'Revoked credential regained authority';
  END IF;
  IF (SELECT count(*) FROM platform.audit_logs WHERE tenant_id=tenant_a AND correlation_id=expected_correlation) < 4 THEN
    RAISE EXCEPTION 'Credential lifecycle audit incomplete';
  END IF;
  IF (SELECT count(*) FROM platform.domain_events WHERE tenant_id=tenant_a AND correlation_id=expected_correlation::uuid) < 2 THEN
    RAISE EXCEPTION 'Credential lifecycle outbox incomplete';
  END IF;
END $$;
