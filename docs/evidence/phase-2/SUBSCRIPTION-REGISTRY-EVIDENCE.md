# ACS Phase 2 — Subscription Registry Evidence

Status: `LOCAL_IMPLEMENTATION_EVIDENCED`

Subscription is an explicit tenant-scoped aggregate created only from an authoritative `ACTIVE` Contract. Customer and Plan origin are server-derived; the Web client only submits bounded API commands and displays authoritative responses.

| Evidence                                                                                                   | Result                           |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------- |
| SUB-POS-001–012 / SUB-NEG-001–022                                                                          | `VERIFIED`                       |
| Signed OIDC → AuthorizationPort → trusted context → least-privilege PostgreSQL                             | `VERIFIED`                       |
| RLS/FORCE RLS, tenant isolation, SoD, expected version and idempotency                                     | `VERIFIED`                       |
| Concurrent mutation and transactional aggregate/history/audit/outbox rollback                              | `VERIFIED`                       |
| Entitlement, usage, billing, invoice, payment, receipt, collection, accounting and commission side effects | `NONE_VERIFIED`                  |
| Subscription Web UI / accessibility matrix                                                                 | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Subscription CI workflow and TEST_ONLY shared-E2E environment wiring                                       | `LOCAL_IMPLEMENTATION_EVIDENCED` |

No production readiness, broker selection, retention period, SLO, deployment, release or governance disposition is implied.

## Signed-OIDC / PostgreSQL performance baseline

`PERFORMANCE_ENVIRONMENT = LOCAL_DISPOSABLE_TEST_ONLY`. The Subscription signed-OIDC E2E harness performed one unreported warm-up and five fresh, deterministic lifecycle samples per operation on 2026-08-23. It measured the accepted application path: signed OIDC → canonical identity → active membership → `AuthorizationPort` → trusted context → least-privilege Subscription PostgreSQL role → RLS/FORCE RLS → application transaction, including audit, outbox and immutable history where applicable.

`BASELINE_MEASUREMENT_NOT_SLO = TRUE`. The medians below are observed local test-environment elapsed times, not a performance target, capacity claim or production SLO.

| Operation                                 | Samples | Median ms |    Min–max ms |
| ----------------------------------------- | ------: | --------: | ------------: |
| Create Subscription from ACTIVE Contract  |       5 |     37.37 |   25.80–54.11 |
| List Subscriptions                        |       5 |     17.78 |   14.85–23.50 |
| Subscription detail                       |       5 |     13.90 |   11.02–18.96 |
| DRAFT update                              |       5 |     32.24 |   25.51–38.38 |
| Owner assignment                          |       5 |     35.60 |   30.70–43.31 |
| Request activation                        |       5 |     38.89 |   35.19–41.03 |
| Activate                                  |       5 |     44.53 |   37.79–53.05 |
| Suspend                                   |       5 |     42.19 |   34.81–64.67 |
| Resume                                    |       5 |     46.00 |   37.13–77.25 |
| Explicit renewal                          |       5 |     51.79 |   41.80–81.72 |
| Terminal transition (`cancel`)            |       5 |     45.54 |   40.47–60.32 |
| Complete representative lifecycle journey |       5 |    423.07 | 381.62–498.66 |

The baseline retained signed OIDC, `AuthorizationPort`, trusted context, least-privilege PostgreSQL, RLS/FORCE RLS, tenant isolation, audit, outbox, immutable history, expected-version concurrency and idempotency. `FORMAL_SUBSCRIPTION_SLO = PENDING_GOVERNANCE_APPROVAL`.

## Pending governance

- `ADR-0022 = PROPOSED`.
- Retention, formal Subscription SLO, named owners/approvers and production step-up remain `PENDING_GOVERNANCE_APPROVAL`.
- QG-18–QG-22 remain `UNDEFINED_IN_BASELINE`.
