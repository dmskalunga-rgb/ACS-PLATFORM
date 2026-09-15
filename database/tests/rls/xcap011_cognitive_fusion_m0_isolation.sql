DO $$
BEGIN
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='cyberdefense.fusion_command_receipts'::regclass) THEN
  RAISE EXCEPTION 'XCAP-011 receipt RLS/FORCE RLS is not enabled';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='acs_xcap011_fusion'
   AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
  RAISE EXCEPTION 'XCAP-011 capability role violates least privilege';
 END IF;
 IF has_table_privilege('acs_xcap011_fusion','platform.memberships','SELECT') THEN
  RAISE EXCEPTION 'XCAP-011 runtime role must not read memberships directly';
 END IF;
 IF has_function_privilege('public','cyberdefense.cleanup_expired_fusion_receipts(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'PUBLIC must not execute XCAP-011 receipt cleanup';
 END IF;
 IF has_table_privilege('public','cyberdefense.fusion_command_receipts','SELECT') THEN
  RAISE EXCEPTION 'PUBLIC must not read XCAP-011 receipts';
 END IF;
 IF NOT has_table_privilege('acs_xcap011_fusion','cyberdefense.fusion_command_receipts','SELECT,INSERT,UPDATE')
    OR has_table_privilege('acs_xcap011_fusion','cyberdefense.fusion_command_receipts','DELETE') THEN
  RAISE EXCEPTION 'XCAP-011 least privilege boundary is invalid';
 END IF;
 IF EXISTS(SELECT 1 FROM platform.membership_permissions WHERE permission_key IN ('cyberdefense.fusion.request','cyberdefense.fusion.read') AND membership_id NOT IN ('30000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000044'::uuid)) THEN
  RAISE EXCEPTION 'XCAP-011 permission received an unexpected default assignment';
 END IF;
 IF (SELECT count(*) FROM platform.permissions
     WHERE permission_key IN ('cyberdefense.fusion.request','cyberdefense.fusion.read')) <> 2 THEN
  RAISE EXCEPTION 'XCAP-011 canonical permission registration is incomplete';
 END IF;
 IF EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema='cyberdefense'
    AND table_name='fusion_command_receipts'
    AND column_name IN ('result','result_body','request_body','raw_content','evidence_content')
 ) THEN
  RAISE EXCEPTION 'XCAP-011 receipt persists prohibited content';
 END IF;
END $$;

-- The canonical issuer must project the exact stored grant expiry, and an
-- expired grant must remain unusable at the activation boundary.
BEGIN;
DO $$
DECLARE
 issued record;
 canonical_expiry timestamptz;
BEGIN
 SELECT * INTO issued
 FROM platform.issue_tenant_context(
  'oidc|alice',
  '00000000-0000-4000-8000-000000000011',
  'cyberdefense.fusion.request'
 );

 SELECT expires_at INTO canonical_expiry
 FROM platform.tenant_context_grants
 WHERE token = issued.context_token;

 IF issued.valid_until IS NULL OR issued.valid_until IS DISTINCT FROM canonical_expiry THEN
  RAISE EXCEPTION 'Platform Context expiry projection is not the exact canonical grant expiry';
 END IF;

 UPDATE platform.tenant_context_grants
 SET expires_at = clock_timestamp() - interval '1 second'
 WHERE token = issued.context_token;

 IF EXISTS (
  SELECT 1
  FROM platform.activate_tenant_context(
   issued.context_token,
   'cyberdefense.fusion.request'
  )
 ) THEN
  RAISE EXCEPTION 'Expired Platform Context grant activated successfully';
 END IF;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('test.xcap011_context_b',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|charlie','00000000-0000-4000-8000-000000000022','cyberdefense.fusion.request')),true);
SET LOCAL ROLE acs_xcap011_fusion;
SELECT * FROM platform.activate_tenant_context(current_setting('test.xcap011_context_b')::uuid,'cyberdefense.fusion.request');
INSERT INTO cyberdefense.fusion_command_receipts(
 tenant_id,idempotency_key,request_hash,operation,request_schema_version,result_schema_version,
 reference_schema_version,status,fusion_request_id,fusion_result_id,request_id,correlation_id,
 result_hash,completed_at,expires_at)
VALUES('00000000-0000-4000-8000-000000000022','a1000000-0000-4000-8000-000000000001',repeat('a',64),
 'cyberdefense.fusion.request','1.0.0','1.0.0','1.0.0','COMPLETED',
 'a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003',
 gen_random_uuid(),gen_random_uuid(),repeat('b',64),
 clock_timestamp(),clock_timestamp()+interval '5 minutes');
COMMIT;

BEGIN;
SELECT set_config('test.xcap011_context_a',(SELECT context_token::text FROM platform.issue_tenant_context(
 'oidc|alice','00000000-0000-4000-8000-000000000011','cyberdefense.fusion.request')),true);
SET LOCAL ROLE acs_xcap011_fusion;
SELECT * FROM platform.activate_tenant_context(current_setting('test.xcap011_context_a')::uuid,'cyberdefense.fusion.request');
INSERT INTO cyberdefense.fusion_command_receipts(
 tenant_id,idempotency_key,request_hash,operation,request_schema_version,result_schema_version,
 reference_schema_version,status,fusion_request_id,fusion_result_id,request_id,correlation_id,
 result_hash,completed_at,expires_at)
VALUES('00000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-000000000001',repeat('a',64),
 'cyberdefense.fusion.request','1.0.0','1.0.0','1.0.0','COMPLETED',
 'a1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000005',
 gen_random_uuid(),gen_random_uuid(),repeat('b',64),
 clock_timestamp(),clock_timestamp()+interval '5 minutes');
DO $$ BEGIN
 IF (SELECT count(*) FROM cyberdefense.fusion_command_receipts)<>1 THEN
  RAISE EXCEPTION 'XCAP-011 tenant isolation failed';
 END IF;
 UPDATE cyberdefense.fusion_command_receipts
 SET row_version=row_version+1
 WHERE tenant_id='00000000-0000-4000-8000-000000000022';
 IF FOUND THEN
  RAISE EXCEPTION 'XCAP-011 cross-tenant update succeeded';
 END IF;
 BEGIN
  INSERT INTO cyberdefense.fusion_command_receipts(
   tenant_id,idempotency_key,request_hash,operation,request_schema_version,result_schema_version,
   reference_schema_version,status,request_id,correlation_id,expires_at)
  VALUES('00000000-0000-4000-8000-000000000022',gen_random_uuid(),repeat('c',64),
   'cyberdefense.fusion.request','1.0.0','1.0.0','1.0.0','IN_PROGRESS',
   gen_random_uuid(),gen_random_uuid(),clock_timestamp()+interval '5 minutes');
  RAISE EXCEPTION 'XCAP-011 cross-tenant insert succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  DELETE FROM cyberdefense.fusion_command_receipts;
  RAISE EXCEPTION 'XCAP-011 runtime DELETE succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
