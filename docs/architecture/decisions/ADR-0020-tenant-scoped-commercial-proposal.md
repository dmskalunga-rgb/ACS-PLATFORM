# ADR-0020: Tenant-Scoped Commercial Proposal / Quotation Boundary

- Status: `PROPOSED`

## Context

Baseline v5.3 names proposals in Commercial Management and in the Commercial
canonical entity list, but does not define their aggregate, price, lifecycle or
approval semantics. The integrated Opportunity Registry is a non-financial
pipeline and treats `PROPOSAL` only as a pipeline stage.

## Proposed decision

Proposal is a tenant-scoped aggregate for a versioned commercial offer
(`Quotation`) linked to exactly one Opportunity. It owns Plan-referencing line
items and immutable commercial name, description and price snapshots.
Authoritative money and quantity use `NUMERIC(19,4)`; unit price and quantity
accept at most four decimals; line totals round `HALF_UP` at four decimals
before the Proposal sum. A Proposal has one supported ISO 4217 currency, no FX,
discount or tax engine, and server-authoritative pre-tax totals.

The current Proposal is authoritative state; `ProposalRevision` and owned
revision line items preserve immutable append-only commercial snapshots. Initial
revision is one. An APPROVED Proposal may change only through the explicit
`.revise` command, which snapshots, increments revision, returns to DRAFT and
requires reapproval. A SENT Proposal is never revised in place.

Expiry is persisted only through an explicit `.expire` action after
`valid_until`; acceptance is time-guarded. `REJECTED` is commercial rejection
after SENT only; an approval decline returns to DRAFT. Customer/Partner must
match their Opportunity relation when present; the Opportunity primary Plan must
appear in Proposal lines when present. Owner defaults from Opportunity and
controlled reassignment cannot weaken creator/approver SoD.

AuthorizationPort, trusted tenant context, least privilege, RLS/FORCE RLS,
append-only audit and atomic outbox are mandatory. No Contract, Subscription,
Billing, accounting, Commission, entitlement, Usage, Price Book, portal,
signature, external email or AI capability is introduced.

## Alternatives rejected

1. Metadata-only Proposal — duplicates Opportunity and is not a meaningful offer.
2. Reusing Opportunity as quotation — conflicts with its non-financial boundary.
3. Derived expiry, audit-only commercial history or generic PATCH of APPROVED
   content — cannot prove deterministic historic offer semantics.
4. Price Book, discount/tax engine or downstream Contract/Subscription/Billing —
   unauthorized expansion.

## Consequences and unresolved governance

This ADR is not implementation authorization and remains `PROPOSED`. Retention
duration, named owners, production step-up mapping, SLO thresholds, QG-18–QG-22,
baseline custody, ACS-REQ completeness and commit signing remain pending.
