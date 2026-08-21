# ACS Phase 2 — Opportunity Registry Threat Analysis

## Boundary

Tenant-scoped, non-financial pipeline registry. Tenant authority comes only from trusted server-side context. No contact PII, credentials, financial values or downstream commercial execution is in scope.

## Required mitigations

| Threat                  | Implemented control                                                                   | Local evidence                   |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| Tenant injection / BOLA | AuthorizationPort, trusted context, RLS/FORCE RLS and same-tenant reference checks    | `OPP-NEG` matrix pass            |
| Mass assignment         | strict create/PATCH allowlists; reject tenant, identifiers and unknown fields         | `OPP-NEG` matrix pass            |
| Stale/lost update       | version-bound PATCH and `409` conflict                                                | Opportunity E2E pass             |
| Idempotency abuse       | canonical operation store; replay only for identical request; divergent payload `409` | Opportunity E2E pass             |
| Terminal-state mutation | explicit transition matrix; deny WON/LOST mutation/reopen                             | Opportunity E2E pass             |
| Reference leakage       | fail closed without cross-tenant existence disclosure                                 | relationship-negative cases pass |
| Audit/event leakage     | minimal redacted payloads; no tokens, PII or financial data                           | audit/event assertions pass      |
| DB bypass               | least-privilege role, no SUPERUSER/BYPASSRLS, direct escape test                      | database validator and E2E pass  |

The local acceptance matrix executed all 35 human-authorized negative cases and the final local
database validator verified Opportunity RLS and FORCE RLS. This does not assert remote CI,
production assurance, retention approval, broker selection, or formal SLOs.
