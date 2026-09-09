DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_xcap005_evidence') THEN
    CREATE ROLE acs_xcap005_evidence NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      INHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;

COMMENT ON ROLE acs_xcap005_evidence IS
  'Least-privilege RLS-governed runtime capability for ACS-XCAP-005 evidence and canonical MPA consumption.';

-- Deployment creates a dedicated LOGIN outside Git and grants only this capability role.
