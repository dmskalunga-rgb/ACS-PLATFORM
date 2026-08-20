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

## Phase 2 Customer Registry

Migration `20260818010000_phase2_customer_registry.sql` introduces only the canonical,
tenant-owned `commercial.customers` source and its bounded idempotency records. It enables and
forces RLS, exposes no delete path, and reuses trusted grants, audit and the immutable outbox.
`db:validate` executes the migration, isolation proof, disposable rollback, reapplication and
isolation proof again. Production correction remains forward-only after authoritative data exists.

## Pre-Phase-2 Event Delivery Foundation

Migration `20260818000000_event_delivery_foundation.sql` extends the existing immutable
`platform.domain_events` outbox. Delivery state, consumer receipts, and lifecycle audit remain
tenant scoped and are accessed through separate execute-only roles declared in
`database/roles/event_foundation_roles.sql`. The migration introduces no broker, Commercial
entity, or Phase 2 table.

Published-event and consumer-receipt cleanup use configurable bounded batches. No regulatory
retention duration is encoded. The rollback is test evidence for disposable environments; after
authoritative delivery data exists, production corrections remain forward-only.
