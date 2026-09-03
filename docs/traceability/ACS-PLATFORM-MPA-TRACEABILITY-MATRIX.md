# ACS Platform — Multi-Person Authorization Traceability Matrix

**Status:** `HUMAN_GOVERNANCE_APPROVED_FUTURE_EVIDENCE_REQUIRED`

| Requirement                                       | Canonical authority                             | Future acceptance evidence                          | Status                              |
| ------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| `MPA-REQ-001` MPA placement                       | Baseline v5.3 §5.43                             | Approved subordinate architecture                   | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-002` policy and authority composition    | Authorization foundation                        | Policy composition/SoD proof                        | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-003` lifecycle/binding/expiry            | Governed MPA DoR                                | Transition and cross-scope denial tests             | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-004` consumption/concurrency/idempotency | Governed MPA DoR                                | Atomic/replay/stale-version proof                   | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-005` tenant/authorization/RLS            | Existing ACS tenant and authorization authority | Trusted-context/RLS proof                           | `REQUIRED_AT_DOD`                   |
| `MPA-REQ-006` audit/outbox/events                 | Existing ACS audit and Event Foundation         | Transactional audit/outbox proof                    | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-007` XCAP-005 consumer binding           | XCAP-005 approved policy package                | Export/override/destruction policy proof            | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-008` acceptance governance               | Governed MPA DoR/DoD                            | Approved matrix and reproducible evidence           | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-009` observability/privacy               | Governed MPA DoR                                | Bounded telemetry and security-anomaly proof        | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-010` scope/non-scope/dependencies        | Governed MPA DoR                                | Boundary and dependency-inversion review            | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |
| `MPA-REQ-011` future DoD evidence                 | Governed MPA DoD                                | Unit, integration, security and regression evidence | `APPROVED_FUTURE_EVIDENCE_REQUIRED` |

## Case-level acceptance traceability

| Acceptance case | Requirement   | Authority / policy          | Threat or control                 | Expected result                 | Implementation evidence |
| --------------- | ------------- | --------------------------- | --------------------------------- | ------------------------------- | ----------------------- |
| `MPA-POS-001`   | `MPA-REQ-003` | Registered MPA policy       | Valid request binding             | `REQUESTED`; auditable envelope | `REQUIRED_AT_DOD`       |
| `MPA-POS-002`   | `MPA-REQ-003` | Policy independence rules   | Partial approval has no authority | `PARTIALLY_APPROVED` only       | `REQUIRED_AT_DOD`       |
| `MPA-POS-003`   | `MPA-REQ-002` | Authority composition       | Required independent approvals    | Bound `APPROVED` state          | `REQUIRED_AT_DOD`       |
| `MPA-POS-004`   | `MPA-REQ-004` | Single-use policy           | Replay prevention                 | One side effect and `CONSUMED`  | `REQUIRED_AT_DOD`       |
| `MPA-POS-005`   | `MPA-REQ-004` | Idempotency policy          | Duplicate authority effect        | Original result only            | `REQUIRED_AT_DOD`       |
| `MPA-NEG-001`   | `MPA-REQ-002` | SoD policy                  | Self approval                     | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-002`   | `MPA-REQ-002` | Registered authority class  | Authority forgery                 | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-003`   | `MPA-REQ-005` | Trusted tenant context      | Cross-tenant use                  | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-004`   | `MPA-REQ-003` | Immutable operation binding | Cross-operation reuse             | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-005`   | `MPA-REQ-003` | Immutable target binding    | Cross-target reuse                | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-006`   | `MPA-REQ-003` | Terminal lifecycle          | Rejected use                      | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-007`   | `MPA-REQ-003` | Terminal lifecycle          | Revoked use                       | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-008`   | `MPA-REQ-003` | Authoritative expiry        | Expired use                       | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-009`   | `MPA-REQ-004` | Single-use consumption      | Replay                            | Denied                          | `REQUIRED_AT_DOD`       |
| `MPA-NEG-010`   | `MPA-REQ-004` | Atomic consume lock         | Concurrent consume                | One success only                | `REQUIRED_AT_DOD`       |
| `MPA-NEG-011`   | `MPA-REQ-004` | Expected-version guard      | Stale decision                    | Conflict/no advance             | `REQUIRED_AT_DOD`       |

All MPA acceptance cases have a requirement, authority/policy, control,
expected result and future evidence mapping. No row is implementation evidence.

`IMPLEMENTATION_EVIDENCE = NONE`
