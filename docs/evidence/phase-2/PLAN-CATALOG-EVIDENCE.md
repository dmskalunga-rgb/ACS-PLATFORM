# ACS Phase 2 — Plan Catalog Evidence

Status: `LOCAL_ACCEPTANCE_EVIDENCE_CAPTURED`

This evidence records observed local acceptance results for the tenant-scoped
Plan Catalog vertical slice. It is not publication, merge, production, or
governance acceptance evidence.

## Observed acceptance execution

- `PLAN_POSITIVE_MATRIX`: 8/8 PASS — all Plan and Plan Feature HTTP endpoints.
- `PLAN_NEGATIVE_SECURITY_MATRIX`: 25/25 PASS — OIDC, membership, tenant,
  permission, IDOR/BOLA, payload allowlist, stale-version, idempotency and
  inactive-parent cases.
- `PLAN_CONCURRENCY`: PASS — one Plan mutation wins and one is stale.
- `PLAN_FEATURE_CONCURRENCY`: PASS — Feature independent version semantics
  follow the same single-winner model.
- `PLAN_AUDIT_ACCEPTANCE`: PASS — persisted tenant, actor, action/resource,
  correlation/request metadata and redaction assertions.
- `PLAN_TRANSACTION_ATOMICITY` / `PLAN_OUTBOX_ATOMICITY`: PASS — controlled
  pre-commit failure leaves no aggregate, success-audit, or event row.
- `PLAN_EVENT_CONTRACT` / `PLAN_EVENT_LEAKAGE`: PASS — schema `1.0.0`,
  tenant-scoped internal events with no credentials, connection details,
  pricing, subscription, billing, or unrelated tenant payload data.
- `PLAN_FRONTEND_MATRIX`: 16/16 PASS; the web workspace reports 36 passing
  tests including its existing Customer and Lead coverage.

## Remaining boundaries

ADR-0017 remains `PROPOSED`. No pricing, subscriptions, billing, entitlement,
customer/lead assignment, production broker, production IdP, retention period,
SLO, named owner, or individual ACS-REQ identifier is asserted here.

## Local performance baseline

Disposable PostgreSQL plus in-process API/OIDC acceptance path, one operation
per observed value. Every value is `BASELINE_MEASUREMENT_NOT_SLO`; production
SLO definition remains `PRE_PRODUCTION_REQUIRED`.

| Operation                     | Elapsed time |
| ----------------------------- | -----------: |
| Plan create with audit/outbox |     38.93 ms |
| Plan detail                   |     16.37 ms |
| Plan paginated list           |     20.57 ms |
| Plan update with audit/outbox |     32.89 ms |
| Plan Feature create           |     30.62 ms |
| Plan Feature detail           |     22.93 ms |
| Plan Feature list             |     19.42 ms |
| Plan Feature update           |     36.21 ms |
| Complete Plan journey         |    220.14 ms |
