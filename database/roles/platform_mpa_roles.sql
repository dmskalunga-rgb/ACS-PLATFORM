DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_platform_mpa') THEN
    CREATE ROLE acs_platform_mpa NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;

COMMENT ON ROLE acs_platform_mpa IS
  'Least-privilege RLS-governed runtime capability for ACS Platform MPA.';

-- Deployment creates a dedicated LOGIN outside Git and grants only this capability role.
