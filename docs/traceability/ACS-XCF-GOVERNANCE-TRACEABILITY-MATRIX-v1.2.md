# ACS-XCF governance traceability matrix v1.2

Status: `GOVERNANCE_QUALIFIED_FOR_CANONICAL_PUBLICATION`

This matrix traces the governance-remediation obligations to their canonical artifacts and
qualification evidence. It does not represent XCF runtime implementation or runtime test results.

| Obligation                     | Canonical artifact                                        | Evidence and disposition                                                            |
| ------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Charter, scope and authority   | `ACS-XCF-GEP-v1.2.md`                                     | Governance-only boundary; implementation authority not granted                      |
| Self-contained active package  | `docs/governance/xcf/README.md`                           | No normative dependency on `superseded/`                                            |
| Historical custody             | `SUPERSESSION.md`                                         | Three proposed draft hashes and supersession reasons retained                       |
| Roadmap conflict               | GEP `5; `ADR-XCF-012`                                     | `XCF-G0` governance; runtime `M1`–`M8`                                              |
| Requirements                   | `ACS-XCF-REQUIREMENTS-v1.2.md`                            | `XCF-REQ-001` through `XCF-REQ-066`                                                 |
| Individual RTM                 | `ACS-XCF-RTM-v1.2.md`                                     | 66 rows; truthful `NOT_IMPLEMENTED/NOT_EXECUTED` runtime status                     |
| Architecture decisions         | `ADR-XCF-001` through `ADR-XCF-012`                       | Twelve explicit allowed dispositions                                                |
| Threat model                   | `ACS-XCF-THREAT-MODEL-v1.2.md`                            | 33 threats with boundary, asset/impact, mitigation, NEG/FI, evidence, residual risk |
| Source trust                   | `ACS-XCF-SOURCE-TRUST-AND-FRAMEWORK-REGISTRY-v1.2.md`     | NIST/CISA/MITRE/CVE/CWE and future-feed governance                                  |
| Framework Registry             | Source-trust/registry document                            | Entities, identity, versions, immutability, validity, replay and concurrency        |
| Mapping integrity              | `ACS-XCF-DATA-MAPPING-GRAPH-GOVERNANCE-v1.2.md`           | Classes, precedence, conflict, provenance, supersession and revocation              |
| Graph governance               | Data/mapping/graph document; `ADR-XCF-004`                | PostgreSQL relational first; new graph technology needs separate ADR                |
| Global/tenant governance       | Data/mapping/graph document; `ADR-XCF-002`                | Tenant-to-global promotion prohibited without governed review                       |
| Authorization and MPA          | `ACS-XCF-AUTHORIZATION-EVIDENCE-EVENT-GOVERNANCE-v1.2.md` | Canonical AuthorizationPort and MPA only                                            |
| Evidence/DecisionEvidence      | Authority/evidence/event document; `ADR-XCF-006/011`      | XCAP-005 reuse; no parallel evidence store                                          |
| Events, audit and outbox       | Authority/evidence/event document; `ADR-XCF-007`          | Canonical Event Foundation and transactional boundaries                             |
| XCAP-005 status                | Cyberdefense Capability Registry                          | Implemented, canonically integrated and verified                                    |
| XCAP-011 status/reuse          | Registry plus four M0 governance artifacts                | M0 closed/integrated; M1 not authorized                                             |
| Deterministic acceptance       | `ACS-XCF-ACCEPTANCE-MATRIX-v1.2.md`                       | 14 future cases; all `NOT_EXECUTED`                                                 |
| Negative security              | `ACS-XCF-NEGATIVE-SECURITY-MATRIX-v1.2.md`                | 22 future cases; all `NOT_EXECUTED`                                                 |
| Failure injection              | `ACS-XCF-FAILURE-INJECTION-MATRIX-v1.2.md`                | 18 future cases; all `NOT_EXECUTED`                                                 |
| No-mock policy                 | GEP `9                                                    | Real infrastructure required for persistence/security/E2E claims                    |
| Engineering lifecycle          | GEP `8                                                    | Authority through post-merge and next human authorization                           |
| Local governance qualification | XCF governance evidence record                            | Static checks and exact fileset captured before publication                         |
| Remote/publication closure     | Pull request and CI records                               | Must be terminal PASS on exact commit before merge                                  |

`RUNTIME_IMPLEMENTATION = NONE`

`RUNTIME_TEST_RESULT = NOT_EXECUTED`

`GOVERNANCE_TRACEABILITY = COMPLETE`
`PUBLICATION_EVIDENCE = PENDING_REMOTE_LIFECYCLE`
