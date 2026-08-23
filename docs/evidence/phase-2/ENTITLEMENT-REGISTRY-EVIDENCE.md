# ACS Phase 2 — Entitlement Registry Evidence

## Local implementation evidence

The tenant-scoped `PLAN_LINE_ACCESS` Entitlement Registry is implemented as an explicit command against an authoritative same-tenant `ACTIVE` Subscription. The accepted backend path is signed OIDC → canonical identity → active membership → AuthorizationPort → transaction-bound trusted context → least-privilege `NOBYPASSRLS` PostgreSQL role → RLS/FORCE RLS → service/repository transaction.

| Control                                                                                       | Local result                     |
| --------------------------------------------------------------------------------------------- | -------------------------------- |
| ENT-POS-001–012; ENT-NEG-001–018                                                              | `VERIFIED`                       |
| Concurrency, idempotency, history/audit/outbox atomicity                                      | `VERIFIED`                       |
| Migration, rollback/reapply, RLS/FORCE RLS and tenant isolation                               | `VERIFIED`                       |
| Entitlement Web UI, API-shaped tests and accessibility baseline                               | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Dedicated Phase 2 Entitlement workflow                                                        | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Usage, Billing, Invoice, Payment, Receipt, Collection, Accounting and Commission side effects | `NONE_VERIFIED`                  |

The UI consumes the real Entitlement endpoints and presents only API-authoritative Subscription, Customer, Contract, Plan and optional Plan Feature origin data. It provides no quantity, quota, metering, price or billing authority.

## Performance baseline

`BASELINE_MEASUREMENT_NOT_SLO = TRUE`. The formal Entitlement SLO remains `PENDING_GOVERNANCE_APPROVAL`. Local TEST_ONLY signed-OIDC/PostgreSQL measurements use one warm-up and five successful signed-OIDC samples per operation, reporting median/min/max without inventing percentiles. The latest medians (ms) were: create 177.74; list 14.39; detail 11.51; DRAFT update 47.20; assign 57.26; request activation 50.25; activate 61.95; suspend 55.45; resume 57.92; terminal transition 60.70; complete lifecycle 772.90.

Fresh closure runs: Entitlement `35/0`; Customer `1/0`; Lead `1/0`; Plan `37/0`; Partner `28/0`; Opportunity `58/0`; Proposal `98/0`; Contract `26/0`; Subscription `35/0`; Phase 1 `341/0`; Event Foundation `5/0` twice. Database validation reports `entitlement_rls = VERIFIED`.

## Preserved governance

`ADR-0023 = PROPOSED`. Retention, production broker and IdP/client decisions, production step-up/acr/amr mapping, named owners/approvers, formal SLO, QG-18–QG-22, baseline custody, ACS-REQ completeness and commit-signing enforcement remain open.
