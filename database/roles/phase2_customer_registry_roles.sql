DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_phase2_customer_registry') THEN
    CREATE ROLE acs_phase2_customer_registry NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

COMMENT ON ROLE acs_phase2_customer_registry IS
  'RLS-governed Customer Registry role; requires a permission-bound trusted context.';

-- Deployment creates LOGIN identities outside Git and assigns this single capability role.
