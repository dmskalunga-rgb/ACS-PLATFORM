BEGIN;

DROP TABLE IF EXISTS foundation.tenant_isolation_probe;
DROP FUNCTION IF EXISTS foundation.current_tenant_id();
DROP SCHEMA IF EXISTS foundation;

COMMIT;
