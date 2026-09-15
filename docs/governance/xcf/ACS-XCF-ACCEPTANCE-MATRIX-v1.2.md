# ACS-XCF deterministic acceptance matrix v1.2

Status: `APPROVED_FUTURE_IMPLEMENTATION_GATE`

This matrix defines acceptance contracts for future XCF milestones. It is governance, not current
runtime evidence. Every case is `NOT_EXECUTED` until the milestone is separately authorized and
implemented.

## Execution contract

Every case requires a clean disposable environment, real PostgreSQL where persistence is involved,
server-issued tenant context, the canonical `AuthorizationPort`, canonical MPA for protected
operations, XCAP-005 evidence references, Event Foundation envelopes, transactional audit/outbox,
and production code paths. Mocks may isolate unavailable external networks only at a governed
adapter boundary; they cannot replace PostgreSQL, RLS, authorization, evidence, audit, outbox, or
the behavior under acceptance. The evidence bundle must include input identity/hash, operation,
response, persisted rows, RLS result, authorization/MPA decision, emitted events, audit entries,
evidence references, environment identity, and negative/failure companions.

| ID           | Requirements      | Preconditions and real dependencies                            | Input and operation                                    | Expected response and persisted state                         | Security/event/evidence proof                                 | Companion       | Milestone | Result       |
| ------------ | ----------------- | -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------- | --------------- | --------- | ------------ |
| `XCF-AC-001` | REQ-001, 002, 012 | Frozen catalog; trusted source record; PostgreSQL              | Ingest signed framework release                        | Accepted version; immutable source/release rows               | Tenant/global authority, integrity, audit and outbox verified | NEG-007; FI-002 | M1        | NOT_EXECUTED |
| `XCF-AC-002` | REQ-003, 013, 014 | Active source and parser contract                              | Re-ingest identical release/idempotency key            | Same receipt; no duplicate facts or events                    | Replay proof and source provenance preserved                  | NEG-020; FI-006 | M1        | NOT_EXECUTED |
| `XCF-AC-003` | REQ-015, 016, 017 | Two approved framework versions                                | Activate newer version                                 | Exactly one active version; prior version retained            | MPA decision, audit and activation event atomic               | NEG-008; FI-009 | M1        | NOT_EXECUTED |
| `XCF-AC-004` | REQ-018, 019, 020 | Canonical source facts and mapping vocabulary                  | Create governed cross-framework mapping                | Versioned mapping with confidence/provenance                  | Authorization, evidence references and audit verified         | NEG-012; FI-010 | M2        | NOT_EXECUTED |
| `XCF-AC-005` | REQ-021, 022, 023 | Existing mapping version                                       | Supersede mapping after source update                  | New version active; old version immutable                     | No stale substitution; outbox/audit atomic                    | NEG-011; FI-003 | M2        | NOT_EXECUTED |
| `XCF-AC-006` | REQ-024, 025, 026 | Tenant overlay enabled by policy                               | Add tenant overlay to global mapping                   | Tenant overlay stored without mutating global truth           | FORCE RLS and cross-tenant denial proved                      | NEG-001; FI-001 | M2        | NOT_EXECUTED |
| `XCF-AC-007` | REQ-027, 028, 029 | Governed relational graph projection                           | Add nodes/edges from canonical mapping                 | Versioned relational projection created                       | Provenance traverses to source and mapping                    | NEG-013; FI-017 | M3        | NOT_EXECUTED |
| `XCF-AC-008` | REQ-030, 031, 032 | Authorized tenant graph query                                  | Traverse bounded relationship path                     | Bounded result with no foreign-tenant nodes                   | RLS, authorization and redacted telemetry verified            | NEG-014; FI-017 | M3        | NOT_EXECUTED |
| `XCF-AC-009` | REQ-033, 034, 035 | XCAP-005 and integrated XCAP-011 M0                            | Submit canonical references to Fusion                  | Deterministic fused result references, never copies, evidence | XCAP-005 custody and XCAP-011 provenance retained             | NEG-015; FI-013 | M5        | NOT_EXECUTED |
| `XCF-AC-010` | REQ-036, 037, 038 | AI Gateway policy and separately authorized model mode         | Request cognitive enrichment                           | Bounded derived assertion, not domain truth                   | Provider identity, prompt/context policy and DecisionEvidence | NEG-016; FI-016 | M6        | NOT_EXECUTED |
| `XCF-AC-011` | REQ-039, 040, 041 | Authorized recommendation consumer                             | Produce containment recommendation                     | Recommendation only; no action executed                       | AuthorizationPort and MPA remain mandatory                    | NEG-005; FI-015 | M7        | NOT_EXECUTED |
| `XCF-AC-012` | REQ-042, 043, 044 | Approved response operation and independent humans             | Execute protected response after MPA                   | Operation executes once after valid approvals                 | Physical-human attestation, audit, evidence and event         | NEG-006; FI-015 | M7        | NOT_EXECUTED |
| `XCF-AC-013` | REQ-045, 046, 047 | Recovery outcome and source lineage                            | Record outcome and learning proposal                   | Versioned proposal; no automatic policy mutation              | Evidence/custody and approval boundary preserved              | NEG-018; FI-018 | M8        | NOT_EXECUTED |
| `XCF-AC-014` | REQ-048–066       | Full authorized XCF stack in production-equivalent environment | Run tenant-isolation, restore, load and failover suite | Bounded SLO evidence with zero unauthorized disclosure        | RLS/FORCE RLS, audit, outbox, SBOM/SCA and recovery evidence  | All NEG/FI      | M8        | NOT_EXECUTED |

## Gate

`CURRENT_EXECUTED_CASES = 0`

`CURRENT_PASS_CLAIM = NONE`

`RUNTIME_IMPLEMENTATION_AUTHORIZED = NO`
