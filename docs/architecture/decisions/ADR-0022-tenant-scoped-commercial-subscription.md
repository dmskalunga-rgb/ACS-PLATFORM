# ADR-0022: Tenant-Scoped Commercial Subscription

**Status:** `PROPOSED`
**Date:** 2026-08-23
**Scope:** Phase 2 commercial Subscription DoR; no implementation approval.

## Context

ACS requires a bounded Subscription aggregate after Customer, Lead, Plan, Partner, Opportunity, Proposal, and Contract capabilities. The baseline mentions subscriptions, renewal, suspension, cancellation, plans, modules, limits, and billing concepts, but does not authorize combining these concerns or inferring runtime access/financial behavior from a commercial Contract.

ADR-0021 keeps Contract activation free of downstream commercial, entitlement, usage, and financial side effects. Subscription therefore needs an explicit origin, lifecycle, authorization, isolation, audit, and event boundary.

## Decision

1. Subscription is a separate, tenant-scoped aggregate with its own immutable history, versioning, audit, transactional outbox, and RLS/FORCE RLS protection.
2. It originates only through an explicit command from exactly one authoritative `ACTIVE` Contract. Contract activation never auto-creates it, and Contract-less creation is rejected.
3. At most one current Subscription may exist for the same Contract within a tenant. Idempotency and concurrent-create protection are mandatory.
4. Customer and commercial Plan/Plan Feature origin are derived server-side from immutable Contract commercial origin. Client substitution and mutable re-interpretation are prohibited.
5. Contract quantity remains commercial history; it is not capacity, entitlement, usage allowance, seat count, module allocation, or provisioning authority.
6. The lifecycle is `DRAFT → PENDING_ACTIVATION → ACTIVE → SUSPENDED → ACTIVE`, with terminal `CANCELLED` and `TERMINATED`. Every transition is explicit and versioned. Renewal is explicit-only and non-financial.
7. Subscription creator self-activation is denied. Least-privilege permissions are separate for read, create, update, assignment, request activation, activate, suspend, resume, cancel, terminate, and renew.
8. Subscription must use the canonical signed-OIDC through trusted tenant context and least-privilege PostgreSQL path. Tenant data access relies on RLS/FORCE RLS; no admin-runtime bypass is accepted.
9. Subscription creates no entitlement, provisioning, usage, billing, invoice, payment, receipt, collection, accounting, Partner financial, Commission, trial, proration, upgrade/downgrade, or automatic lifecycle side effect.

## Consequences

The implementation can provide a deterministic commercial lifecycle without silently selecting a billing model or turning quoted quantity into access control. A future Entitlement, Usage, Billing, Commission, or renewal-policy capability must be separately governed and cannot reinterpret Subscription origin facts retroactively.

## Rejected alternatives

- Creating a Subscription automatically when a Contract becomes `ACTIVE`.
- Accepting Contract-less Subscription creation or client-authoritative Customer/Plan inputs.
- Treating Contract quantity as seats, capacity, quota, usage, or entitlement.
- Combining Subscription with Billing, Invoice, Payment, Collection, or accounting.
- Reusing a broad administration permission or bypassing RLS/FORCE RLS for lifecycle commands.

## Governance notes

Retention, production broker, production IdP/client registration, `acr`/`amr` mapping, SLO thresholds, named owners/approvers, and baseline governance gaps remain pending. This ADR is `PROPOSED` and does not approve implementation, release, deployment, or merge to `main`.
