# ADR-0025: Tenant-Scoped Commercial Rating

- Status: `PROPOSED`

## Context

Usage/Metering now provides immutable non-financial usage facts with authoritative
Tenant → Subscription → Entitlement lineage. Proposal and Contract preserve bounded
commercial price snapshots but do not provide reusable tariff, Rating, Billing, or
financial authority. The baseline Marketplace Rating Service is unrelated to this
Commercial domain unless a future decision explicitly joins them.

## Decision

Commercial Rating is a distinct tenant-scoped monetary-valuation domain. It owns
immutable Rate Plan versions, Rating applicability, and immutable Rated Facts.
Rate Plans are separate from Plan and Plan Feature catalog data. A server-resolved
Subscription applicability assignment selects the governing immutable Rate Plan
version; client input cannot select tenant, Usage, commercial lineage, or rate.

Only FLAT, PER_UNIT and TIERED_GRADUATED models are supported. Rating uses Usage
hourly/daily aggregates and event-window time. Decimal arithmetic is mandatory;
initial support is USD at two fractional digits, final lines round HALF_UP, and FX
is excluded. Late Usage or an APPLIED correction creates append-only rerating with
historic Rated Facts preserved.

Rate Plan creator self-approval and self-activation are prohibited. Human commands
must use signed OIDC, AuthorizationPort, trusted context, least privilege, RLS/FORCE
RLS, idempotency, concurrency control, audit and transactional outbox. Measurement
Source principals have no Rating permission. Billing, Invoice, Payment, Receipt,
Collection, Accounting, and Commission side effects are prohibited.

The planned canonical event vocabulary is `commercial.rating.rate-plan.created`,
`.submitted`, `.approved`, `.activated`, `.superseded`, `.retired`,
`commercial.rating.rated`, and `commercial.rating.rerated`; all use the existing
transactional outbox/Event Foundation rather than a direct broker publish.

## Rejected alternatives

- Treating Usage/Metering, Plan, Plan Feature, Proposal, Contract, or Subscription
  as a reusable tariff/Rate Plan authority.
- Selecting an arbitrary tenant Rate Plan or using processing time for historical
  rate selection.
- Mutating published/effective Rate Plans or Rated Facts in place.
- Volume, package, prepaid, credit, wallet, surge, spot, auction, ML-generated, or
  arbitrary-formula pricing in the initial slice.
- FX, tax, discount, proration, manual monetary adjustment, or downstream Billing
  responsibilities in Rating.
- Granting Measurement Source machine principals direct Rating execution authority.

## Consequences and exclusions

The initial domain has no tax, discount, proration, manual monetary adjustment,
minimum/maximum charge, currency conversion, wallet, prepaid or credit model.
Manual rerating is high-risk and independently authorized; production step-up remains
pending. Retention, named owners, SLOs, production configuration, global governance
catalog completeness, baseline custody, ACS-REQ completeness and commit signing
remain open production or governance gates.

This ADR does not authorize implementation, migration, release, deployment, or a
merge to main.
