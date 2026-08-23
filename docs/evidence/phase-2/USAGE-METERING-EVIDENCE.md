# ACS Phase 2 — Usage / Metering Evidence

## Local implementation evidence

Usage/Metering is a tenant-scoped, non-financial capability with two security paths. Machine ingestion follows credential authentication → canonical machine principal → authoritative tenant/source binding → least-privilege PostgreSQL role → RLS/FORCE RLS → transactional measurement, audit and outbox. Human administration follows signed OIDC → canonical identity → active membership → AuthorizationPort → trusted tenant context → least-privilege Usage role → RLS/FORCE RLS.

| Control                                                                | Local result                     |
| ---------------------------------------------------------------------- | -------------------------------- |
| USG-POS-001–010; USG-NEG-001–015; five supplementary proofs            | `VERIFIED`                       |
| Source lifecycle/rotation; deduplication/idempotency/concurrency       | `VERIFIED`                       |
| Raw immutability; append-only corrections; hourly/daily rebuildability | `VERIFIED`                       |
| Ingestion/correction audit and outbox atomicity                        | `VERIFIED`                       |
| Migration, rollback/reapply, RLS/FORCE RLS and tenant isolation        | `VERIFIED`                       |
| Human operator Web UI and API-shaped accessibility tests               | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Dedicated Phase 2 Usage/Metering workflow                              | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Rating and all billing/financial/accounting downstream effects         | `NONE_VERIFIED`                  |

The Web UI uses authoritative human APIs for source administration, raw-measurement visibility, append-only corrections and non-financial aggregates. A newly issued or rotated credential exists only in component memory and is dismissible; no browser storage is used. Machine ingestion deliberately has no browser control.

## Shared machine trusted-context foundation

Evidence comprises migration `20260828010000_machine_principal_trusted_context`, its rollback, the least-privilege issuer role, validator marker `machine_trusted_context = VERIFIED`, credential verification and canonical negative tests. Credentials and hashes are absent from audit/outbox payloads. No production credential provider is selected.

## Performance baseline

`PERFORMANCE_ENVIRONMENT = LOCAL_DISPOSABLE_TEST_ONLY`, `PERFORMANCE_BASELINE = RECORDED`, `BASELINE_MEASUREMENT_NOT_SLO = TRUE`. One unreported warm-up and five measured signed application-path samples per repeatable operation were used (state transition: disable plus reactivate, ten samples), reporting median/min/max milliseconds.

| Operation                                 |                Median |                   Min |                   Max | Samples |
| ----------------------------------------- | --------------------: | --------------------: | --------------------: | ------: |
| Source registration                       |                 17.43 |                 15.53 |                 18.26 |       5 |
| Source list / detail                      |         13.56 / 10.76 |         12.17 / 10.26 |         15.38 / 23.68 |  5 each |
| Accepted / replay / same-bucket ingestion | 37.24 / 11.56 / 36.78 | 35.70 / 10.93 / 35.51 | 57.21 / 16.04 / 50.46 |  5 each |
| Measurement list / detail                 |         13.59 / 11.14 |         13.29 / 10.11 |         19.62 / 16.55 |  5 each |
| Correction                                |                 30.13 |                 27.88 |                 48.61 |       5 |
| Hourly / daily aggregate                  |         10.77 / 10.95 |         10.26 / 10.16 |         14.60 / 14.33 |  5 each |
| Source transition / credential rotation   |         19.09 / 14.47 |         17.77 / 13.46 |         56.78 / 15.97 |  10 / 5 |
| Representative operator journey           |                272.07 |                252.37 |                353.20 |       5 |

Machine authentication and human signed-OIDC remained enabled. These diagnostic numbers are not an SLO; `FORMAL_USAGE_METERING_SLO = PENDING_GOVERNANCE_APPROVAL`.

## Preserved governance

`ADR-0024 = PROPOSED`. Retention, production broker/IdP/client/credential provider, production acr/amr mapping, owners/approvers, formal SLO, QG-18–QG-22, baseline custody, global catalogs/ACS-REQ completeness and commit-signing enforcement remain open. Publication, PR, merge, release, deployment, Production and the next capability remain unauthorized.
