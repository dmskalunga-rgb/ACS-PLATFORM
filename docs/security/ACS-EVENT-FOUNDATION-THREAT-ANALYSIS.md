# ACS Event Foundation Threat Analysis

Status: `IMPLEMENTED_PENDING_FINAL_CI`

| Threat                              | Mitigation                                                                                    | Evidence state   |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| Event forgery/schema confusion      | Canonical envelope validation, explicit semantic version, payload object/size constraints     | `VERIFIED_LOCAL` |
| Tenant spoofing/cross-tenant replay | Tenant/event composite constraints, FORCE RLS, server authorization, wrong-tenant denial      | `VERIFIED_LOCAL` |
| Duplicate delivery                  | At-least-once is explicit; atomic tenant/event/consumer receipts suppress repeated mutation   | `VERIFIED_LOCAL` |
| Lost event during concurrent claim  | `FOR UPDATE SKIP LOCKED`, claim token, finite lease, crash recovery                           | `VERIFIED_LOCAL` |
| Retry storm                         | Bounded exponential delay, maximum attempts, bounded batch/configuration                      | `VERIFIED_LOCAL` |
| DLQ abuse                           | Terminal state retained, direct mutation denied, controlled replay only                       | `VERIFIED_LOCAL` |
| Replay abuse                        | Step-up marker, AuthorizationPort, reason, tenant scope, audit, maximum replay count          | `VERIFIED_LOCAL` |
| Payload leakage                     | No payload logging/metric labels; payload classification and 256 KiB bound                    | `VERIFIED_LOCAL` |
| Consumer poisoning                  | Incompatible major versions rejected before handler; failure releases receipt safely          | `VERIFIED_LOCAL` |
| Cleanup race/data loss              | Cleanup only terminal published/processed rows in locked bounded batches                      | `VERIFIED_LOCAL` |
| Privilege escalation                | Separate execute-only publisher/consumer/operator/retention roles; no direct table privileges | `VERIFIED_LOCAL` |
| Correlation leakage                 | Correlation is carried for tracing/audit but prohibited as a metric label                     | `VERIFIED_LOCAL` |

Residual risks include real broker adapter security, broker IAM and tenancy, production assurance
mapping, approved retention durations, SLOs, named owners, and deployment-specific secret/network
controls. No risk is accepted by this document.
