# ADR-0024: Tenant-Scoped Usage / Metering Boundary

- Status: `PROPOSED`

## Context

The integrated commercial chain ends in a non-financial `PLAN_LINE_ACCESS`
Entitlement. It deliberately has no quantity, quota, meter, price, or billing
authority. The baseline names `usage_records`, but the repository did not
previously define a bounded measurement model, source trust boundary, or
financial interpretation.

## Decision

Usage/Metering is one tenant-scoped Phase 2 capability with separately
distinguishable concerns. Metering authenticates, validates, normalizes, and
records non-financial measurements. Usage derives reproducible, non-financial
aggregations from accepted immutable measurements and explicit corrections.

Every accepted record has a server-resolved same-tenant lineage of
`Tenant → Subscription → Entitlement`; Contract, Customer, Plan, Plan-line,
and Plan Feature facts may be retained only when present in immutable upstream
evidence. Client tenant or commercial lineage is never authoritative.

Raw measurements are append-only. Event time, received time, and processing
time are distinct UTC concepts. A correction is an append-only compensating
record referencing its original; it neither overwrites history nor changes
commercial origin. API idempotency and source-measurement deduplication are
separate, tenant-scoped controls.

Machine source ingestion is distinct from human operations. Sources have a
server-authoritative tenant binding and an explicit trust state
(`REGISTERED_SOURCE`, `UNREGISTERED_SOURCE`, `DISABLED_SOURCE`, or
`REVOKED_SOURCE`). The exact source-registration ownership remains a DoR
decision: it may be local to this capability or a future integration registry;
this ADR creates no separate platform domain.

Human operations preserve signed OIDC, canonical identity, active membership,
AuthorizationPort, trusted PostgreSQL context, least privilege, RLS/FORCE RLS,
audit, and transactional outbox. Machine authentication is separately defined
and must fail closed. Authoritative events use Event Foundation through the
transactional outbox, with idempotent consumers and controlled retry/DLQ/replay.

## Financial and capacity firewall

`USAGE_METERING_FINANCIAL_AUTHORITY = NONE`. The capability has no rating,
pricing, tariff, currency, tax, discount, credit, debit, charge, invoice,
payment, accounting, Commission, quota, allowance, capacity, seat, or limit
enforcement authority. It creates no Billing, Invoice, Payment, Receipt,
Collection, Accounting, or Commission record or side effect.

## Consequences and exclusions

The DoR must define source authentication and authorization, source-scoped
deduplication identity, schema/unit/value validation, clock-skew and late-arrival
policy, aggregation dimensions/windows, correction authorization, SoD,
retention gates, and canonical event names/payloads. It must not infer a
commercial `DRAFT → ACTIVE` lifecycle or a production retention duration.

This ADR is not implementation, production, release, deployment, or main-merge
authorization. Named owners, retention, formal SLOs, production step-up, broker
and IdP decisions, QG-18–QG-22, baseline custody, ACS-REQ completeness, and
commit-signing enforcement remain open.
