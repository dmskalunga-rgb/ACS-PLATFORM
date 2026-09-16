# ACS-XCF requirements traceability matrix v1.2

Status: `GOVERNANCE_QUALIFIED_FOR_CANONICAL_PUBLICATION`

Common truth for every row: `CODE=NOT_IMPLEMENTED`, `TEST_RESULT=NOT_EXECUTED`, and
`RUNTIME_EVIDENCE=NOT_AVAILABLE`. Test identifiers are deterministic future contracts.

| Req           | Architecture / ADR / threat               | Capability, contract and persistence owner                 | Positive / negative / FI                              | Evidence / gate / acceptance        | Milestone   |
| ------------- | ----------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- | ----------- |
| `XCF-REQ-001` | Registry / ADR-XCF-003 / TM-01            | XCF Registry / source registry / PostgreSQL                | XCF-AC-001/002/003 / XCF-NEG-007 / XCF-FI-004         | registry snapshot / QG-01 / AC-01   | M1          |
| `XCF-REQ-002` | Provenance / ADR-XCF-003 / TM-01          | XCF Registry / FrameworkObject / PostgreSQL                | XCF-AC-001 / XCF-NEG-007 / XCF-FI-005                 | source artifact / QG-01 / AC-01     | M1          |
| `XCF-REQ-003` | History / ADR-XCF-003 / TM-02             | XCF Registry / FrameworkRelease / PostgreSQL               | XCF-AC-002/003 / XCF-NEG-011 / XCF-FI-009             | release lineage / QG-08 / AC-01     | M1          |
| `XCF-REQ-004` | Reproduction / ADR-XCF-011 / TM-02        | XCF release snapshot / provenance / PostgreSQL+XCAP-005    | XCF-AC-002/003 / XCF-NEG-011/013 / XCF-FI-009         | reconstruction / QG-08 / AC-01      | M1          |
| `XCF-REQ-005` | Mapping / ADR-XCF-009 / TM-03             | XCF Mapping / mapping ID / PostgreSQL                      | XCF-AC-004 / XCF-NEG-012 / XCF-FI-010                 | mapping record / QG-02 / AC-02      | M2          |
| `XCF-REQ-006` | Mapping / ADR-XCF-009 / TM-03             | XCF Mapping / versioned endpoints / PostgreSQL             | XCF-AC-004 / XCF-NEG-012 / XCF-FI-010                 | mapping lineage / QG-02 / AC-02     | M2          |
| `XCF-REQ-007` | Mapping / ADR-XCF-009 / TM-03             | XCF Mapping / relationship registry / PostgreSQL           | XCF-AC-004 / XCF-NEG-012 / XCF-FI-007                 | validation result / QG-02 / AC-02   | M2          |
| `XCF-REQ-008` | Mapping / ADR-XCF-009 / TM-03             | XCF Mapping / confidence / PostgreSQL                      | XCF-AC-004 / XCF-NEG-012 / XCF-FI-010                 | confidence evidence / QG-02 / AC-02 | M2          |
| `XCF-REQ-009` | Mapping / ADR-XCF-009 / TM-03             | XCF Mapping / mapping class / PostgreSQL                   | XCF-AC-004 / XCF-NEG-012 / XCF-FI-010                 | class audit / QG-02 / AC-02         | M2          |
| `XCF-REQ-010` | Mapping / ADR-XCF-009 / TM-03             | XCF Mapping / provenance / PostgreSQL                      | XCF-AC-004/005 / XCF-NEG-012 / XCF-FI-005/010         | rejection audit / QG-02 / AC-02     | M2          |
| `XCF-REQ-011` | Graph / ADR-XCF-004 / TM-04               | XCF Knowledge / node registry / PostgreSQL                 | XCF-AC-007 / XCF-NEG-014 / XCF-FI-017                 | graph fixture / QG-02 / AC-03       | M3/M5       |
| `XCF-REQ-012` | Graph / ADR-XCF-004 / TM-04               | XCF Knowledge / edges / PostgreSQL                         | XCF-AC-007 / XCF-NEG-014 / XCF-FI-017                 | traversal / QG-02 / AC-03           | M3/M5       |
| `XCF-REQ-013` | Graph / ADR-XCF-011 / TM-04               | XCF Knowledge / temporal edge / PostgreSQL                 | XCF-AC-007 / XCF-NEG-014 / XCF-FI-009                 | version history / QG-08 / AC-03     | M3/M5       |
| `XCF-REQ-014` | Global/tenant scope / ADR-XCF-002 / TM-05 | XCF Knowledge / scope model / PostgreSQL                   | XCF-AC-006/008/014 / XCF-NEG-001/014 / XCF-FI-001/017 | RLS proof / QG-03 / AC-11           | M1-M8       |
| `XCF-REQ-015` | Vulnerability / ADR-XCF-003 / TM-06       | XCF Vuln / CVE-CWE-CVSS refs / PostgreSQL                  | XCF-AC-015 / XCF-NEG-011 / XCF-FI-006                 | source lineage / QG-01 / AC-04      | M2          |
| `XCF-REQ-016` | KEV / ADR-XCF-003 / TM-06                 | XCF Vuln / KEV presence / PostgreSQL                       | XCF-AC-015 / XCF-NEG-011 / XCF-FI-004                 | release proof / QG-01 / AC-04       | M2          |
| `XCF-REQ-017` | KEV provenance / ADR-XCF-003 / TM-06      | XCF Vuln / KEV source / XCAP-005 refs                      | XCF-AC-015 / XCF-NEG-011 / XCF-FI-005                 | source hash / QG-01 / AC-04         | M2          |
| `XCF-REQ-018` | Priority / ADR-XCF-003 / TM-06            | XCF Vuln / priority context / PostgreSQL                   | XCF-AC-015 / XCF-NEG-011/013 / XCF-FI-016             | factor explanation / QG-06 / AC-04  | M2          |
| `XCF-REQ-019` | ATT&CK / ADR-XCF-003 / TM-07              | XCF Adversary / tactic / PostgreSQL                        | XCF-AC-016 / XCF-NEG-007 / XCF-FI-006                 | release proof / QG-01 / AC-05       | M3          |
| `XCF-REQ-020` | ATT&CK / ADR-XCF-003 / TM-07              | XCF Adversary / technique / PostgreSQL                     | XCF-AC-016 / XCF-NEG-007 / XCF-FI-006                 | object lineage / QG-01 / AC-05      | M3          |
| `XCF-REQ-021` | ATT&CK / ADR-XCF-003 / TM-07              | XCF Adversary / sub-technique / PostgreSQL                 | XCF-AC-016 / XCF-NEG-007 / XCF-FI-007                 | hierarchy proof / QG-02 / AC-05     | M3          |
| `XCF-REQ-022` | Incident mapping / ADR-XCF-004 / TM-07    | CYB-001 reference / incident-technique edge / PostgreSQL   | XCF-AC-016 / XCF-NEG-007 / XCF-FI-017                 | traversal / QG-02 / AC-05           | M3          |
| `XCF-REQ-023` | Assertion state / ADR-XCF-008 / TM-07     | XCAP-011 / assertion class / Fusion                        | XCF-AC-016 / XCF-NEG-016 / XCF-FI-016                 | result contract / QG-06 / AC-05     | M3          |
| `XCF-REQ-024` | Defense / ADR-XCF-009 / TM-08             | XCF Defense / D3FEND edge / PostgreSQL                     | XCF-AC-017 / XCF-NEG-012 / XCF-FI-010                 | mapping evidence / QG-02 / AC-06    | M4          |
| `XCF-REQ-025` | Capability map / ADR-XCF-009 / TM-08      | Capability Registry / defense-capability edge / PostgreSQL | XCF-AC-017 / XCF-NEG-012 / XCF-FI-010                 | mapping audit / QG-02 / AC-06       | M4          |
| `XCF-REQ-026` | Authority boundary / ADR-XCF-005 / TM-12  | AuthorizationPort / capability ref / none                  | XCF-AC-017 / XCF-NEG-005 / XCF-FI-014                 | auth decision / QG-05 / AC-09       | M4/M7       |
| `XCF-REQ-027` | Fusion adapter / ADR-XCF-004 / TM-09      | XCAP-011 / knowledge reference adapter / owner API         | XCF-AC-009 / XCF-NEG-016 / XCF-FI-017                 | adapter evidence / QG-04 / AC-07    | M5          |
| `XCF-REQ-028` | Fusion lineage / ADR-XCF-011 / TM-09      | XCAP-011 / provenance binding / receipt+XCAP-005           | XCF-AC-009 / XCF-NEG-015 / XCF-FI-013                 | lineage / QG-04 / AC-07             | M5          |
| `XCF-REQ-029` | Explainability / ADR-XCF-008 / TM-10      | XCAP-011 / explanation / Fusion                            | XCF-AC-009 / XCF-NEG-016 / XCF-FI-016                 | rationale / QG-06 / AC-08           | M5          |
| `XCF-REQ-030` | Execution boundary / ADR-XCF-008 / TM-12  | XCAP-011+AuthorizationPort / response candidate / none     | XCF-AC-009 / XCF-NEG-016 / XCF-FI-014                 | NOT_AUTHORIZED / QG-07 / AC-09      | M5          |
| `XCF-REQ-031` | Hypothesis / ADR-XCF-008 / TM-10          | XCAP-011 / hypothesis / Fusion                             | XCF-AC-010 / XCF-NEG-016 / XCF-FI-016                 | result / QG-06 / AC-08              | M6          |
| `XCF-REQ-032` | Confidence / ADR-XCF-008 / TM-10          | XCAP-011 / confidence / Fusion                             | XCF-AC-010 / XCF-NEG-016 / XCF-FI-016                 | confidence proof / QG-06 / AC-08    | M6          |
| `XCF-REQ-033` | Rationale / ADR-XCF-008 / TM-10           | XCAP-011 / recommendation / Fusion                         | XCF-AC-010 / XCF-NEG-016 / XCF-FI-016                 | rationale / QG-06 / AC-08           | M6          |
| `XCF-REQ-034` | Explanation refs / ADR-XCF-011 / TM-10    | XCAP-011+XCAP-005 / support refs / Evidence                | XCF-AC-010 / XCF-NEG-015 / XCF-FI-013                 | DecisionEvidence / QG-04 / AC-08    | M6          |
| `XCF-REQ-035` | Assertion class / ADR-XCF-008 / TM-10     | XCAP-011 / assertion enum / Fusion                         | XCF-AC-010 / XCF-NEG-016 / XCF-FI-016                 | schema evidence / QG-06 / AC-08     | M6          |
| `XCF-REQ-036` | AI boundary / ADR-XCF-008 / TM-12         | AI Gateway+AuthorizationPort / recommendation / none       | XCF-AC-010 / XCF-NEG-016 / XCF-FI-016                 | denied promotion / QG-07 / AC-09    | M6/M7       |
| `XCF-REQ-037` | AI execution / ADR-XCF-008 / TM-12        | operation owner / protected action / owner DB              | XCF-AC-011 / XCF-NEG-019 / XCF-FI-014                 | no execution / QG-07 / AC-09        | M6/M7       |
| `XCF-REQ-038` | Authorization / ADR-XCF-005 / TM-12       | AuthorizationPort / action request / canonical owner       | XCF-AC-011 / XCF-NEG-005 / XCF-FI-014                 | decision / QG-05 / AC-09            | M7          |
| `XCF-REQ-039` | Tenant auth / ADR-XCF-005 / TM-14         | Platform Context / auth attributes / platform DB           | XCF-AC-011 / XCF-NEG-005 / XCF-FI-014                 | tenant proof / QG-03 / AC-09        | M7          |
| `XCF-REQ-040` | Policy version / ADR-XCF-005 / TM-12      | AuthorizationPort / policy ID/version / audit              | XCF-AC-011 / XCF-NEG-005 / XCF-FI-014                 | audit record / QG-05 / AC-09        | M7          |
| `XCF-REQ-041` | SoD / ADR-XCF-005 / TM-12                 | MPA / authority class / platform DB                        | XCF-AC-012 / XCF-NEG-006 / XCF-FI-015                 | MPA evidence / QG-05 / AC-09        | M7          |
| `XCF-REQ-042` | Human approval / ADR-XCF-005 / TM-12      | MPA / attestation / platform DB                            | XCF-AC-012 / XCF-NEG-006 / XCF-FI-015                 | approval lineage / QG-05 / AC-09    | M7          |
| `XCF-REQ-043` | Auth evidence / ADR-XCF-011 / TM-12       | Audit+XCAP-005 / DecisionEvidence ref / Evidence           | XCF-AC-012 / XCF-NEG-006 / XCF-FI-011                 | audit+evidence / QG-10 / AC-10      | M7          |
| `XCF-REQ-044` | DecisionEvidence / ADR-XCF-006 / TM-13    | XCAP-005 / derived evidence / Evidence DB                  | XCF-AC-009 / XCF-NEG-015 / XCF-FI-013                 | custody record / QG-04 / AC-10      | M5-M8       |
| `XCF-REQ-045` | Decision lineage / ADR-XCF-011 / TM-13    | XCAP-005 / DecisionEvidence / Evidence DB                  | XCF-AC-009 / XCF-NEG-015 / XCF-FI-013                 | complete refs / QG-04 / AC-10       | M5-M8       |
| `XCF-REQ-046` | Durable decision / ADR-XCF-006 / TM-13    | XCAP-005 / derivation / Evidence DB                        | XCF-AC-009 / XCF-NEG-015 / XCF-FI-013                 | persisted evidence / QG-04 / AC-10  | M5-M8       |
| `XCF-REQ-047` | Tamper evidence / ADR-XCF-006 / TM-13     | XCAP-005 / SHA-256+custody / Evidence DB                   | XCF-AC-012 / XCF-NEG-015 / XCF-FI-005                 | verification / QG-04 / AC-10        | M5-M8       |
| `XCF-REQ-048` | Incident isolation / ADR-XCF-006 / TM-14  | CYB-001 / incident refs / owner DB                         | XCF-AC-014 / XCF-NEG-001 / XCF-FI-001                 | RLS proof / QG-03 / AC-11           | All runtime |
| `XCF-REQ-049` | Evidence isolation / ADR-XCF-006 / TM-14  | XCAP-005 / evidence refs / Evidence DB                     | XCF-AC-014 / XCF-NEG-001 / XCF-FI-001                 | RLS proof / QG-03 / AC-11           | All runtime |
| `XCF-REQ-050` | Inference leakage / ADR-XCF-002 / TM-05   | XCF Knowledge / traversal / PostgreSQL                     | XCF-AC-008 / XCF-NEG-014 / XCF-FI-017                 | side-channel test / QG-03 / AC-11   | M3-M8       |
| `XCF-REQ-051` | Retrieval context / ADR-XCF-002 / TM-14   | Platform Context / retrieval / PostgreSQL                  | XCF-AC-008/014 / XCF-NEG-003 / XCF-FI-014             | tenant proof / QG-03 / AC-11        | M3-M8       |
| `XCF-REQ-052` | RLS preservation / ADR-XCF-002 / TM-14    | PostgreSQL / RLS/FORCE RLS / owner DB                      | XCF-AC-014 / XCF-NEG-001 / XCF-FI-001                 | catalog proof / QG-03 / AC-11       | All runtime |
| `XCF-REQ-053` | Lessons / ADR-XCF-012 / TM-15             | XCF Learning / proposal / PostgreSQL                       | XCF-AC-013 / XCF-NEG-009 / XCF-FI-010                 | proposal / QG-10 / AC-12            | M8          |
| `XCF-REQ-054` | Improvements / ADR-XCF-012 / TM-15        | XCF Learning / improvement proposal / PostgreSQL           | XCF-AC-013 / XCF-NEG-009 / XCF-FI-010                 | lineage / QG-10 / AC-12             | M8          |
| `XCF-REQ-055` | Control mutation / ADR-XCF-012 / TM-15    | governance owner / proposal only / none                    | XCF-AC-013 / XCF-NEG-006 / XCF-FI-014                 | no mutation / QG-05 / AC-12         | M8          |
| `XCF-REQ-056` | Policy mutation / ADR-XCF-012 / TM-15     | governance owner / proposal only / none                    | XCF-AC-013 / XCF-NEG-006 / XCF-FI-014                 | no mutation / QG-05 / AC-12         | M8          |
| `XCF-REQ-057` | RFC / ADR-XCF-012 / TM-15                 | governance workflow / change ref / governance              | XCF-AC-013 / XCF-NEG-006 / XCF-FI-015                 | approval evidence / QG-10 / AC-12   | M8          |
| `XCF-REQ-058` | Ingestion telemetry / ADR-XCF-007 / TM-16 | Observability / metrics / telemetry                        | XCF-AC-014 / XCF-NEG-022 / XCF-FI-004                 | metric/trace / QG-10 / AC-13        | M1-M4       |
| `XCF-REQ-059` | Mapping telemetry / ADR-XCF-007 / TM-16   | Observability / mapping outcome / telemetry                | XCF-AC-014 / XCF-NEG-022 / XCF-FI-010                 | bounded metric / QG-10 / AC-13      | M1-M4       |
| `XCF-REQ-060` | Graph telemetry / ADR-XCF-007 / TM-16     | Observability / traversal outcome / telemetry              | XCF-AC-014 / XCF-NEG-022 / XCF-FI-017                 | bounded metric / QG-10 / AC-13      | M5-M8       |
| `XCF-REQ-061` | Denial audit / ADR-XCF-005 / TM-12        | canonical audit / denial / platform DB                     | XCF-AC-014 / XCF-NEG-022 / XCF-FI-011                 | audit record / QG-10 / AC-13        | M7          |
| `XCF-REQ-062` | Latency / ADR-XCF-007 / TM-16             | Observability / histograms / telemetry                     | XCF-AC-014 / XCF-NEG-022 / XCF-FI-016                 | metric / QG-10 / AC-13              | M5-M8       |
| `XCF-REQ-063` | Fail auth / ADR-XCF-010 / TM-17           | AuthorizationPort / protected action / owner DB            | XCF-AC-014 / XCF-NEG-005 / XCF-FI-014                 | no effect / QG-09 / AC-14           | M7          |
| `XCF-REQ-064` | Fail tenant / ADR-XCF-010 / TM-17         | Platform Context / access / owner DB                       | XCF-AC-014 / XCF-NEG-003 / XCF-FI-001                 | no disclosure / QG-09 / AC-14       | All runtime |
| `XCF-REQ-065` | Fail evidence / ADR-XCF-010 / TM-17       | XCAP-005 / evidence-before-action / Evidence DB            | XCF-AC-014 / XCF-NEG-015 / XCF-FI-013                 | rollback / QG-09 / AC-14            | M5-M8       |
| `XCF-REQ-066` | Fail uncertainty / ADR-XCF-008 / TM-10    | XCAP-011 / REFUSED/UNKNOWN / Fusion                        | XCF-AC-014 / XCF-NEG-019 / XCF-FI-016                 | refused result / QG-06 / AC-14      | M2-M8       |

```text
REQUIREMENTS_REPRESENTED = 66/66
CODE = NOT_IMPLEMENTED
TEST_RESULT = NOT_EXECUTED
RUNTIME_EVIDENCE = NOT_AVAILABLE
```
