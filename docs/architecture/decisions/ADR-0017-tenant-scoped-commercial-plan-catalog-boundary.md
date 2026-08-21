# ADR-0017: Tenant-Scoped Commercial Plan Catalog Boundary

- Status: `PROPOSED`
- Date: 2026-08-21
- Decision authority: Plan Catalog human governance disposition

## Context

Baseline v5.3 VOL-VI 6.4.2 lists `plans` and `plan_features` as canonical
Commercial domain entities. The integrated platform already provides the
identity, authorization, trusted tenant context, PostgreSQL FORCE RLS, audit
and transactional-outbox boundaries that a later slice must reuse.

## Proposed decision

Adopt a minimal tenant-owned `Plan` aggregate with managed `Plan Feature`
children. A Plan has only `ACTIVE`/`INACTIVE` lifecycle and no hard delete.
Features have no independent lifecycle and cannot be shared between Plans or
tenants. Codes are case-insensitively unique per tenant (Plan) and per parent
Plan (Feature). All mutations are allowlisted, tenant-scoped, idempotent,
optimistically versioned and atomically audited/evented.

No feature constraint metadata is introduced. Pricing, currency, tax,
subscription, entitlement, licensing, usage, metering, customer, lead,
opportunity, contract, invoicing, payment and financial concerns are outside
the decision.

## Consequences

The later implementation must use AuthorizationPort and trusted context rather
than token or request-supplied tenant authority, and PostgreSQL RLS plus FORCE
RLS. It must prove child-parent tenant isolation, no bypass, optimistic
concurrency, idempotency, audit and canonical `commercial.plan.*` /
`commercial.plan_feature.*` outbox events. Retention, production broker,
production identity configuration, SLOs and named ownership remain governance
decisions and this ADR remains `PROPOSED` until separately accepted.
