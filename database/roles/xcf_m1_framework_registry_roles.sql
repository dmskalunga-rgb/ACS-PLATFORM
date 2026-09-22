DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_xcf_m1_registry') THEN
    CREATE ROLE acs_xcf_m1_registry NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      INHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;

COMMENT ON ROLE acs_xcf_m1_registry IS
  'Least-privilege RLS-governed runtime capability for the ACS-XCF M1 Framework Registry.';

-- Deployment creates a dedicated LOGIN outside Git and grants only this capability role.
