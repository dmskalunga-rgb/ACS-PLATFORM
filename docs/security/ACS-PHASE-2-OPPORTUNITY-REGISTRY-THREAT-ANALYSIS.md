# ACS Phase 2 — Opportunity Registry Threat Analysis

## Boundary

Tenant-scoped, non-financial pipeline registry. Tenant authority comes only from trusted server-side context. No contact PII, credentials, financial values or downstream commercial execution is in scope.

## Required mitigations

| Threat                  | Required control                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Tenant injection / BOLA | AuthorizationPort, trusted context, RLS/FORCE RLS and same-tenant reference checks    |
| Mass assignment         | strict create/PATCH allowlists; reject tenant, identifiers and unknown fields         |
| Stale/lost update       | version-bound PATCH and `409` conflict                                                |
| Idempotency abuse       | canonical operation store; replay only for identical request; divergent payload `409` |
| Terminal-state mutation | explicit transition matrix; deny WON/LOST mutation/reopen                             |
| Reference leakage       | fail closed without cross-tenant existence disclosure                                 |
| Audit/event leakage     | minimal redacted payloads; no tokens, PII or financial data                           |
| DB bypass               | least-privilege role, no SUPERUSER/BYPASSRLS, direct escape test                      |

The future acceptance matrix must include all 35 human-authorized negative cases, plus any additional identified case.
