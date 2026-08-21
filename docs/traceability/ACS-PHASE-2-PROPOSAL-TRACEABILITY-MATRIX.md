# ACS Phase 2 — Proposal / Quotation Traceability Matrix

| Authority / decision      | DoR section                                                                             | Future implementation artifact                    | Future acceptance proof                                  | Status                           |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- | -------------------------------- |
| VOL-V 5.48; VOL-VI 6.4.2  | Proposal commercial entity                                                              | `commercial.proposals`, line and revision history | Migration/rollback/reapply; `db:validate`                | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition         | Tenant-scoped offer distinct from Opportunity and Contract                              | Aggregate/service/API/UI                          | Boundary/no-side-effect tests                            | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Baseline tenancy/security | Trusted context, AuthorizationPort, RLS/FORCE RLS                                       | Runtime role and policies                         | Tenant/BOLA/direct-DB negatives                          | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition         | Customer/Partner consistency; primary Opportunity Plan in Proposal lines                | Same-tenant relation validation                   | PRP-NEG-010–014, 040, 054–056                            | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition         | `NUMERIC(19,4)`, max input scale, HALF_UP line totals, ISO currency                     | Money value objects and server totals             | PRP-POS-016–017; PRP-NEG-018–021, 042–043                | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition         | Persisted expiry, explicit revision snapshots and no hard delete                        | Transition/revision service and API               | PRP-POS-008–025; PRP-NEG-022–025, 036, 039, 041, 044–051 | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Baseline API/event/audit  | Idempotency, concurrency, audit and outbox                                              | Command handlers/event producer                   | PRP-NEG-031–038; concurrency/atomicity matrix            | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition         | Approval, rejection, expiry, revision and assignment permissions; immutable creator SoD | Permission mapping and lifecycle state            | PRP-NEG-026–030, 046, 052–053, 057–059                   | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Baseline UX/quality       | Accessible real-data UI and quality gates                                               | Web screens/tests/CI evidence                     | 65 Web tests; dedicated Proposal workflow                | `LOCAL_IMPLEMENTATION_EVIDENCED` |

No individual `ACS-REQ` identifiers are invented. This DoR package is
implementation evidence is local only and does not authorize publication,
integration, release, production, or governance closure.
