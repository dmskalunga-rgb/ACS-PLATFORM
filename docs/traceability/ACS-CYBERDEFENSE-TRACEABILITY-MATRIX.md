# ACS Cyberdefense Capability Registry Traceability Matrix

Status: `CANONICAL_FROZEN_GOVERNANCE_BASELINE`

No row creates a normative `ACS-REQ` identifier or authorizes implementation. `GAP` means the
authority must be supplied through approved governance rather than inferred.

| Registry scope                                                 | Existing ACS authority reused                                                                                                                                       | Traceability status               | Gap / control                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| All ACS-XCAP / ACS-CYB                                         | [Canonically frozen Cyberdefense root subordinate authority](../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md) | `CANONICAL_SUBORDINATE_AUTHORITY` | Root authority is canonically frozen under QG-34; capability-specific Architecture Readiness Gate and DoR remain mandatory before implementation. |
| Identity, tenant and authorization                             | ADR-0007, ADR-0011, ADR-0012, ADR-0013, ADR-0026; Phase 1 requirements                                                                                              | `VERIFIED_EXISTING_AUTHORITY`     | Capability permissions and tenant/RLS proof are proposal-specific.                                                                                |
| Data isolation                                                 | Phase 1 multi-tenancy architecture; database RLS/FORCE RLS tests                                                                                                    | `VERIFIED_EXISTING_AUTHORITY`     | Data classification and retention are `FUTURE_DOR_REQUIRED`.                                                                                      |
| Events and integration                                         | ADR-0006; Event Foundation traceability matrix                                                                                                                      | `VERIFIED_EXISTING_AUTHORITY`     | Cyber event schemas, producers/consumers and connector trust are `AUTHORITY_GAP`.                                                                 |
| Audit and governance                                           | ADR-0009; security audit and authorization administration foundations                                                                                               | `PARTIAL_EXISTING_AUTHORITY`      | Evidence custody model and compliance controls are `AUTHORITY_GAP`.                                                                               |
| AI                                                             | ADR-0008 AI Gateway boundary                                                                                                                                        | `PARTIAL_EXISTING_AUTHORITY`      | Cognitive AI contract, model governance and explainability are `AUTHORITY_GAP`.                                                                   |
| Cognitive Cyber Fusion & Cross-Domain Reasoning (ACS-XCAP-011) | Proposed remediated Cyberdefense root authority; ADR-0006/0008/0009 and tenant/authorization ADRs                                                                   | `NEW_GOVERNED_CAPABILITY`         | Fusion uses existing foundations but requires future DoR, contracts, evidence, tenant/RLS, explainability and production validation.              |
| Commercial/licensing relevance                                 | Phase 2 commercial registries, subscription/entitlement traceability                                                                                                | `PARTIAL_EXISTING_AUTHORITY`      | No cyber licensing/entitlement model is inferred; `FUTURE_DOR_REQUIRED`.                                                                          |
| Reporting, analytics and intelligence                          | Existing observability standard and commercial reporting-adjacent data                                                                                              | `AUTHORITY_GAP`                   | Authoritative security data products and reporting contracts are required.                                                                        |
| Operational cyberdefense domains                               | Baseline v5.3 and proposed remediated root authority                                                                                                                | `NEW_GOVERNED_CAPABILITY`         | Every ACS-CYB record must pass the Architecture Readiness Gate and has `FUTURE_DOR_REQUIRED`.                                                     |

## Required linked artifacts for a future capability proposal

1. Registry record and approved change request.
2. Capability-specific DoR/DoD and threat/security analysis.
3. ADR/AIDR/SDR changes where a canonical boundary changes.
4. ECOM, EDIM, EDOLM and RTM deltas where required by the proposed root governance sequence and later approved under QG-34.
5. Event, audit, evidence, tenant/RLS, AI, reporting and observability contracts.
6. Positive, negative/security and production-readiness evidence.

## Fusion maturity and production reservation

`ACS-XCAP-011` is governance-integrated only. Its future maturity progression is `M0`
(contracts/schemas), `M1` (entity normalization/provenance), `M2` (deterministic correlation),
`M3` (graph enrichment), `M4` (hypotheses), `M5` (predictive/campaign/attack-path reasoning),
and `M6` (governed response recommendation). It must later define performance, scalability,
backpressure, idempotency, duplicate/out-of-order/late-event handling, reprocessing, recovery,
HA/DR, retention, load/soak/chaos tests, tenant isolation, auditability, explainability and
fail-closed degradation. No row claims any of these are implemented.

The canonical registry and gate are located in
[`docs/governance/cyberdefense`](../governance/cyberdefense/).
