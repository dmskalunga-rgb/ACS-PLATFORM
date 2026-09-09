# ACS-XCAP-011 — Cognitive Cyber Fusion M0 Traceability Matrix

**Canonical baseline governance:** `APPROVED_AND_CANONICALLY_INTEGRATED`
**Local closure governance:** `CANONICALLY_INTEGRATED_AND_VERIFIED`
**Local closure canonical integration:** `YES`
**Status:** `IMPLEMENTATION_AUTHORIZATION_READY_NOT_IMPLEMENTATION_EVIDENCE`

## Canonical authority chain

This artifact is subordinate, in order, to:

1. [ACS Master Engineering Specification — Baseline Enterprise v5.3 — Final Consolidated Engineering Edition](../baseline/ACS-MASTER-ENGINEERING-SPECIFICATION-BASELINE-ENTERPRISE-v5.3-FINAL-CONSOLIDATED-ENGINEERING-EDITION.txt);
2. [ACS Cyberdefense Functional Evolution Governed Architectural Delta Package v1.0 — Frozen](../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md);
3. [ACS Cyberdefense Capability Registry](../governance/cyberdefense/ACS-CYBERDEFENSE-CAPABILITY-REGISTRY.md);
4. the `ACS-XCAP-011` capability record in that registry; and
5. this `ACS-XCAP-011 M0 Traceability Matrix` artifact.

This artifact is not an independent source of truth and cannot override an upstream authority.

| Requirement                                 | Root/Cyberdefense authority                    | Contract/policy                                                                             | Threat/control                                        | Acceptance                                | Future evidence   |
| ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- | ----------------- |
| `X011-M0-REQ-001` M0-only scope             | Frozen Cyberdefense maturity sequence          | M0 scope policy; ADR-0027                                                                   | Premature runtime/authority                           | `POS-009`, `NEG-017`, `NEG-018`           | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-002` request contract          | Root API/data/tenant rules                     | `cyberdefense.fusion.request`; schema `1.0.0`                                               | Spoofed/malformed context                             | `POS-001`, `NEG-004`, `FI-005`            | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-003` result contract           | Root AI/XAI rules                              | `cyberdefense.fusion.result`; schema `1.0.0`                                                | Unclassified derived truth                            | `POS-003`, `NEG-010`, `NEG-011`, `FI-004` | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-004` evidence authority        | XCAP-005                                       | reference/provenance contracts                                                              | Mutation, custody bypass, tamper                      | `POS-002`, `NEG-005` to `007`             | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-005` AI boundary               | ADR-0008; XCAP-003                             | AIDR-0001                                                                                   | Direct provider/parallel AI                           | `NEG-008`, `NEG-016`, `FI-001`, `FI-002`  | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-006` tenant/auth               | Identity/trusted context/AuthorizationPort     | SDR-0001; approved contract permissions pending implementation registration                 | Cross-tenant and privilege bypass                     | `NEG-001` to `005`                        | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-007` poisoning/injection       | Root security/privacy; SDR-0001                | untrusted-content policy                                                                    | Prompt/IOC/relationship poisoning                     | `NEG-008` to `011`                        | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-008` confidence                | Root explainability/reproducibility            | `fusion.confidence.v1`                                                                      | Confidence treated as authority                       | `POS-004`, `NEG-012`, `FI-008`            | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-009` provenance/explainability | Root AI lineage/XAI; XCAP-005                  | `fusion.provenance.v1`                                                                      | Untraceable claim                                     | `POS-003`, `POS-010`, `NEG-006`           | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-010` response boundary         | Cyberdefense root; MPA ADR-0026                | recommendation policy                                                                       | Unauthorized/autonomous response                      | `POS-008`, `NEG-013`, `NEG-014`           | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-011` events/audit              | ADR-0006; canonical audit                      | final Event Foundation contracts `1.0.0`                                                    | Leakage/split state                                   | `POS-006`, `NEG-015`, `FI-012`            | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-012` observability/privacy     | ADR-0009                                       | bounded telemetry policy                                                                    | Sensitive/high-cardinality leakage                    | `POS-007`, `NEG-015`                      | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-013` failure/idempotency       | Root integration rules                         | failure policy                                                                              | Silent fallback/replay divergence                     | `POS-005`, `FI-001` to `FI-012`           | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-014` maturity dependencies     | Dependency Graph                               | M1/M2/M3 gates                                                                              | Premature entity/correlation/graph authority          | `POS-009`, `NEG-017`, `NEG-018`           | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-015` provider/model trust      | ADR-0008; AIDR-0001                            | AI Gateway allowlist, identity/version and policy binding                                   | Model/provider compromise or substitution             | `NEG-019`                                 | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-016` provenance binding        | Root AI lineage/XAI; XCAP-005; SDR-0001        | Mandatory immutable-in-meaning, version-bound result/input/support/contradiction provenance | Provenance detachment, mismatch or tampering          | `NEG-020`                                 | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-017` confidence derivation     | Root explainability; SDR-0001                  | System-derived, computation/policy-version-bound, non-authoritative confidence              | Client confidence spoofing or authorization promotion | `NEG-021`                                 | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-018` schema closure            | DoR/DoD; ADR-0027                              | request, result, reference and context schemas `1.0.0`                                      | Ambiguous or unsafe parser behavior                   | `POS-001`, `POS-003`, `FI-004`, `FI-005`  | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-019` evidence projection       | XCAP-005                                       | `cyberdefense.evidence.fusion-resolution@1.0.0`                                             | Parallel evidence authority/content leakage           | `POS-002`, `NEG-004` to `007`             | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-020` failure/content boundary  | SDR-0001; Event Foundation                     | closed failure, untrusted-content and classification contracts                              | Prompt injection, sensitive leakage, free-form errors | `NEG-007` to `011`, `NEG-015`, `FI-003`   | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-021` bounded replay boundary   | Human bounded-persistence decision; ADR-0027   | XCAP-011 receipt/hash/expiry/row-lock contract                                              | Duplicate/divergent replay                            | `POS-005`, `FI-010`, `FI-011`             | `REQUIRED_AT_DOD` |
| `X011-M0-REQ-022` permission registration   | AuthorizationPort; canonical migration pattern | `cyberdefense.fusion.request`, `cyberdefense.fusion.read`; default assignment none          | Implicit or broad privilege                           | `NEG-001` to `NEG-005`, `NEG-014`         | `REQUIRED_AT_DOD` |

Reverse traceability is complete because every mandatory acceptance ID is assigned to at least one
requirement above; detailed case semantics live in the policy/contract registry. No future-evidence
cell is represented as current proof.

Acceptance IDs abbreviated in this matrix as `POS-*`, `NEG-*`, or `FI-*` use the single namespace
prefix `XCAP011-M0-`; for example, `POS-005` is exactly `XCAP011-M0-POS-005`.

`ORPHAN_MANDATORY_REQUIREMENTS = 0`
`UNAUTHORIZED_ACCEPTANCE_CASES = 0`
`ACCEPTANCE_TOTAL = 43`
`M0_MANDATORY_EXECUTABLE = 16`
`M0_CONTRACT_LEVEL_EXECUTABLE = 27`
`LATER_MATURITY = 0`
`NOT_APPLICABLE_WITH_JUSTIFICATION = 0`
`MANDATORY_UNEXECUTABLE_CASES = 0`
`MANDATORY_ACCEPTANCE_SKIPS = 0`
`IMPLEMENTATION_EVIDENCE = REQUIRED_AT_DOD`
