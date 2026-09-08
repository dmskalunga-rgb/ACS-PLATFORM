DO $$
DECLARE enabled boolean; forced boolean;
BEGIN
  SELECT relrowsecurity,relforcerowsecurity INTO enabled,forced
    FROM pg_class WHERE oid='platform.mpa_authorization_envelopes'::regclass;
  IF NOT enabled OR NOT forced THEN RAISE EXCEPTION 'MPA envelope RLS/FORCE RLS missing'; END IF;
  SELECT relrowsecurity,relforcerowsecurity INTO enabled,forced
    FROM pg_class WHERE oid='platform.mpa_authorization_decisions'::regclass;
  IF NOT enabled OR NOT forced THEN RAISE EXCEPTION 'MPA decision RLS/FORCE RLS missing'; END IF;
  IF has_table_privilege('public','platform.mpa_authorization_envelopes','SELECT') THEN
    RAISE EXCEPTION 'PUBLIC can read MPA envelopes';
  END IF;
  IF has_table_privilege('acs_platform_mpa','platform.memberships','SELECT') THEN
    RAISE EXCEPTION 'MPA role has forbidden direct membership visibility';
  END IF;
  IF has_function_privilege(
    'public',
    'platform.materialize_mpa_expiry(uuid,uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'PUBLIC can materialize MPA expiry'; END IF;
  IF NOT has_function_privilege(
    'acs_platform_mpa',
    'platform.materialize_mpa_expiry(uuid,uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'MPA role cannot materialize expiry'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='acs_platform_mpa' AND NOT rolsuper AND NOT rolbypassrls
      AND NOT rolcanlogin AND NOT rolcreatedb AND NOT rolcreaterole
  ) THEN RAISE EXCEPTION 'MPA capability role is not least privilege'; END IF;
  IF (SELECT count(*) FROM platform.mpa_policies) <> 4 THEN RAISE EXCEPTION 'MPA policy registry mismatch'; END IF;
  IF (SELECT count(*) FROM platform.mpa_authority_classes) <> 3 THEN RAISE EXCEPTION 'MPA authority registry mismatch'; END IF;
END $$;

BEGIN;
SELECT set_config('test.mpa_context_token',(SELECT context_token::text FROM platform.issue_tenant_context(
  'oidc|alice','00000000-0000-4000-8000-000000000011','platform.mpa.request')),true);
SET LOCAL ROLE acs_platform_mpa;
SELECT * FROM platform.activate_tenant_context(current_setting('test.mpa_context_token')::uuid,'platform.mpa.request');
INSERT INTO platform.mpa_authorization_envelopes(
  authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,
  policy_id,policy_version,state,required_approval_count,expires_at
) VALUES (
  '90000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',
  'cyberdefense.evidence.export',repeat('a',64),'cyberdefense.evidence.export.standard','1.0.0',
  'REQUESTED',1,clock_timestamp()+interval '15 minutes'
);
DO $$ BEGIN
  IF (SELECT count(*) FROM platform.mpa_authorization_envelopes) <> 1 THEN
    RAISE EXCEPTION 'same-tenant MPA envelope invisible';
  END IF;
  IF EXISTS (SELECT 1 FROM platform.mpa_authorization_envelopes WHERE tenant_id='00000000-0000-4000-8000-000000000022') THEN
    RAISE EXCEPTION 'cross-tenant MPA envelope visible';
  END IF;
  BEGIN
    INSERT INTO platform.mpa_authorization_envelopes(
      tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,
      policy_id,policy_version,state,required_approval_count,expires_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000022','30000000-0000-4000-8000-000000000033',
      '30000000-0000-4000-8000-000000000044','cyberdefense.evidence.export',repeat('b',64),
      'cyberdefense.evidence.export.standard','1.0.0','REQUESTED',1,clock_timestamp()+interval '15 minutes'
    );
    RAISE EXCEPTION 'cross-tenant MPA write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
END $$;
ROLLBACK;

BEGIN;
INSERT INTO platform.mpa_authorization_envelopes(
  authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,
  policy_id,policy_version,state,required_approval_count,expires_at
) VALUES
  ('90000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011',
   '10000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',
   'cyberdefense.evidence.export',repeat('c',64),'cyberdefense.evidence.export.standard','1.0.0',
   'APPROVED',1,clock_timestamp()+interval '15 minutes'),
  ('90000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011',
   '10000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',
   'cyberdefense.evidence.export',repeat('d',64),'cyberdefense.evidence.export.standard','1.0.0',
   'APPROVED',1,clock_timestamp()+interval '15 minutes');

INSERT INTO platform.mpa_authorization_decisions(
  tenant_id,authorization_id,actor_user_id,actor_membership_id,decision,expected_version
) VALUES (
  '00000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',
  'REJECT',1
);
INSERT INTO platform.mpa_consumptions(
  tenant_id,authorization_id,actor_user_id,operation,target_reference_hash,
  policy_id,policy_version,attestation_reference_hash
) VALUES (
  '00000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000011','cyberdefense.evidence.export',repeat('d',64),
  'cyberdefense.evidence.export.standard','1.0.0',repeat('e',64)
);

DO $$
BEGIN
  BEGIN
    INSERT INTO platform.mpa_authorization_decisions(
      tenant_id,authorization_id,actor_user_id,actor_membership_id,decision,expected_version
    ) VALUES (
      '00000000-0000-4000-8000-000000000022','90000000-0000-4000-8000-000000000011',
      '30000000-0000-4000-8000-000000000033','30000000-0000-4000-8000-000000000044',
      'REJECT',1
    );
    RAISE EXCEPTION 'cross-tenant decision/envelope relation unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO platform.mpa_consumptions(
      tenant_id,authorization_id,actor_user_id,operation,target_reference_hash,
      policy_id,policy_version,attestation_reference_hash
    ) VALUES (
      '00000000-0000-4000-8000-000000000022','90000000-0000-4000-8000-000000000012',
      '30000000-0000-4000-8000-000000000033','cyberdefense.evidence.export',repeat('d',64),
      'cyberdefense.evidence.export.standard','1.0.0',repeat('e',64)
    );
    RAISE EXCEPTION 'cross-tenant consumption/envelope relation unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM platform.mpa_authorization_decisions
    WHERE tenant_id='00000000-0000-4000-8000-000000000022'
      AND authorization_id='90000000-0000-4000-8000-000000000011'
  ) OR EXISTS (
    SELECT 1 FROM platform.mpa_consumptions
    WHERE tenant_id='00000000-0000-4000-8000-000000000022'
      AND authorization_id='90000000-0000-4000-8000-000000000012'
  ) THEN RAISE EXCEPTION 'cross-tenant child relation persisted'; END IF;
END $$;
ROLLBACK;

BEGIN;
INSERT INTO platform.mpa_authorization_envelopes(
  authorization_id,tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,
  policy_id,policy_version,state,approval_count,required_approval_count,version,
  expires_at,created_at,updated_at
) VALUES (
  '90000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',
  'cyberdefense.evidence.export',repeat('f',64),'cyberdefense.evidence.export.standard','1.0.0',
  'APPROVED',1,1,2,clock_timestamp()-interval '1 minute',
  clock_timestamp()-interval '16 minutes',clock_timestamp()-interval '1 minute'
);
SELECT set_config('test.mpa_context_token',(SELECT context_token::text FROM platform.issue_tenant_context(
  'oidc|alice','00000000-0000-4000-8000-000000000011','platform.mpa.read')),true);
SET LOCAL ROLE acs_platform_mpa;
SELECT * FROM platform.activate_tenant_context(current_setting('test.mpa_context_token')::uuid,'platform.mpa.read');
SELECT * FROM platform.materialize_mpa_expiry(
  '00000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000011','platform.mpa.read',
  '90000000-0000-4000-8000-000000000022','90000000-0000-4000-8000-000000000023'
);
SELECT * FROM platform.materialize_mpa_expiry(
  '00000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000011','platform.mpa.read',
  '90000000-0000-4000-8000-000000000024','90000000-0000-4000-8000-000000000025'
);
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform.mpa_authorization_envelopes
    WHERE authorization_id='90000000-0000-4000-8000-000000000021'
      AND tenant_id='00000000-0000-4000-8000-000000000011'
      AND state='EXPIRED' AND version=3
  ) THEN RAISE EXCEPTION 'expiry state/version was not materialized'; END IF;
  IF (SELECT count(*) FROM platform.audit_logs
      WHERE resource='platform:mpa:90000000-0000-4000-8000-000000000021'
        AND action='platform.mpa.expire') <> 1
  THEN RAISE EXCEPTION 'expiry audit is not exactly once'; END IF;
  IF (SELECT count(*) FROM platform.domain_events
      WHERE event_type='authorization.approval.expired'
        AND payload->>'authorization_id'='90000000-0000-4000-8000-000000000021') <> 1
  THEN RAISE EXCEPTION 'expiry outbox event is not exactly once'; END IF;
END $$;
ROLLBACK;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM platform.mpa_authorization_envelopes
             WHERE authorization_id='90000000-0000-4000-8000-000000000021')
    OR EXISTS (SELECT 1 FROM platform.audit_logs
               WHERE resource='platform:mpa:90000000-0000-4000-8000-000000000021')
    OR EXISTS (SELECT 1 FROM platform.domain_events
               WHERE payload->>'authorization_id'='90000000-0000-4000-8000-000000000021')
  THEN RAISE EXCEPTION 'expiry transaction rollback left a partial effect'; END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='platform.mpa_authorization_decisions'::regclass
      AND tgname='mpa_decisions_append_only' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'append-only MPA decision trigger missing'; END IF;
END $$;
