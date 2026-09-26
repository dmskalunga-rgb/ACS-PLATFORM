DO $$
DECLARE
  enabled boolean;
  forced boolean;
BEGIN
  SELECT relrowsecurity,relforcerowsecurity INTO enabled,forced
  FROM pg_class WHERE oid='cyberdefense.evidence_records'::regclass;
  IF NOT enabled OR NOT forced THEN
    RAISE EXCEPTION 'Evidence reference validation weakened RLS/FORCE RLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform.permissions
    WHERE permission_key='cyberdefense.evidence.reference.validate') THEN
    RAISE EXCEPTION 'Dedicated evidence reference permission is missing';
  END IF;
  IF has_function_privilege('acs_phase1_tenant_app',
       'cyberdefense.validate_evidence_reference(uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Unrelated platform role must not execute evidence reference validation';
  END IF;
  IF NOT has_function_privilege('acs_xcap005_evidence',
       'cyberdefense.validate_evidence_reference(uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Canonical evidence runtime lacks bounded validator execution';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='cyberdefense' AND tablename='evidence_records'
      AND qual LIKE '%cyberdefense.evidence.reference.validate%') THEN
    RAISE EXCEPTION 'Reference validation permission must not grant evidence-record SELECT';
  END IF;
END $$;
