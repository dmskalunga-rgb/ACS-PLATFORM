CREATE ROLE acs_platform_machine_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

COMMENT ON ROLE acs_platform_machine_auth IS
  'Execute-only canonical machine authentication and protected credential lifecycle role.';
