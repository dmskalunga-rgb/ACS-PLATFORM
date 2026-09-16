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

| ID           | Requirements           | Preconditions and real dependencies                            | Input and operation                                    | Expected response and persisted state                         | Security/event/evidence proof                                 | Companion                               | Milestone       | Result       |
| ------------ | ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------- | --------------- | ------------ |
| `XCF-AC-001` | REQ-001, 002, 058      | Frozen catalog; trusted source record; PostgreSQL              | Ingest signed framework release                        | Accepted non-active version; immutable source/release rows    | Global authority, integrity, audit and outbox verified        | NEG-007,010,022; FI-002,005             | M1              | NOT_EXECUTED |
| `XCF-AC-002` | REQ-001–004            | Active source and parser contract                              | Re-ingest identical release/idempotency key            | Same receipt; no duplicate facts or events                    | Replay proof and source provenance preserved                  | NEG-020; FI-003,004,006                 | M1              | NOT_EXECUTED |
| `XCF-AC-003` | REQ-001, 003, 004      | Two approved framework versions; canonical MPA                 | Activate newer version                                 | Exactly one active version; prior version retained            | MPA decision, audit and activation event atomic               | NEG-008,011,013; FI-009,011,012,014,015 | M1              | NOT_EXECUTED |
| `XCF-AC-004` | REQ-005–010            | Canonical source facts and mapping vocabulary                  | Create governed cross-framework mapping                | Versioned mapping with confidence/provenance                  | Authorization, evidence references and audit verified         | NEG-012; FI-010                         | M2              | NOT_EXECUTED |
| `XCF-AC-005` | REQ-003, 005–010       | Existing mapping version                                       | Supersede mapping after source update                  | New version active; old version immutable                     | No stale substitution; outbox/audit atomic                    | NEG-011,013; FI-003,010                 | M2              | NOT_EXECUTED |
| `XCF-AC-006` | REQ-014, 048, 052, 064 | Tenant overlay enabled by policy                               | Add tenant overlay to global mapping                   | Tenant overlay stored without mutating global truth           | FORCE RLS and cross-tenant denial proved                      | NEG-001–006,009,021; FI-001,014,015     | M2              | NOT_EXECUTED |
| `XCF-AC-007` | REQ-011–013            | Governed relational graph projection                           | Add nodes/edges from canonical mapping                 | Versioned relational projection created                       | Provenance traverses to source and mapping                    | NEG-013; FI-017                         | M3              | NOT_EXECUTED |
| `XCF-AC-008` | REQ-014, 050–052       | Authorized tenant graph query                                  | Traverse bounded relationship path                     | Bounded result with no foreign-tenant nodes                   | RLS, authorization and redacted telemetry verified            | NEG-001–005,014; FI-001,014,017         | M3              | NOT_EXECUTED |
| `XCF-AC-009` | REQ-027–030, 044–047   | XCAP-005 and integrated XCAP-011 M0                            | Submit canonical references to Fusion                  | Deterministic fused result references, never copies, evidence | XCAP-005 custody and XCAP-011 provenance retained             | NEG-015,018; FI-013                     | M5              | NOT_EXECUTED |
| `XCF-AC-010` | REQ-031–036            | AI Gateway policy and separately authorized model mode         | Request cognitive enrichment                           | Bounded derived assertion, not domain truth                   | Provider identity, prompt/context policy and DecisionEvidence | NEG-016–018; FI-016                     | M6              | NOT_EXECUTED |
| `XCF-AC-011` | REQ-036–040            | Authorized recommendation consumer                             | Produce containment recommendation                     | Recommendation only; no action executed                       | AuthorizationPort remains mandatory                           | NEG-005,019; FI-014                     | M7              | NOT_EXECUTED |
| `XCF-AC-012` | REQ-041–047            | Approved response operation and independent humans             | Execute protected response after MPA                   | Operation executes once after valid approvals                 | Physical-human attestation, audit, evidence and event         | NEG-006,015,019; FI-011–015             | M7              | NOT_EXECUTED |
| `XCF-AC-013` | REQ-053–057            | Recovery outcome and source lineage                            | Record outcome and learning proposal                   | Versioned proposal; no automatic policy mutation              | Evidence/custody and approval boundary preserved              | NEG-006,009,018; FI-018                 | M8              | NOT_EXECUTED |
| `XCF-AC-014` | REQ-048–052, 058–066   | Full authorized XCF stack in production-equivalent environment | Run tenant-isolation, restore, load and failover suite | Bounded SLO evidence with zero unauthorized disclosure        | RLS/FORCE RLS, audit, outbox, SBOM/SCA and recovery evidence  | All applicable NEG/FI                   | CROSS_MILESTONE | NOT_EXECUTED |
| `XCF-AC-015` | REQ-015–018            | Approved CVE/CWE/CVSS/KEV release and prioritization policy    | Ingest release-bound vulnerability knowledge           | Versioned facts and bounded multi-factor priority context     | Source, release, integrity and absence/provenance verified    | NEG-007,010,011,013; FI-002,005–007     | M2              | NOT_EXECUTED |
| `XCF-AC-016` | REQ-019–023            | Approved ATT&CK release and assertion vocabulary               | Ingest tactics, techniques and governed assertions     | Versioned hierarchy and assertion state retained              | Source and release provenance; no fabricated technique        | NEG-007,011,013; FI-005–007             | M3              | NOT_EXECUTED |
| `XCF-AC-017` | REQ-024–026            | Approved defensive vocabulary and capability references        | Map defensive techniques to ACS capabilities           | Versioned relation; capability never grants authority         | Mapping approval and AuthorizationPort boundary verified      | NEG-005,012; FI-010,014                 | M4              | NOT_EXECUTED |

## Gate

`CURRENT_EXECUTED_CASES = 0`

`CURRENT_PASS_CLAIM = NONE`

`RUNTIME_IMPLEMENTATION_AUTHORIZED = NO`
