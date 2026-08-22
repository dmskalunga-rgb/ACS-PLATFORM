# ADR-0021: Tenant-Scoped Commercial Contract Boundary

- Status: `PROPOSED`

## Context

The baseline lists Contracts but does not define their lifecycle, origin, monetary semantics or downstream effects. Human governance selected Contract as the next capability after Proposal / Quotation and froze its bounded policy.

## Proposed decision

Contract is a tenant-scoped aggregate explicitly created from exactly one accepted Proposal. It owns immutable Proposal-derived line and commercial snapshots and immutable append-only revision history. A source Proposal has at most one current Contract. Creation is idempotent, atomic and cannot accept client-authored source totals or substitutions.

Contract lifecycle is `DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE`, with approval return, approved-only revision, approved cancellation and active termination. Creator/approver SoD, AuthorizationPort, trusted context, least privilege, RLS/FORCE RLS, expected-version concurrency, audit and transactional outbox are mandatory. Money preserves `NUMERIC(19,4)` and per-line `HALF_UP`.

Activation changes Contract lifecycle only. It creates no Subscription, Entitlement, Usage, Billing, Invoice, Payment, Commission or accounting effect.

## Consequences and exclusions

No root hard delete, automatic renewal, amendment, tax/discount engine, FX, signature, document generation, production deployment or downstream commercial/financial capability is introduced. Event names are candidate contracts until a justified consumer and EDIM reconciliation exist. This ADR is not implementation or production approval.
