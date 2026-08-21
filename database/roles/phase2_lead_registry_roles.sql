DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_phase2_lead_registry') THEN
    CREATE ROLE acs_phase2_lead_registry NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

COMMENT ON ROLE acs_phase2_lead_registry IS 'RLS-governed Lead Registry role; requires a permission-bound trusted context.';
