# ACS Phase 2 — Contract Threat Analysis

| Threat                                     | Required control                                                            | Acceptance evidence                |
| ------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------- |
| Contract from forged/non-accepted Proposal | Server-side accepted-source validation and unique current-source invariant  | CTR-NEG-004                        |
| Cross-tenant substitution or BOLA/IDOR     | AuthorizationPort, trusted context, RLS/FORCE RLS and non-disclosing errors | CTR-NEG-003, 005, 010              |
| Commercial snapshot/total tampering        | Server-derived immutable source snapshots and `NUMERIC(19,4)` validation    | CTR-POS-003; CTR-NEG-003, 006      |
| SoD or assignment escalation               | Immutable creator, distinct approver and limited reassignment               | CTR-POS-006, 010; CTR-NEG-008      |
| Lifecycle or terminal-state bypass         | Explicit transition allowlist and expected-version guard                    | CTR-NEG-007, 009                   |
| Duplicate Contract or replay race          | Database/application uniqueness, tenant-scoped idempotency and transactions | CTR-POS-012; CTR-NEG-004, 009, 012 |
| Partial state after failure                | Atomic aggregate, snapshots, audit, outbox and idempotency                  | CTR-NEG-012                        |
| Audit/event data exposure                  | Minimal redacted metadata; no PII, secrets, full snapshots or price lines   | CTR-NEG-011                        |
| Privileged database bypass                 | Least-privilege role; no `SUPERUSER` or `BYPASSRLS`                         | CTR-NEG-010                        |
| Unauthorized downstream effect             | Explicit side-effect-free activation boundary                               | CTR-NEG-013                        |

The Web UI consumes the real Contract endpoint shapes, preserves server authority for tenant, totals, lifecycle, expected version and SoD, and presents bounded 400/401/403/404/409/5xx states. It does not expose unauthorised lifecycle actions or fabricate audit/history data.

Production assurance mappings, retention periods and named security owners remain governance decisions; they are not weakened by this local implementation evidence.
