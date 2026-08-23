# ADR-0023 — Tenant-Scoped Commercial Entitlement

**Status:** `PROPOSED`
**Date:** 2026-08-23

## Context

Subscription is integrated as a non-financial commercial lifecycle from an `ACTIVE` Contract and explicitly creates no entitlement, provisioning, usage, or financial side effect. The baseline names entitlements as a future capability but does not authorize automatic provisioning, metering, or financial consequences.

## Decision

Adopt a future tenant-scoped Entitlement as a separate aggregate created explicitly from an existing same-tenant `ACTIVE` Subscription. It owns immutable origin/history snapshots and a bounded non-financial lifecycle. It derives Customer, Contract, Subscription and Plan-line authority server-side; a Plan Feature reference is preserved only if already present in immutable source evidence.

The initial deterministic content is `PLAN_LINE_ACCESS`, an access assertion without quantity, quota, limit, capacity, usage, price, tax, or monetary authority. At most one current Entitlement exists for one immutable Subscription-origin Plan-line assertion. Activation requires a distinct authorized actor from the creator.

All mutation follows the canonical signed-OIDC, AuthorizationPort, trusted-context, least-privilege PostgreSQL, RLS/FORCE RLS, expected-version, tenant-idempotency, immutable-history, audit, and transactional-outbox path.

## Consequences

Entitlement does not mutate upstream aggregates and produces no automatic Usage, Billing, Invoice, Payment, Receipt, Collection, Accounting, or Commission side effect. It does not choose a production provisioning consumer, broker, retention schedule, SLO, or named owner. Runtime implementation requires independent authorization.
