# ACS Phase 2 — Opportunity Registry Traceability Matrix

| Authority                      | Frozen requirement                                         | Planned proof                           | Status                     |
| ------------------------------ | ---------------------------------------------------------- | --------------------------------------- | -------------------------- |
| VOL-V 5.48; VOL-VI 6.4.2       | Commercial Opportunity entity                              | ADR-0019 and DoR boundary               | `GOVERNANCE_DISPOSITIONED` |
| Baseline tenancy/security      | Trusted context, AuthorizationPort, RLS/FORCE RLS          | migration, role and cross-tenant E2E    | `PLANNED`                  |
| Human disposition              | Optional same-tenant Customer/Lead/Partner/Plan references | relationship-negative matrix            | `PLANNED`                  |
| Human disposition              | Exact pipeline/terminal/no-delete lifecycle                | transition E2E and API contract         | `PLANNED`                  |
| Baseline API/event/audit rules | idempotency, concurrency, audit and outbox                 | API/E2E/audit/event evidence            | `PLANNED`                  |
| Human disposition              | Non-financial/PII-free boundary                            | allowlist and leakage-negative evidence | `PLANNED`                  |

ADR-0019 remains `PROPOSED`; this matrix is not implementation authorization.
