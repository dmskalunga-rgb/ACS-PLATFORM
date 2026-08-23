# ACS Phase 2 — Contract Registry Evidence

Status: `LOCAL_IMPLEMENTATION_EVIDENCED`

## Implemented boundary

Contract is an explicit tenant-scoped agreement created from one `ACCEPTED` Proposal. The implementation includes the Contract aggregate, proposal-derived line snapshots, immutable revision snapshots, least-privilege PostgreSQL access, RLS/FORCE RLS, signed-OIDC runtime validation, AuthorizationPort, trusted transaction-bound context, idempotency, expected-version concurrency, audit and transactional outbox.

Activation changes Contract state only. It creates no Subscription, Entitlement, Usage, Billing, Invoice, Payment, accounting or commission side effect.

## Local verification

| Evidence                                                            | Result                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| CTR-POS-001–012                                                     | `VERIFIED`                                                                                                                            |
| CTR-NEG-001–013                                                     | `VERIFIED`                                                                                                                            |
| Contract signed-OIDC E2E                                            | `VERIFIED` in two deterministic runs                                                                                                  |
| Contract RLS/FORCE RLS and migration/rollback/reapply               | `VERIFIED` by `pnpm db:validate`                                                                                                      |
| Concurrency, idempotency, aggregate/audit/outbox/revision atomicity | `VERIFIED`                                                                                                                            |
| Contract Web UI and accessibility matrix                            | `IMPLEMENTED`; 22 deterministic Web tests exercise real endpoint shapes, active-owner data and accessibility at the frontend boundary |
| Contract CI workflow                                                | `IMPLEMENTED`; disposable PostgreSQL identities only                                                                                  |
| Performance                                                         | `BASELINE_MEASUREMENT_NOT_SLO`                                                                                                        |

## Deferred or governance-pending

- `ADR-0021 = PROPOSED`.
- Production broker, IdP/client registration and step-up mapping are `PRODUCTION_ONLY` / `PENDING_GOVERNANCE_APPROVAL`.
- Retention, formal Contract SLO, named owners/approvers, QG-18–QG-22, baseline custody and ACS-REQ completeness remain `PENDING_GOVERNANCE_APPROVAL`.
- Frontend obtains owner options only from the existing authoritative active-membership administration endpoint. Revision-history and audit-timeline views remain unavailable until authoritative API endpoints are separately authorised.
- This is not production, release, deployment or main-merge approval.
