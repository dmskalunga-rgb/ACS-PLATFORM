# ACS Phase 2 — Opportunity Registry Traceability Matrix

| Authority                      | Frozen requirement                                         | Executable proof                                      | Status                       |
| ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| VOL-V 5.48; VOL-VI 6.4.2       | Commercial Opportunity entity                              | ADR-0019, DoR, local evidence                         | `LOCAL_VALIDATION_EVIDENCED` |
| Baseline tenancy/security      | Trusted context, AuthorizationPort, RLS/FORCE RLS          | migration/rollback, runtime role and cross-tenant E2E | `LOCAL_VALIDATION_EVIDENCED` |
| Human disposition              | Optional same-tenant Customer/Lead/Partner/Plan references | relationship-negative matrix                          | `LOCAL_VALIDATION_EVIDENCED` |
| Human disposition              | Exact pipeline/terminal/no-delete lifecycle                | transition E2E and API contract                       | `LOCAL_VALIDATION_EVIDENCED` |
| Baseline API/event/audit rules | idempotency, concurrency, audit and outbox                 | API/E2E/audit/event evidence                          | `LOCAL_VALIDATION_EVIDENCED` |
| Human disposition              | Non-financial/PII-free boundary                            | strict allowlist and `OPP-NEG-001..035`               | `LOCAL_VALIDATION_EVIDENCED` |

ADR-0019 remains `PROPOSED`; this matrix records local evidence and is not remote-CI or
governance approval.
