# ACS-XCF threat model v1.2

Trust boundaries: `TB-01 External Source`, `TB-02 Ingestion`, `TB-03 Global Knowledge`, `TB-04
Tenant Overlay`, `TB-05 Mapping`, `TB-06 Graph Traversal`, `TB-07 Fusion/AI`, `TB-08
Authorization/MPA`, `TB-09 Evidence/Event/Audit`, and `TB-10 Operations/Recovery`.

All negative/FI evidence is future work: `TEST_RESULT=NOT_EXECUTED`.

| Threat                                        | Boundary / asset / impact                          | Required mitigation                                | Negative / FI / evidence                | Residual risk                 |
| --------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | --------------------------------------- | ----------------------------- |
| TM-01 Poisoned framework feed                 | TB-01; releases; false knowledge                   | allowlisted publisher, integrity and quarantine    | NEG-006 / FI-005 / source verification  | publisher compromise          |
| TM-02 Version substitution                    | TB-01/03; history; irreproducibility               | immutable release identity and supersession        | NEG-009 / FI-009 / lineage              | upstream ambiguity            |
| TM-03 False mapping                           | TB-05; mappings; wrong control relation            | precedence, approval and provenance                | NEG-011 / FI-010 / mapping audit        | curator error                 |
| TM-04 Graph poisoning                         | TB-03/05; graph; contaminated reasoning            | authorized writes, constraints, provenance         | NEG-012 / FI-010 / relation history     | approved bad data             |
| TM-05 Cross-tenant graph leakage              | TB-04/06; tenant graph; disclosure                 | trusted context, RLS/FORCE RLS, bounded traversal  | NEG-003 / FI-001 / RLS evidence         | side channel                  |
| TM-06 Priority manipulation                   | TB-03; vulnerability context; misprioritization    | multi-factor, versioned rationale                  | NEG-013 / FI-016 / DecisionEvidence     | bad source inputs             |
| TM-07 ATT&CK hallucination                    | TB-05/07; technique refs; false claim              | registry resolution and assertion class            | NEG-014 / FI-016 / result provenance    | novel behavior                |
| TM-08 Defensive misapplication                | TB-05/08; response; unsafe advice                  | authoritative mappings and AuthorizationPort       | NEG-015 / FI-014 / denial audit         | human misuse                  |
| TM-09 Fusion contamination                    | TB-06/07; fused context; false result              | XCAP-011 provenance and fail closed                | NEG-016 / FI-013 / Fusion receipt       | correlated bad data           |
| TM-10 Cognitive hallucination                 | TB-07; hypotheses; false confidence                | evidence refs, UNKNOWN, explanation                | NEG-017 / FI-016 / result contract      | model limitations             |
| TM-11 Prompt/context injection                | TB-01/07; model context; instruction takeover      | untrusted-content policy and AI Gateway            | NEG-018 / FI-016 / content decision     | novel injection               |
| TM-12 Authorization bypass                    | TB-08; protected action; unauthorized effect       | AuthorizationPort and MPA                          | NEG-004 / FI-014 / no-effect evidence   | owner defect                  |
| TM-13 Evidence tampering                      | TB-09; DecisionEvidence; lost integrity            | XCAP-005 hash, derivation and custody              | NEG-015 / FI-013 / verification         | crypto compromise             |
| TM-14 Tenant-context confusion                | TB-04/08; authority; cross-tenant access           | server context and membership                      | NEG-002 / FI-001 / isolation proof      | identity compromise           |
| TM-15 Autonomous governance drift             | TB-07/10; policy; uncontrolled mutation            | proposal-only learning                             | NEG-020 / FI-015 / no-mutation evidence | social approval failure       |
| TM-16 Observability blind spot                | TB-09/10; operations; undetected failure           | bounded metrics, traces and audit                  | NEG-021 / FI-011 / telemetry            | telemetry outage              |
| TM-17 Fail-open degradation                   | all; protected effects; unsafe execution           | closed failure catalog and rollback                | NEG-004 / FI-014 / no effect            | unknown dependency            |
| TM-18 Publisher/signing-key compromise        | TB-01; source authority; trusted malicious release | key rotation, revocation, multi-signal validation  | NEG-022 / FI-005 / key lineage          | undetected compromise         |
| TM-19 Feed supply-chain takeover              | TB-01; distribution; malicious artifact            | pinned publisher/URI, hash/signature, quarantine   | NEG-006 / FI-005 / source evidence      | upstream breach               |
| TM-20 Malicious parser payload                | TB-02; parser; code/resource abuse                 | strict parser, limits, sandbox and rejection       | NEG-023 / FI-007 / parser result        | parser zero-day               |
| TM-21 Decompression bomb                      | TB-02; capacity; denial of service                 | byte/ratio/time limits before expansion            | NEG-024 / FI-006 / bounded failure      | distributed abuse             |
| TM-22 Stale or rollbacked feed                | TB-01/03; currency; obsolete knowledge             | monotonic release policy and governed rollback     | NEG-009 / FI-009 / activation audit     | legitimate emergency rollback |
| TM-23 License violation                       | TB-01; legal rights; unlawful use                  | license metadata and activation gate               | NEG-025 / FI-004 / approval record      | changed terms                 |
| TM-24 Confused-deputy global writer           | TB-03/08; global truth; privilege escalation       | dedicated global admin permission and MPA          | NEG-005 / FI-014 / denial audit         | administrator compromise      |
| TM-25 Unauthorized tenant-to-global promotion | TB-04/03; global truth; contamination              | governed review and independent approval           | NEG-005 / FI-015 / MPA evidence         | colluding approvers           |
| TM-26 Graph traversal amplification           | TB-06; DB capacity; denial of service              | depth/cardinality/time budgets and indexes         | NEG-026 / FI-017 / query telemetry      | adversarial valid graph       |
| TM-27 Graph inference side channel            | TB-04/06; private relations; indirect leakage      | tenant-safe projection and uniform denial          | NEG-027 / FI-017 / leakage test         | timing variance               |
| TM-28 Partial ingestion inconsistency         | TB-02/03; release; mixed state                     | transaction and inactive-until-complete release    | NEG-028 / FI-006 / atomicity            | external retry storm          |
| TM-29 Rollback inconsistency                  | TB-02/03; history; detached mappings               | ordered rollback and referential checks            | NEG-029 / FI-018 / rollback evidence    | operator error                |
| TM-30 Retention/deletion failure              | TB-09/10; evidence/history; policy breach          | XCAP-005 retention/legal-hold semantics            | NEG-030 / FI-018 / custody audit        | infrastructure loss           |
| TM-31 Disaster-recovery failure               | TB-10; registry/graph; prolonged outage            | backup, restore and reproducibility tests          | NEG-031 / FI-018 / restore evidence     | correlated disaster           |
| TM-32 Schema downgrade confusion              | TB-01/02/07; contracts; unsafe coercion            | closed versions and no silent downgrade            | NEG-032 / FI-007 / schema audit         | legacy client pressure        |
| TM-33 Model-mediated tenant extraction        | TB-04/07; private graph; disclosure                | tenant-safe context, classification and AI Gateway | NEG-019 / FI-016 / redaction evidence   | provider compromise           |

```text
THREATS = 33
MITIGATION_RUNTIME = NOT_IMPLEMENTED
RESIDUAL_RISK_ACCEPTANCE = REQUIRES_FUTURE_DOR
```
