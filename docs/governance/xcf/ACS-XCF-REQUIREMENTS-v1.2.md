# ACS-XCF canonical requirements v1.2

Status: `GOVERNANCE_QUALIFIED_FOR_CANONICAL_PUBLICATION`

Every requirement is normative governance for a separately authorized future implementation. No row
represents current XCF runtime evidence.

| ID          | Normative requirement                                                                                                                                                                      | Milestone   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| XCF-REQ-001 | Maintain one versioned registry of approved framework sources and publishers.                                                                                                              | M1          |
| XCF-REQ-002 | Every imported object records source, release, integrity identity and ingestion provenance.                                                                                                | M1          |
| XCF-REQ-003 | Supersession never destroys the historical knowledge used by an earlier decision.                                                                                                          | M1          |
| XCF-REQ-004 | Historical decisions are reproducible against the exact knowledge versions used.                                                                                                           | M1          |
| XCF-REQ-005 | Every mapping has a stable globally unique mapping identifier.                                                                                                                             | M1          |
| XCF-REQ-006 | Every mapping binds versioned source and target object identities.                                                                                                                         | M1          |
| XCF-REQ-007 | Every mapping uses a governed relationship type.                                                                                                                                           | M1          |
| XCF-REQ-008 | Inferred or AI-assisted mappings carry system-derived confidence and supporting references.                                                                                                | M1          |
| XCF-REQ-009 | Every mapping declares its class: authoritative, curated, inferred, AI-assisted or human-validated.                                                                                        | M1          |
| XCF-REQ-010 | Missing or invalid provenance makes a mapping ineligible for activation.                                                                                                                   | M1          |
| XCF-REQ-011 | The common knowledge model represents framework, control, vulnerability, weakness, attack/defensive technique, advisory, evidence, incident, response, authorization and outcome concepts. | M1/M5       |
| XCF-REQ-012 | The knowledge representation supports governed many-to-many relationships.                                                                                                                 | M1/M5       |
| XCF-REQ-013 | Nodes and relationships preserve temporal validity, version and supersession.                                                                                                              | M1/M5       |
| XCF-REQ-014 | Global knowledge and tenant knowledge remain explicitly separated.                                                                                                                         | M1/M5       |
| XCF-REQ-015 | Verified CVE, CWE and CVSS relationships can be represented without fabricating absent links.                                                                                              | M2          |
| XCF-REQ-016 | CISA KEV presence and absence are represented with release-bound provenance.                                                                                                               | M2          |
| XCF-REQ-017 | KEV data preserves source identity, release, integrity and ingestion version.                                                                                                              | M2          |
| XCF-REQ-018 | Vulnerability prioritization never relies exclusively on CVSS.                                                                                                                             | M2          |
| XCF-REQ-019 | Governed ATT&CK tactics are supported as versioned framework objects.                                                                                                                      | M3          |
| XCF-REQ-020 | Governed ATT&CK techniques are supported as versioned framework objects.                                                                                                                   | M3          |
| XCF-REQ-021 | Governed ATT&CK sub-techniques preserve parent and release relationships.                                                                                                                  | M3          |
| XCF-REQ-022 | An authorized incident reference can relate to multiple validated techniques.                                                                                                              | M3          |
| XCF-REQ-023 | Adversary assertions distinguish observed, inferred, suspected and confirmed states.                                                                                                       | M3          |
| XCF-REQ-024 | Defensive techniques can map to validated adversary techniques.                                                                                                                            | M4          |
| XCF-REQ-025 | Defensive techniques can map to approved ACS capabilities without granting execution authority.                                                                                            | M4          |
| XCF-REQ-026 | Capability availability never implies that an action is authorized.                                                                                                                        | M4/M7       |
| XCF-REQ-027 | XCAP-011 may consume versioned XCF knowledge only through a governed adapter.                                                                                                              | M5          |
| XCF-REQ-028 | Fusion preserves all source and knowledge-version references.                                                                                                                              | M5          |
| XCF-REQ-029 | Fusion output provides bounded, evidence-backed explanation and uncertainty.                                                                                                               | M5          |
| XCF-REQ-030 | Fusion is not an execution or authorization authority.                                                                                                                                     | M5          |
| XCF-REQ-031 | Cognitive decision support may propose hypotheses through the canonical Fusion/AI boundary.                                                                                                | M6          |
| XCF-REQ-032 | Every hypothesis carries system-derived confidence or explicit UNKNOWN.                                                                                                                    | M6          |
| XCF-REQ-033 | Every recommendation carries bounded rationale.                                                                                                                                            | M6          |
| XCF-REQ-034 | Rationale references the evidence and knowledge versions actually used.                                                                                                                    | M6          |
| XCF-REQ-035 | Outputs distinguish fact, observation, correlation, inference, hypothesis, prediction and recommendation.                                                                                  | M6          |
| XCF-REQ-036 | AI recommendation never becomes authorization.                                                                                                                                             | M6/M7       |
| XCF-REQ-037 | AI cannot directly execute a protected action.                                                                                                                                             | M6/M7       |
| XCF-REQ-038 | Every protected action passes through canonical AuthorizationPort.                                                                                                                         | M7          |
| XCF-REQ-039 | Authorization is evaluated in trusted tenant context.                                                                                                                                      | M7          |
| XCF-REQ-040 | Authorization records the applicable policy identity/version.                                                                                                                              | M7          |
| XCF-REQ-041 | Policies requiring Separation of Duties use canonical MPA authority classes.                                                                                                               | M7          |
| XCF-REQ-042 | Policies requiring human approval use canonical MPA and physical-human attestation.                                                                                                        | M7          |
| XCF-REQ-043 | Authorization decisions are auditable and bind to DecisionEvidence where required.                                                                                                         | M7          |
| XCF-REQ-044 | Every policy-defined critical decision derives an XCAP-005 DecisionEvidence record.                                                                                                        | M5-M8       |
| XCF-REQ-045 | DecisionEvidence references decision, tenant, inputs, knowledge releases, mappings, evidence, recommendation, authorization, execution and outcome.                                        | M5-M8       |
| XCF-REQ-046 | A critical decision cannot exist only in a prompt, chat, model memory or unstructured log.                                                                                                 | M5-M8       |
| XCF-REQ-047 | DecisionEvidence uses XCAP-005 integrity, derivation and custody semantics.                                                                                                                | M5-M8       |
| XCF-REQ-048 | Cross-tenant incident disclosure is denied by default.                                                                                                                                     | All runtime |
| XCF-REQ-049 | Cross-tenant evidence disclosure is denied by default.                                                                                                                                     | All runtime |
| XCF-REQ-050 | Tenant relationship inference leakage is denied and tested.                                                                                                                                | M5-M8       |
| XCF-REQ-051 | Retrieval and graph traversal use server-authoritative tenant context.                                                                                                                     | M5-M8       |
| XCF-REQ-052 | XCF never weakens canonical RLS, FORCE RLS or tenant isolation.                                                                                                                            | All runtime |
| XCF-REQ-053 | Incident closure may produce tenant-scoped lessons-learned proposals.                                                                                                                      | M8          |
| XCF-REQ-054 | Lessons may produce governed improvement proposals with provenance.                                                                                                                        | M8          |
| XCF-REQ-055 | Learning never mutates canonical controls automatically.                                                                                                                                   | M8          |
| XCF-REQ-056 | Learning never mutates authorization policy automatically.                                                                                                                                 | M8          |
| XCF-REQ-057 | Governance-affecting learning requires the applicable RFC/change process.                                                                                                                  | M8          |
| XCF-REQ-058 | Every ingestion attempt emits bounded observability metadata.                                                                                                                              | M1-M4       |
| XCF-REQ-059 | Mapping validation and activation failures are observable without leaking content.                                                                                                         | M1-M4       |
| XCF-REQ-060 | Graph resolution failures are observable with bounded cardinality.                                                                                                                         | M5-M8       |
| XCF-REQ-061 | Authorization denial is audited through canonical audit.                                                                                                                                   | M7          |
| XCF-REQ-062 | Decision and dependency latency are measurable without sensitive payloads.                                                                                                                 | M5-M8       |
| XCF-REQ-063 | Authorization failure prevents the protected action.                                                                                                                                       | M7          |
| XCF-REQ-064 | Tenant-context failure prevents tenant-specific access.                                                                                                                                    | All runtime |
| XCF-REQ-065 | Evidence persistence failure blocks operations requiring evidence-before-action.                                                                                                           | M5-M8       |
| XCF-REQ-066 | Uncertain knowledge cannot be represented as a confirmed fact.                                                                                                                             | M2-M8       |

```text
REQUIREMENT_COUNT = 66
CODE = NOT_IMPLEMENTED
TEST_RESULT = NOT_EXECUTED
RUNTIME_EVIDENCE = NOT_AVAILABLE
```
