# ADR-0026: Canonical MPA consumption transaction boundary

- Status: Accepted
- Date: 2026-09-07
- Capability: ACS-PLATFORM-MPA

## Context

Multi-Person Authorization (MPA) is subordinate to canonical ACS authorization.
It reuses `AuthorizationPort`, canonical identity and active membership, trusted
tenant context, PostgreSQL RLS/FORCE RLS, canonical audit, and Event Foundation.
It is not a parallel authorization, audit, or event system.

An HTTP call that merely changes an envelope to an authorized state before an
independent protected mutation cannot guarantee that authorization consumption
and the protected operation have the same outcome. Same-database consumers need
one atomic boundary.

## Decision

The canonical internal boundary is `withMultiPersonAuthorizationConsumption`.
The protected-operation consumer owns and opens the PostgreSQL transaction and
provides the shared PostgreSQL client. Within that transaction the boundary:

1. activates the trusted tenant context;
2. serializes the idempotency key;
3. locks the tenant-bound envelope through the canonical expiry materialization
   function;
4. enforces immutable operation, target, policy, and policy-version binding;
5. enforces expected version, `APPROVED` state, expiry, attestation, and the
   `SINGLE_USE` consumption policy;
6. records the unique consumption;
7. invokes the protected consumer mutation with the same client;
8. appends canonical audit and Event Foundation outbox records;
9. stores the idempotent command result; and
10. lets the consumer commit only after every step succeeds.

If the locked envelope has reached its server-derived expiry, the same database
transaction persists `EXPIRED`, increments the version, and appends the
canonical expiry audit and Event Foundation outbox record. The boundary returns
an explicit `EXPIRED` outcome without invoking the protected operation. This
allows the consumer-owned transaction to commit the expiry lifecycle atomically
while still failing closed for the requested protected operation.

Any error rolls back the protected mutation, consumption, audit, outbox, and
command result together. Therefore, for supported same-database consumers:

`PROTECTED_OPERATION_COMMITTED IFF MPA_CONSUMPTION_COMMITTED`.

The envelope lock and unique consumption constraint serialize concurrent
consume/consume attempts so exactly one can succeed. Stale expected versions
and divergent idempotency-key reuse fail closed.

No standalone generic HTTP consume endpoint is provided because it could not
carry the protected mutation in this transaction. No distributed atomicity is
claimed; distributed MPA consumption is out of scope and requires separate
governance and architecture.

## Consequences

- Consumers must use the internal boundary rather than HTTP-authorize followed
  by an independent mutation.
- MPA permission possession does not bypass tenant, policy, SoD, attestation,
  lifecycle, expiry, version, or consumption checks.
- Production approval/consumption remains unavailable until a trusted
  physical-human attestation authority is designated and configured.
