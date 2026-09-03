# ACS-XCAP-005 — Evidence & Chain of Custody Traceability Matrix

**Status:** `READY_FOR_GOVERNANCE_REVIEW_NOT_IMPLEMENTATION_EVIDENCE`
**Capability:** `ACS-XCAP-005` — Evidence & Chain of Custody

This matrix links every DoR remediation requirement to canonical authority,
threat coverage, deterministic acceptance and future objective proof. The last
column is intentionally `REQUIRED_AT_DOD` until implementation is authorized
and objectively evidenced.

| Requirement                            | Authority / contract                                                                  | Threat coverage                                               | Acceptance cases                                              | Implementation evidence |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------- |
| `REQ-REM-001` ownership                | XCAP-005 evidence authority; security, retention and crypto governance                | Orphaned authority, policy bypass                             | `XCAP005-POS-001`, `XCAP005-NEG-013`                          | `REQUIRED_AT_DOD`       |
| `REQ-REM-002` identity/integrity       | Versioned evidence/content/provenance contract; approved crypto policy                | Content/metadata tamper, provenance forgery                   | `XCAP005-POS-002`, `XCAP005-NEG-004` to `006`, `021`          | `REQUIRED_AT_DOD`       |
| `REQ-REM-003` authorization/SoD        | AuthorizationPort; proposed evidence permission catalog                               | Unauthorized access/export/destruction, self-approval         | `XCAP005-POS-005` to `006`, `XCAP005-NEG-013` to `016`        | `REQUIRED_AT_DOD`       |
| `REQ-REM-004` connector trust          | Registered connector and tenant-bound ingestion contract                              | Untrusted/revoked/mismatched connector, malformed input       | `XCAP005-POS-010`, `XCAP005-NEG-007` to `012`                 | `REQUIRED_AT_DOD`       |
| `REQ-REM-005` events/data contracts    | Event Foundation, transactional outbox, versioned event contract                      | Event leakage, audit/outbox divergence                        | `XCAP005-POS-001`, `XCAP005-NEG-019`, `020`, `023`            | `REQUIRED_AT_DOD`       |
| `REQ-REM-005` atomicity                | Transactional evidence/custody/audit/outbox contract                                  | Partial governed transition                                   | `XCAP005-POS-001`, `XCAP005-NEG-019`, `020`                   | `REQUIRED_AT_DOD`       |
| `REQ-REM-005` idempotency/concurrency  | Tenant-scoped replay and expected-version contract                                    | Replay, duplicate side effects, stale write                   | `XCAP005-POS-009`, `XCAP005-NEG-009`, `010`, `017`, `018`     | `REQUIRED_AT_DOD`       |
| `REQ-REM-006` retention/privacy        | Policy-driven retention/hold/destruction/export contract                              | Hold bypass, sensitive-data exposure                          | `XCAP005-POS-007` to `008`, `XCAP005-NEG-014` to `016`, `023` | `REQUIRED_AT_DOD`       |
| `REQ-REM-007` transversal disposition  | Optional/future consumer boundaries for XCAP-003/006/007/009/010/011 and CYB-001      | Dependency inversion, AI raw-evidence mutation                | `XCAP005-POS-003`, `XCAP005-NEG-022`                          | `REQUIRED_AT_DOD`       |
| `REQ-REM-008` matrices                 | DoR sections 12.1 and 12.2                                                            | Coverage omission                                             | All `XCAP005-POS-*`; all `XCAP005-NEG-*`                      | `REQUIRED_AT_DOD`       |
| `REQ-REM-009` traceability             | This matrix plus DoR and DoD                                                          | Orphan requirement / unsupported claim                        | Matrix consistency review                                     | `REQUIRED_AT_DOD`       |
| `REQ-REM-010` objective completion     | Separate XCAP-005 DoD and approval gate                                               | Premature completion                                          | DoD approval and linked evidence review                       | `REQUIRED_AT_DOD`       |
| `REQ-REM-011` observability            | Bounded telemetry and governed SLO/alert contract                                     | Content/secret telemetry leakage, undetected failures         | `XCAP005-POS-001`, `XCAP005-NEG-023`                          | `REQUIRED_AT_DOD`       |
| `DECISION-001` crypto policy           | Initial Policy and Contract Registry                                                  | Ambiguous integrity calculation                               | `XCAP005-POS-002`, `XCAP005-NEG-004` to `006`                 | `REQUIRED_AT_DOD`       |
| `DECISION-002` data/event registration | Initial Policy and Contract Registry; Event Foundation                                | Unversioned contract or payload leakage                       | `XCAP005-POS-001`, `XCAP005-NEG-019`, `020`, `023`            | `REQUIRED_AT_DOD`       |
| `DECISION-003` ownership               | Initial Policy and Contract Registry                                                  | Unaccountable authority/policy bypass                         | Governance disposition evidence                               | `REQUIRED_AT_DOD`       |
| `DECISION-004` permission/role         | Initial Policy and Contract Registry; AuthorizationPort                               | Excess privilege/self-approval                                | `XCAP005-POS-005` to `006`, `XCAP005-NEG-013` to `016`        | `REQUIRED_AT_DOD`       |
| `DECISION-005` classification          | Initial Policy and Contract Registry                                                  | Sensitive-data misclassification/export                       | `XCAP005-POS-005` to `006`, `XCAP005-NEG-023`                 | `REQUIRED_AT_DOD`       |
| `DECISION-006` retention/hold          | Initial Policy and Contract Registry                                                  | Premature or hold-violating destruction                       | `XCAP005-POS-007` to `008`, `XCAP005-NEG-015` to `016`        | `REQUIRED_AT_DOD`       |
| `DECISION-007` export/destruction      | Initial Policy and Contract Registry                                                  | Unauthorized exfiltration or destruction                      | `XCAP005-POS-006`, `XCAP005-NEG-014` to `016`                 | `REQUIRED_AT_DOD`       |
| `MPA-DEPENDENCY` dual control          | Human-governance-approved [platform MPA DoR](../architecture/ACS-PLATFORM-MPA-DOR.md) | Self approval, approval replay and sensitive-operation bypass | Published MPA policy plus future linked MPA evidence          | `PUBLICATION_PENDING`   |
| Tenant/RLS baseline                    | Active membership, trusted context, RLS/FORCE RLS                                     | Tenant spoofing and cross-tenant access                       | `XCAP005-POS-005`, `XCAP005-NEG-001` to `003`                 | `REQUIRED_AT_DOD`       |
| Production readiness                   | DoD production-readiness contract                                                     | Backpressure, recovery and durability failure                 | Production validation plan                                    | `REQUIRED_AT_DOD`       |

`TRACEABILITY_COMPLETE = YES`
`IMPLEMENTATION_EVIDENCE = REQUIRED_AT_DOD`
`CYBERDEFENSE_IMPLEMENTATION = NONE`
