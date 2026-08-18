# ADR-0014: Tenant administration and authorization lifecycle

- Status: PROPOSED_REVISION_REQUIRED
- Date: 2026-08-14
- Scope: Phase 1 Platform Foundation only
- Human disposition: `REVISE`, PR #6 comment `5328117974`, 2026-08-18

## Context

The integrated Phase 1 foundation authenticates OIDC identities, resolves active tenant
memberships, evaluates `platform.context.read`, issues transaction-bound tenant grants, enforces
PostgreSQL RLS, and records durable audit evidence. It does not yet model canonical roles or the
administrative lifecycle that assigns and revokes authorization.

## Decision

Extend the existing `platform` boundary rather than creating a second identity or authorization
system.

- OIDC remains authentication only. Tenant membership, roles, and permissions are resolved from
  PostgreSQL.
- Add tenant-owned `roles`, `role_permissions`, `membership_roles`, `administrative_operations`,
  and `domain_events` relations with constraints, indexes, RLS, and `FORCE ROW LEVEL SECURITY`.
- Preserve `membership_permissions` as a compatibility path for the already integrated context
  slice. Administrative authorization is granted through role-to-permission evaluation.
- Add a separate least-privilege `acs_phase1_tenant_admin` database role. Administrative writes
  require a one-use, permission-bound tenant context issued only after `AuthorizationPort`
  evaluation.
- Reject self-administration and cross-tenant identifiers in PostgreSQL. Use membership versions,
  row locking, and caller idempotency keys for deterministic retry and stale-write rejection.
- Write the allowed audit record and a canonical domain event in the same transaction as every
  state change. Denials use the existing security audit boundary.
- Expose only `/api/v1/platform/tenants/{tenantId}/...` administration endpoints. The server
  derives the actor from the authenticated identity and never accepts an actor or permission grant
  from the client.

## Consequences

Authorization revocation takes effect on the next operation because every request resolves the
current active membership and current role-permission graph before issuing a short-lived grant.
The transactional event table is an outbox boundary, not a fictitious message broker. Publishing
and retention use the pre-Phase-2 Event Delivery & Operational Lifecycle Foundation. The outbox
remains the canonical source; delivery state is stored separately. A recoverable publisher claims
bounded batches with PostgreSQL lease/locking semantics, exits the transaction before transport
I/O, and records `PUBLISHED`, bounded retry, or `DEAD_LETTERED` outcomes.

Delivery is at least once. Consumer idempotency, controlled replay, retention, audit,
observability, and crash recovery are mandatory. No global ordering is assumed. A future broker
adapter remains transport-agnostic and requires separate selection. Replay and lifecycle override
are privileged, server-authorized, step-up-marked operations; Event Delivery privileges do not
confer future Commercial or Finance authority.

## Explicit exclusions

No plans, subscriptions, billing, pricing, customers, CRM, contracts, invoices, payments,
licensing, metering, revenue, Phase 2 domain, production deployment, or JIT provisioning is
introduced. This ADR remains `PROPOSED` until human governance authority accepts it.
