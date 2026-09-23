DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_aigov_m0a_inventory') THEN
    CREATE ROLE acs_aigov_m0a_inventory NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      INHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;

COMMENT ON ROLE acs_aigov_m0a_inventory IS
  'Least-privilege RLS-governed runtime capability for the ACS AIGOV M0A AI Inventory.';
