# Database foundation

This directory contains SQL-first Phase 0 artifacts compatible with PostgreSQL and the
baseline's Supabase transactional-layer direction.

- `migrations/` contains immutable forward migrations named with UTC timestamps.
- `rollbacks/` contains reviewed compensating scripts for the matching migration.
- `tests/` contains executable SQL, RLS, and tenant-isolation verification.

The `foundation.tenant_isolation_probe` table is explicitly disposable technical evidence.
It is not a canonical ACS 5.x domain entity and must not become a second tenant source of truth.

Run against the local ephemeral PostgreSQL service:

```sh
docker compose up -d postgres
pnpm db:validate
```

`db:validate` refuses to run when `ACS_ENV=production`.

## Phase 1 migration semantics

`updated_at` on `platform.tenants`, `platform.users`, and `platform.memberships` records the value
at creation in the current read-only slice. Phase 1 exposes no mutation endpoint, so no update
trigger is installed yet. Any future authorized mutation must update this field transactionally
and add lifecycle/audit tests before it is introduced.

The Phase 1 rollback script contains destructive `DROP` operations and is permitted only for a
disposable, pre-adoption environment with no authoritative data. After persistent data exists,
schema corrections use forward remediation and a separately reviewed recovery plan. The rollback
is not a normal production operating procedure.

Production capability roles are provisioned by `database/roles/phase1_platform_roles.sql` without
credentials. Deployment-owned LOGIN identities and their secrets are created outside Git and are
assigned to exactly one least-privileged NOLOGIN capability role.
