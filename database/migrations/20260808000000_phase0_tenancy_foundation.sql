BEGIN;

CREATE SCHEMA IF NOT EXISTS foundation;

CREATE OR REPLACE FUNCTION foundation.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

REVOKE ALL ON FUNCTION foundation.current_tenant_id() FROM PUBLIC;

CREATE TABLE foundation.tenant_isolation_probe (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  probe_value text NOT NULL CHECK (length(probe_value) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenant_isolation_probe_tenant_created_idx
  ON foundation.tenant_isolation_probe (tenant_id, created_at DESC);

ALTER TABLE foundation.tenant_isolation_probe ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundation.tenant_isolation_probe FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_probe_isolation
  ON foundation.tenant_isolation_probe
  FOR ALL
  USING (tenant_id = foundation.current_tenant_id())
  WITH CHECK (tenant_id = foundation.current_tenant_id());

REVOKE ALL ON SCHEMA foundation FROM PUBLIC;
REVOKE ALL ON TABLE foundation.tenant_isolation_probe FROM PUBLIC;

COMMENT ON SCHEMA foundation IS
  'FOUNDATION-only technical validation schema; not an ACS functional domain schema.';
COMMENT ON TABLE foundation.tenant_isolation_probe IS
  'Disposable reference entity used to prove tenant context and RLS behavior in Phase 0.';

COMMIT;
