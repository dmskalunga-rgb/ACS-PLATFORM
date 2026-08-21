# ACS Phase 2 — Proposal / Quotation Traceability Matrix

| Authority / decision      | DoR section                                                                             | Future implementation artifact                    | Future acceptance proof                                  | Status                   |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- | ------------------------ |
| VOL-V 5.48; VOL-VI 6.4.2  | Proposal commercial entity                                                              | `commercial.proposals`, line and revision history | Migration/rollback/reapply                               | `PENDING_REQUIREMENT_ID` |
| Human disposition         | Tenant-scoped offer distinct from Opportunity and Contract                              | Aggregate/service/API/UI                          | Boundary/no-side-effect tests                            | `PENDING_IMPLEMENTATION` |
| Baseline tenancy/security | Trusted context, AuthorizationPort, RLS/FORCE RLS                                       | Runtime role and policies                         | Tenant/BOLA/direct-DB negatives                          | `PENDING_IMPLEMENTATION` |
| Human disposition         | Customer/Partner consistency; primary Opportunity Plan in Proposal lines                | Same-tenant relation validation                   | PRP-NEG-010–014, 040, 054–056                            | `PENDING_IMPLEMENTATION` |
| Human disposition         | `NUMERIC(19,4)`, max input scale, HALF_UP line totals, ISO currency                     | Money value objects and server totals             | PRP-POS-016–017; PRP-NEG-018–021, 042–043                | `PENDING_IMPLEMENTATION` |
| Human disposition         | Persisted expiry, explicit revision snapshots and no hard delete                        | Transition/revision service and API               | PRP-POS-008–025; PRP-NEG-022–025, 036, 039, 041, 044–051 | `PENDING_IMPLEMENTATION` |
| Baseline API/event/audit  | Idempotency, concurrency, audit and outbox                                              | Command handlers/event producer                   | PRP-NEG-031–038; concurrency/atomicity matrix            | `PENDING_IMPLEMENTATION` |
| Human disposition         | Approval, rejection, expiry, revision and assignment permissions; immutable creator SoD | Permission mapping and lifecycle state            | PRP-NEG-026–030, 046, 052–053, 057–059                   | `PENDING_IMPLEMENTATION` |
| Baseline UX/quality       | Accessible real-data UI and quality gates                                               | Web screens/tests/CI evidence                     | UI, accessibility and QG evidence                        | `PENDING_REQUIREMENT_ID` |

No individual `ACS-REQ` identifiers are invented. This DoR package is
implementation preparation, not implementation evidence or authorization.
