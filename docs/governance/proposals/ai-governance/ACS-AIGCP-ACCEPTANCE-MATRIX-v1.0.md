# ACS AIGCP Acceptance Matrix v1.0

**Document ID:** `ACS-AIGCP-AM-001`\
**Status:** `GOVERNANCE_APPROVED_PENDING_PUBLICATION`\
**Current execution:** governance qualification only

## 1. Evidence rule

No gate may be marked PASS from design intent, mocks, enumeration, or
documentation alone. Operational PASS requires executed evidence on the
exact implementation revision.

Mocks are not substitutes for real PostgreSQL, RLS/FORCE RLS,
AuthorizationPort, MPA, concurrency, provider-boundary, or E2E evidence.

## 2. Reconciled acceptance gates

| Gate          | Required future evidence                                         | Reuse/new              | G0 state                 |
| ------------- | ---------------------------------------------------------------- | ---------------------- | ------------------------ |
| AIGOV-ACC-001 | Focused unit suites                                              | Extend                 | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-002 | Service/repository/contract integration                          | Extend                 | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-003 | Fresh disposable PostgreSQL 17 forward/rollback/reapply          | Reuse                  | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-004 | RLS and FORCE RLS verification                                   | Reuse/extend           | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-005 | Cross-tenant negative E2E                                        | Reuse/extend           | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-006 | Unauthorized and missing-context denial                          | Reuse/extend           | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-007 | Expected-version and concurrent mutation tests                   | Reuse/extend           | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-008 | Atomic state/audit/outbox/evidence/MPA proof                     | Reuse/extend           | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-009 | Transaction and dependency failure injection                     | Extend                 | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-010 | Prompt injection suite                                           | New                    | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-011 | Indirect prompt injection suite                                  | New                    | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-012 | Dataset/model/RAG/feedback poisoning controls                    | New                    | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-013 | Model identity/hash/signature/provenance                         | New using XCAP-005/XCF | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-014 | Dataset identity/version/provenance/permitted use                | New using XCAP-005     | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-015 | Reproducible AI-BOM linked to SBOM                               | New                    | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-016 | Evidence integrity and immutable originals                       | Reuse/extend XCAP-005  | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-017 | AuthorizationPort boundary and bypass denial                     | Reuse/extend           | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-018 | MPA independence/quorum/expiry/consume/replay                    | Reuse/extend           | BLOCKED_BY_POLICY_VALUES |
| AIGOV-ACC-019 | Independent kill-switch suspension/reactivation                  | New                    | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-020 | Affected cross-capability regression                             | Reuse                  | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-021 | Format, lint, typecheck, build, SCA/SBOM, secrets, container/IaC | Reuse                  | DEFINED_NOT_EXECUTED     |
| AIGOV-ACC-022 | Requirements/RTM/evidence completeness                           | Extend                 | G0_PASS                  |
| AIGOV-ACC-023 | Mandatory remote CI on publication revision                      | Reuse                  | NOT_AUTHORIZED_IN_G0     |
| AIGOV-ACC-024 | Explicit human governance disposition                            | Governance             | G0_PASS                  |

## 3. Slice exit rule

Each future slice must define its applicable subset before implementation.
All mandatory applicable gates must be executed, traceable, terminal, and
successful before a readiness or merge disposition.

Raw failures must remain visible even when baseline attribution proves
they are unrelated. No waiver, threshold weakening, timeout weakening,
test suppression, or expectation weakening is implied by this matrix.
