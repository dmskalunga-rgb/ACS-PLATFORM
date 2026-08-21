# ADR-0018: Tenant-Scoped Commercial Partner Registry Boundary

- Status: `PROPOSED`
- Date: 2026-08-21
- Decision authority: Partner Registry human governance disposition

## Context

Baseline v5.3 VOL-V 5.48 names partners and commissions as Commercial
Management concerns, and VOL-VI 6.4.2 lists `partners` as a Commercial
canonical entity. Those baseline references do not define Partner taxonomy,
commission coupling, tenant scope or lifecycle. The human governance disposition
therefore fixes only the smallest independent registry boundary.

## Proposed decision

Adopt a tenant-scoped, non-financial `Partner` master-data aggregate. Each
Partner belongs to one tenant and has a required case-insensitively unique
partner code, required display name, `ACTIVE`/`INACTIVE` lifecycle, optimistic
version and no hard delete. It is mediated by `AuthorizationPort`, trusted
transaction-bound context, PostgreSQL RLS/FORCE RLS, append-only audit and the
transactional outbox.

The initial registry has no taxonomy, contact data or external integration.
It emits only minimal internal `commercial.partner.created`, `.updated` and
`.status_changed` events through Event Foundation.

## Consequences and exclusions

Commission is `OPTIONAL_FUTURE` and separate. No rate, payout, balance,
currency, revenue share, financial identifier or settlement instruction is
stored. Customer, Lead, Plan, Opportunity, Contract and Subscription relations
are excluded, as are billing, pricing, discounts, invoice, payment, receipt,
collection, referral and financial reconciliation.

Routine Partner operations do not add a step-up requirement, but no Partner
permission grants Finance, Billing, Commission, Security Administrator,
Platform Administrator or Auditor mutation authority. Retention, named
owners/approvers, production broker, production IdP/client, assurance mapping
and SLOs remain pending governance.

## Alternatives and unresolved decisions

Platform-global Partner, mixed tenant/global association, reseller/referral/
distributor taxonomies, additional lifecycle statuses and contact data are
rejected or deferred for this slice because they exceed the human-approved
minimum. This ADR remains `PROPOSED`; it does not authorize implementation or
resolve global ECOM/EDIM/EDOLM, ACS-REQ, baseline-custody, commit-signing or
QG-18–QG-22 gaps.
