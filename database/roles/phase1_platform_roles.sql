DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_phase1_context_issuer') THEN
    CREATE ROLE acs_phase1_context_issuer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_phase1_tenant_app') THEN
    CREATE ROLE acs_phase1_tenant_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acs_phase1_security_auditor') THEN
    CREATE ROLE acs_phase1_security_auditor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

COMMENT ON ROLE acs_phase1_context_issuer IS
  'Execute-only trusted identity, membership, and permission context issuer.';
COMMENT ON ROLE acs_phase1_tenant_app IS
  'Normal RLS-governed application data role; cannot issue context grants.';
COMMENT ON ROLE acs_phase1_security_auditor IS
  'Execute-only durable security denial recorder.';

-- Deployment creates LOGIN identities outside Git and grants membership in exactly one role.
-- No password, certificate, token, or connection string belongs in this script.
