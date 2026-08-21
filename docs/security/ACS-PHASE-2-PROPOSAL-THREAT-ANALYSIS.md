# ACS Phase 2 — Proposal / Quotation Threat Analysis

Status: `LOCAL_IMPLEMENTATION_EVIDENCED / NOT_PRODUCTION_APPROVED`

| Threat                                          | Required control                                                                                      | Future proof                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Tenant escape, BOLA and foreign references      | Trusted context, AuthorizationPort, same-tenant validation, RLS/FORCE RLS and non-disclosing `404`    | PRP-NEG-006, 010–016, 033–035, 040 |
| Mass assignment / server-field mutation         | Per-command allowlists; reject tenant, totals, status, revision and audit fields                      | PRP-NEG-007–009, 021               |
| Price, currency, quantity or total manipulation | `NUMERIC(19,4)`, max-scale validation, HALF_UP line totals, ISO validation and server totals          | PRP-NEG-018–021, 042–043           |
| Approval or SoD bypass                          | Explicit action permissions, immutable creator identity, reassignment constraints and no admin bypass | PRP-NEG-026–030, 053, 057–059      |
| Lifecycle, expiry or revision bypass            | Explicit transitions, time-guarded persisted expiry, immutable snapshots and revision command         | PRP-NEG-022–025, 039, 041, 044–052 |
| Stale update / idempotency conflict             | Aggregate expected version and canonical idempotency store                                            | PRP-NEG-031–033                    |
| Audit or event leakage                          | Append-only redacted audit and minimal event payloads                                                 | PRP-NEG-037–038                    |
| Privilege escalation / RLS bypass               | Least-privilege runtime role; no SUPERUSER/BYPASSRLS                                                  | PRP-NEG-034–035                    |
| Commercial data exposure                        | `CONFIDENTIAL_COMMERCIAL` classification; no PII/free text in events/logs                             | Redaction and API-contract tests   |
| Relationship substitution                       | Customer/Partner match parent Opportunity; primary Opportunity Plan must appear in lines              | PRP-NEG-054–056                    |

The listed controls are implemented and locally tested by the Proposal E2E
matrix. This evidence does not approve retention, production identity/broker
configuration, formal SLOs, named owners, or production deployment.
