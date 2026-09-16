# ACS Cross-Framework Cyber Defense Control Plane

## Governance and Engineering Package v1.2

```text
PROGRAM = Angola Cyber Shield
CAPABILITY = ACS-XCF-CP-001
CLASSIFICATION = TRANSVERSAL_ENTERPRISE_CYBERDEFENSE_FOUNDATION
STATUS = GOVERNANCE_QUALIFIED_FOR_CANONICAL_PUBLICATION
RUNTIME_IMPLEMENTATION = NONE
IMPLEMENTATION_AUTHORITY = NOT_GRANTED
```

## 1. Authority and purpose

This package is subordinate to the ACS Master Engineering Specification v5.3, the frozen
Cyberdefense Architectural Delta, accepted ACS ADRs, and canonically integrated platform
foundations. It creates no independent identity, authorization, evidence, event, audit, AI, tenant,
graph, data-lake, incident, or operational-response authority.

XCF provides a governed control and knowledge plane connecting external frameworks, vulnerability
and threat knowledge, defensive mappings, canonical ACS context, evidence, Fusion and authorized
response. Its decision chain is:

```text
validated external knowledge
→ versioned Framework Registry
→ governed mappings and knowledge relations
→ tenant-safe context
→ XCAP-011 Cognitive Fusion
→ explainable recommendation
→ AuthorizationPort / MPA where required
→ canonical execution owner
→ XCAP-005 DecisionEvidence derivation
→ outcome and controlled learning proposal
```

## 2. Scope and non-scope

Governed scope includes Framework Registry, source trust, mapping integrity, a PostgreSQL-first
knowledge representation, global/tenant separation, DecisionEvidence governance, XCAP-011 reuse,
authorization/event/permission catalogs, acceptance, negative security, failure injection, and the
canonical engineering lifecycle.

This package does not authorize schemas, migrations, APIs, feed ingestion, graph runtime, mapping
engine, AI-provider execution, response automation, deployment or production activation.

## 3. Canonical architectural invariants

1. External material is untrusted until validated against an approved source policy.
2. A framework release is immutable in meaning; supersession never destroys historical knowledge.
3. Deterministic and authoritative mappings take precedence over inferred mappings.
4. Global knowledge contains no private tenant evidence or tenant-derived truth by default.
5. Tenant knowledge cannot be promoted globally without governed independent review.
6. XCF recommendation is not authorization or execution.
7. Protected action uses `AuthorizationPort`; dual-control uses canonical MPA.
8. XCF references XCAP-005 evidence and never creates a parallel evidence store.
9. XCF uses the Event Foundation, canonical audit and transactional outbox.
10. XCF uses XCAP-011 contracts and cannot create a parallel Fusion authority.
11. AI communicates only through the AI Gateway boundary and remains advisory.
12. Missing tenant, authorization, provenance, integrity or evidence fails closed.

## 4. Foundation reuse

| Foundation                                   | Canonical disposition                         |
| -------------------------------------------- | --------------------------------------------- |
| Identity, ACTIVE membership, trusted context | `DIRECT_REUSE`                                |
| RLS/FORCE RLS                                | `DIRECT_REUSE`                                |
| AuthorizationPort                            | `DIRECT_REUSE`                                |
| MPA                                          | `DIRECT_REUSE`                                |
| Event Foundation, audit, outbox              | `DIRECT_REUSE_WITH_XCF_CONTRACTS`             |
| XCAP-005 Evidence and Chain of Custody       | `DIRECT_REUSE`                                |
| XCAP-011 Cognitive Fusion M0                 | `DIRECT_REUSE_WITH_VERSIONED_EXTENSION`       |
| AI Gateway                                   | `ADAPTER_REQUIRED_FOR_FUTURE_MODEL_EXECUTION` |
| Observability                                | `DIRECT_REUSE_WITH_BOUNDED_XCF_METRICS`       |
| PostgreSQL                                   | `INITIAL_CANONICAL_PERSISTENCE`               |

## 5. Roadmap decision

Governance canonicalization is `XCF-G0`. It is not a runtime milestone.

| Milestone | Scope                                                                 | Dependency gate                                    |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `XCF-M1`  | Framework Registry, source trust and release/version lifecycle        | G0 canonical and separate implementation authority |
| `XCF-M2`  | Mapping runtime, tenant overlays, CVE/CWE/CVSS/KEV and prioritization | M1                                                 |
| `XCF-M3`  | ATT&CK adversary intelligence and relational graph projection         | M1 and M2                                          |
| `XCF-M4`  | D3FEND/control/capability mapping                                     | M1 and M3                                          |
| `XCF-M5`  | Knowledge relations and XCAP-011 enrichment                           | M1–M4 and graph benchmark                          |
| `XCF-M6`  | Cognitive decision support through AI Gateway                         | M5 and trusted-provider authorization              |
| `XCF-M7`  | Authorized response composition                                       | M6, AuthorizationPort, MPA and operation owner     |
| `XCF-M8`  | Recovery and controlled learning proposals                            | M7                                                 |

No milestone transition grants the next milestone automatically.

## 6. PostgreSQL-first decision

Initial graph persistence SHALL use a PostgreSQL relational node/edge representation, temporal
validity, indexes, constraints and JSONB only where justified. Recursive queries require benchmark,
load, tenant-isolation and recovery evidence. A different graph technology requires a separate ADR,
comparative benchmark and human approval.

## 7. Governance references

The normative detail is in the documents indexed by `README.md`, the sixty-six requirements and
individual RTM, standalone `ADR-XCF-001` through `ADR-XCF-012`, threat model, source-trust policy,
data/mapping/graph rules, authority/evidence/event rules and acceptance matrices.

### 7.1 ADR disposition register

| ADR           | Topic                                 | Disposition                |
| ------------- | ------------------------------------- | -------------------------- |
| `ADR-XCF-001` | Canonical transversal control plane   | `APPROVED`                 |
| `ADR-XCF-002` | Global and tenant-scoped governance   | `APPROVED`                 |
| `ADR-XCF-003` | Source trust, release and activation  | `APPROVED`                 |
| `ADR-XCF-004` | PostgreSQL-first graph projection     | `APPROVED_WITH_REFINEMENT` |
| `ADR-XCF-005` | AuthorizationPort and MPA reuse       | `APPROVED`                 |
| `ADR-XCF-006` | Evidence custody and DecisionEvidence | `APPROVED`                 |
| `ADR-XCF-007` | Event, audit and transaction boundary | `APPROVED`                 |
| `ADR-XCF-008` | AI Gateway and derived intelligence   | `APPROVED`                 |
| `ADR-XCF-009` | Framework mapping authority           | `APPROVED`                 |
| `ADR-XCF-010` | Idempotency, concurrency and replay   | `APPROVED`                 |
| `ADR-XCF-011` | DecisionEvidence contract             | `APPROVED_WITH_REFINEMENT` |
| `ADR-XCF-012` | Maturity and publication gates        | `APPROVED`                 |

The ADR-XCF-002 refinement is closed by the frozen M1 authority, scope and MPA catalog. Remaining
refinements apply only before the milestone that first persists the affected graph or
DecisionEvidence contract.

## 8. Canonical engineering lifecycle

```text
Authority / DoR
→ Implementation
→ Focused Tests
→ Integration
→ Real PostgreSQL
→ RLS / Tenant Isolation
→ Authorization
→ Real E2E
→ Concurrency
→ Atomicity
→ Failure Injection
→ Security / Adversarial
→ Acceptance Matrix
→ Cross-Capability Regression
→ Static Gates
→ Evidence / Traceability
→ DoD
→ Publication
→ Remote CI
→ Merge
→ Post-Merge
→ Human Authorization for Next Capability
```

Every capability-specific DoR SHALL classify each gate as `MANDATORY`, `CONDITIONAL`, or
`NOT_APPLICABLE_WITH_JUSTIFICATION`. No phase transition authorizes another phase.

## 9. No-mock and real-data policy

Deterministic fixtures/test doubles are permitted for unit, parser and pure-contract tests. Claims
about PostgreSQL, RLS, FORCE RLS, tenant isolation, transactions, concurrency, atomicity,
authorization integration, E2E or acceptance require real qualified infrastructure. Provider
qualification requires separately authorized trusted-provider execution.

## 10. Governance DoR and DoD

Governance DoR requires frozen upstream authority, clean isolated custody, identified owners,
document precedence and no runtime mutation. Governance DoD requires a self-contained package,
resolved roadmap, sixty-six individually traced requirements, twelve explicit ADR dispositions,
traceable threat model, source trust, data/mapping/graph rules, deterministic acceptance, negative
and FI matrices, no-mock policy, lifecycle, status reconciliation and successful repository/remote
qualification.

```text
GOVERNANCE_DOD = SATISFIED
GOVERNANCE_CONSISTENCY = PASS
XCF_RUNTIME_IMPLEMENTATION = NONE
NEXT_IMPLEMENTATION_AUTHORITY = NOT_GRANTED
```
