# ACS-XCAP-011 — Cognitive Cyber Fusion & Cross-Domain Reasoning M0 Definition of Done

**Canonical baseline governance:** `APPROVED_AND_CANONICALLY_INTEGRATED`
**Local closure governance:** `CANONICALLY_INTEGRATED_AND_VERIFIED`
**Local closure canonical integration:** `YES`
**Status:** `MACHINE_EXECUTABLE_ACCEPTANCE_GATE`
**Capability:** `ACS-XCAP-011`
**Maturity:** `M0`
**Implementation authorization:** `NOT AUTHORIZED`

## Canonical authority chain

This artifact is subordinate, in order, to:

1. [ACS Master Engineering Specification — Baseline Enterprise v5.3 — Final Consolidated Engineering Edition](../baseline/ACS-MASTER-ENGINEERING-SPECIFICATION-BASELINE-ENTERPRISE-v5.3-FINAL-CONSOLIDATED-ENGINEERING-EDITION.txt);
2. [ACS Cyberdefense Functional Evolution Governed Architectural Delta Package v1.0 — Frozen](../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md);
3. [ACS Cyberdefense Capability Registry](../governance/cyberdefense/ACS-CYBERDEFENSE-CAPABILITY-REGISTRY.md);
4. the `ACS-XCAP-011` capability record in that registry; and
5. this `ACS-XCAP-011 M0 Definition of Done` artifact.

This artifact is not an independent source of truth and cannot override an upstream authority.

This DoD defines evidence a separately authorized future M0 implementation must supply. Nothing
in this document is current implementation evidence.

| Area                         | Mandatory future evidence                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts                    | Stable IDs `cyberdefense.fusion.request` and `cyberdefense.fusion.result`, each with initial schema version `1.0.0`, validate every mandatory field, assertion class, reference and compatibility rule. |
| Canonical reuse              | Tests prove XCAP-005, AI Gateway/XCAP-003, Event Foundation, AuthorizationPort, trusted context, audit and observability boundaries are reused without parallel systems.                                |
| Authentication/authorization | Real server authentication, ACTIVE membership and approved request/read permissions fail closed; registration assigns no role by default; no client tenant authority.                                   |
| Tenant isolation             | Same-tenant positives and cross-tenant/reference-spoofing negatives pass; the bounded receipt uses least privilege plus RLS/FORCE RLS.                                                                  |
| Evidence trust               | Integrity, provenance, source-trust and canonical-owner resolution are mandatory; raw evidence is immutable and embedded only by separately governed exception.                                         |
| Provenance                   | Every output links inputs, support/contradiction, policies, versions and applicable model/provider/template identity; tamper, detachment and mismatch tests fail closed.                                |
| Confidence                   | Six system-derived dimensions support `UNKNOWN`, versions and evidence; spoofed/malformed client values are rejected and no threshold or score grants authority.                                        |
| Explainability               | Assertions expose rationale, contributing domains, gaps, assumptions, contradictions and uncertainty.                                                                                                   |
| Security/privacy             | Injection, poisoning, malicious evidence, fabricated relationships, hallucinated promotion, model/provider compromise, secret/content leakage and minimization tests pass.                              |
| Failure behavior             | Every governed failure is bounded, fail-closed and non-autonomous; replay and divergent idempotency are deterministic.                                                                                  |
| Receipt persistence          | The capability-local receipt proves exact replay, divergent conflict, concurrent serialization, expiry, composite tenant key, least privilege, RLS/FORCE RLS and absence of Fusion/evidence content.    |
| Events/audit                 | Finalized M0 events validate through Event Foundation; receipt, canonical audit and outbox are atomic; no success effect exists before commit and FI-012 proves rollback.                               |
| Observability                | Metrics/logs/traces are bounded and redacted; no raw evidence, prompt, token, secret or unrestricted output appears.                                                                                    |
| Regression                   | Format, lint, typecheck, build, unit/integration/security, dependency and relevant workspace suites pass without waiver or weakened policy.                                                             |
| Acceptance                   | Every `XCAP011-M0-POS-*`, `NEG-*`, and `FI-*` case has reproducible runtime or contract-level evidence linked by the RTM; no mandatory case is skipped.                                                 |

Completion additionally requires human review of contract compatibility, threat controls and
objective evidence. M1 remains blocked until canonical CYB-001 asset/entity authority is integrated
or governance explicitly changes that dependency. M2 requires XCAP-006; M3 requires XCAP-007.

`RAW_EVIDENCE_MUTATION = PROHIBITED`
`RECOMMENDATION_IS_AUTHORIZATION = NO`
`AUTONOMOUS_RESPONSE = PROHIBITED`
`GLOBAL_PRODUCTION_ACTIVATION = NOT_AUTHORIZED`
`DOD_STATUS = MACHINE_EXECUTABLE_FUTURE_GATE`
`ACCEPTANCE_TOTAL = 43`
`MANDATORY_UNEXECUTABLE_CASES = 0`
`MANDATORY_ACCEPTANCE_SKIPS = 0`
