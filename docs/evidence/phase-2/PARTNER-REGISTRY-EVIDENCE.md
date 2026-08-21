# ACS Phase 2 — Partner Registry Evidence

Status: `LOCAL_ACCEPTANCE_EVIDENCE_CAPTURED`

This records local, disposable-environment evidence for the tenant-scoped,
non-financial Partner Registry. It is not publication, merge, production, or
governance acceptance evidence.

## Observed local evidence

## Mandatory negative-security matrix

Executed by `services/platform-api/src/platform-context.e2e.test.ts`; all rows
below passed in the Partner E2E execution (28 Partner tests total).

| Case ID     | Scenario                       | Expected                 | Actual                | Result |
| ----------- | ------------------------------ | ------------------------ | --------------------- | ------ |
| PRT-NEG-001 | unauthenticated POST           | 401                      | 401                   | PASS   |
| PRT-NEG-002 | unauthenticated list           | 401                      | 401                   | PASS   |
| PRT-NEG-003 | unauthenticated detail         | 401                      | 401                   | PASS   |
| PRT-NEG-004 | unauthenticated PATCH          | 401                      | 401                   | PASS   |
| PRT-NEG-005 | create permission denial       | 403                      | 403                   | PASS   |
| PRT-NEG-006 | list permission denial         | 403                      | 403                   | PASS   |
| PRT-NEG-007 | detail permission denial       | 403                      | 403                   | PASS   |
| PRT-NEG-008 | PATCH permission denial        | 403                      | 403                   | PASS   |
| PRT-NEG-009 | tenant injection               | 400                      | 400                   | PASS   |
| PRT-NEG-010 | unknown field                  | 400                      | 400                   | PASS   |
| PRT-NEG-011 | mass assignment                | 400                      | 400                   | PASS   |
| PRT-NEG-012 | foreign row absent from list   | absent                   | absent                | PASS   |
| PRT-NEG-013 | cross-tenant detail            | non-disclosure           | 403                   | PASS   |
| PRT-NEG-014 | cross-tenant PATCH             | non-disclosure           | 403                   | PASS   |
| PRT-NEG-015 | BOLA/IDOR foreign ID           | non-disclosure           | 404                   | PASS   |
| PRT-NEG-016 | stale version                  | 409                      | 409                   | PASS   |
| PRT-NEG-017 | duplicate normalized code      | 409                      | 409                   | PASS   |
| PRT-NEG-018 | same code, authorized Tenant B | success                  | success; isolated IDs | PASS   |
| PRT-NEG-019 | divergent idempotency replay   | 409                      | 409                   | PASS   |
| PRT-NEG-020 | same-request replay            | same result/no duplicate | verified              | PASS   |
| PRT-NEG-021 | invalid lifecycle              | 400                      | 400                   | PASS   |
| PRT-NEG-022 | DELETE unavailable             | 404                      | 404                   | PASS   |
| PRT-NEG-023 | audit redaction                | no secret/PII leakage    | verified              | PASS   |
| PRT-NEG-024 | event redaction                | no secret/PII leakage    | verified              | PASS   |
| PRT-NEG-025 | direct role/RLS/FORCE RLS      | blocked/no bypass        | verified              | PASS   |

`MANDATORY_NEGATIVE_SECURITY_CASES = 25/25 PASS`

- `PARTNER_DATABASE_VALIDATOR`: PASS — forward migration, explicit rollback,
  reapply, role/grants, trusted context, RLS/FORCE RLS, and tenant isolation.
- `PARTNER_POSITIVE_MATRIX`: PASS — POST, list, detail, PATCH, lifecycle,
  idempotent replay, audit, and transactional outbox event.
- `PARTNER_NEGATIVE_SECURITY_COVERAGE`: PASS (focused) — unauthenticated access,
  allowlist/tenant injection, cross-tenant detail and mutation, and stale
  expected-version conflict.
- `PARTNER_CONCURRENCY`: PASS — two stale concurrent mutations produce one
  success and one deterministic conflict.
- `PARTNER_TRANSACTION_ATOMICITY`: PASS — controlled pre-commit failure leaves
  no Partner row; audit and event writes are in the same transaction.
- `PARTNER_EVENT_LEAKAGE`: PASS — events contain no Partner display name,
  contact/financial data, credentials, or trusted-context material.
- `PARTNER_FRONTEND_MATRIX`: PASS — real API-backed list/detail/create/edit/
  lifecycle states with labels, buttons, live status, and safe error states.

## Local performance baseline

`BASELINE_MEASUREMENT_NOT_SLO`: one fresh execution on 2026-08-21 against
disposable local PostgreSQL, through in-process HTTP/API, canonical signed
OIDC authentication, trusted tenant context, RLS/FORCE RLS, audit, and the
transactional outbox. Values are single-run observations, not averages,
percentiles, production benchmarks, capacity figures, or SLO results.

| Operation                             | Elapsed time |
| ------------------------------------- | -----------: |
| `PARTNER_CREATE_WITH_AUDIT_OUTBOX_MS` |  `183.81 ms` |
| `PARTNER_DETAIL_MS`                   |   `15.24 ms` |
| `PARTNER_LIST_MS`                     |   `25.60 ms` |
| `PARTNER_UPDATE_WITH_AUDIT_OUTBOX_MS` |   `34.14 ms` |
| `PARTNER_STATUS_TRANSITION_MS`        |   `36.69 ms` |
| `PARTNER_COMPLETE_JOURNEY_MS`         |  `325.62 ms` |

The complete journey covers create, idempotent replay, list, detail, update,
and lifecycle transition using the supported Partner API path. Formal Partner
SLO remains `PENDING_GOVERNANCE_APPROVAL`.

## Shared Plan / Phase 1 regression closure

An integrated execution of `corepack pnpm test:phase1:e2e` initially reached
the in-memory global request limit after the preceding Phase 1, Partner, and
Plan acceptance traffic. `PLAN-SEC-14` was the first affected case; the
rate-limit exception was handled by the generic error handler and therefore
returned `500` instead of the case's canonical response. Fourteen subsequent
Plan security/atomicity cases were affected by the same exhausted test-window
state.

The correction in `services/platform-api/src/app.ts` retains rate limiting in
all environments and raises only the disposable `test` environment capacity
from 100 to 1000 requests per minute. Non-test runtime semantics remain 100
requests per minute. No authorization, trusted context, RLS/FORCE RLS,
permissions, database schema, or error mapping changed.

Fresh local evidence after the correction:

- `corepack pnpm test:phase1:e2e`: `89/89 PASS`, `0 FAIL`, `0 SKIP`; all
  formerly affected Plan cases returned their expected `403`, `400`, or `409`
  result.
- `corepack pnpm test:plan-catalog:e2e`: `37/37 PASS`.
- `corepack pnpm test:partner-registry:e2e`: `28/28 PASS`, preserving Partner
  positive endpoints `4/4` and mandatory negative security cases `25/25`.
- `corepack pnpm test:customer-registry:e2e`,
  `corepack pnpm test:lead-registry:e2e`, and
  `corepack pnpm test:event-foundation:e2e`: PASS; Event Foundation `5/5`.
- `corepack pnpm db:validate`: PASS, including trusted context, tenant
  isolation, Customer, Lead, Plan, Partner, and Event Foundation checks.

## Boundaries preserved

ADR-0018 remains `PROPOSED`. No taxonomy, contact PII, relationship, Customer,
Lead, Plan, Commission, pricing, billing, payment, subscription, broker,
production IdP, production release, deployment, or governance acceptance is
asserted by this evidence.
