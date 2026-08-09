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
