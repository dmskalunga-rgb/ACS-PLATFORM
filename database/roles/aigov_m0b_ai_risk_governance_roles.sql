DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_aigov_m0b_risk') THEN
    CREATE ROLE acs_aigov_m0b_risk NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      INHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;

COMMENT ON ROLE acs_aigov_m0b_risk IS
  'Least-privilege tenant-bound runtime capability for ACS AIGOV M0B AI-specific risk governance.';
