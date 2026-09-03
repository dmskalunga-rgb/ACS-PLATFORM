# ACS Cyberdefense Dependency Graph and Implementation Waves

Status: `CANONICAL_FROZEN_GOVERNANCE_BASELINE`

## Graph semantics

An arrow means “requires a governed, usable contract from.” The graph is architectural
planning evidence, not authorization to build a downstream capability.

```text
ACS-XCAP-001 Identity/Tenant/Trusted Context ─┐
ACS-XCAP-002 Authorization/Policy ────────────┼─> all operational capabilities
ACS-XCAP-004 Event/Integration Fabric ────────┤
ACS-XCAP-008 Audit/Compliance/Governance ─────┘

XCAP-004 + XCAP-008 ─> XCAP-005 Evidence/Custody
XCAP-005 + XCAP-004 ─> XCAP-006 Detection/Correlation
XCAP-005 + authoritative domain data ─> XCAP-007 Knowledge/Attack Graph
ADR-0008 AI Gateway ─> XCAP-003 Cognitive AI Core as an independently transversal foundation
XCAP-003 + XCAP-006 and/or XCAP-007 ─> applicable cyber-AI use cases and later Fusion maturity
XCAP-004 + XCAP-002 + XCAP-008 ─> XCAP-010 Notification/Case
authorized data products + XCAP-008 ─> XCAP-009 Reporting/Intelligence
XCAP-004 + XCAP-005 + XCAP-008 ─> XCAP-011 Fusion M0
XCAP-011 Fusion M0 + canonical CYB-001 asset/entity authority ─> XCAP-011 Fusion M1
XCAP-006 ─> XCAP-011 Fusion M2; XCAP-007 ─> Fusion M3; XCAP-003 ─> Fusion M4+
XCAP-009 + XCAP-010 ─> applicable Fusion reporting/case outputs

XCAP-011 ─> governed cross-domain enrichment for CYB-013, CYB-017, CYB-019,
CYB-022, CYB-024, CYB-025 and other applicable operational capabilities
001/002/003/004/005/006/007/008/009/010 ─> ACS-CYB-024 SOC Command Center
001/002/003/004/005/006/007/008/009/010 ─> ACS-CYB-025 Executive Intelligence
```

## Initial implementation waves

| Wave | Scope                                                                                                                                                                                | Entry condition                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Registry, Architecture Gate and reuse assessment for XCAP-001, 002, 004 and 008                                                                                                      | Confirm existing ACS contracts, ownership and gaps; no duplicate foundation.                                                                          |
| 1A   | XCAP-005 Evidence + XCAP-004 integration substrate + XCAP-011 Fusion M0                                                                                                              | Approve evidence, contracts, schemas and provenance interfaces; do not create entity authority in Fusion.                                             |
| 1B   | CYB-001 Asset Discovery & Cyber Asset Inventory                                                                                                                                      | Asset ownership, connector trust, tenant/RLS, evidence and audit contracts pass under an approved DoR.                                                |
| 1C   | XCAP-011 Fusion M1                                                                                                                                                                   | Use the available canonical CYB-001 asset/entity authority for normalization and provenance.                                                          |
| 2A   | XCAP-003 cyber-use contract, XCAP-006 Correlation, XCAP-009 Reporting and XCAP-010 Notification/Case                                                                                 | Stage and validate each independently governed transversal prerequisite before its operational consumers. XCAP-003 remains independently transversal. |
| 2B   | XCAP-007 Knowledge/Attack Graph                                                                                                                                                      | Build on available authoritative CYB-001 data and XCAP-005 evidence; validate graph authority before graph consumers.                                 |
| 2C   | XCAP-011 Fusion M2/M3/M4 entry                                                                                                                                                       | Advance only after XCAP-006, XCAP-007 and XCAP-003 are independently usable for the applicable maturity stage.                                        |
| 3    | CYB-002 Exposure, CYB-003 Vulnerability, CYB-004 Configuration, CYB-005 Identity Security, CYB-006 NDR, CYB-007 Endpoint, CYB-010 CTI, CYB-011 IOC and CYB-012 Detection Engineering | Required XCAP-003/006/007/009/010 contracts are already available as applicable; connector, event, observable and evidence contracts pass.            |
| 4    | CYB-008 SIEM, CYB-009 UEBA, CYB-013 Hunting, CYB-014 Malware, CYB-015 Sandbox and CYB-016 Attack/Exposure Graph                                                                      | Correlation, AI, graph, evidence, retention and external-analysis containment prerequisites are already available.                                    |
| 5    | CYB-017 Incident, CYB-018 Forensics and CYB-019 SOAR                                                                                                                                 | Case, audit, evidence, reporting and server-authorized execution controls pass.                                                                       |
| 6    | CYB-020 Containment after CYB-019; CYB-021 Recovery after CYB-017                                                                                                                    | Operational prerequisites are explicitly available; destructive action remains human-governed, audited and fail-closed.                               |
| 7    | CYB-022 Risk, CYB-023 Assurance, CYB-024 SOC and CYB-025 Executive Intelligence                                                                                                      | Underlying authoritative data products and XCAP-003/006/007/009/010/011 governance are already available as applicable.                               |

## Cycle analysis

No prerequisite cycle is accepted. `SOC Command Center` and `Cyberdefense Operational &
Executive Intelligence` are terminal aggregators, not prerequisites of the capabilities they
present. `SOAR` may consume detections/cases and drive authorized execution, but it is not a
prerequisite for evidence ingestion or detection creation. Any proposed feedback loop must use
versioned events and be documented as a bounded runtime interaction, not a dependency cycle.

## Gaps that block wave entry

- Platform-wide evidence/chain-of-custody contract is not yet approved; it is a joint prerequisite for the first operational candidate, CYB-001.
- Fusion maturity is incremental: `M0` contracts/schemas, `M1` entity normalization/provenance, `M2` deterministic correlation, `M3` graph enrichment, `M4` hypothesis generation, `M5` predictive/campaign/attack-path reasoning, and `M6` governed response recommendation. CYB-001 follows M0 and supplies the canonical asset/entity authority required to advance Fusion to M1; Fusion must not invent that authority.
- Detection/correlation and knowledge/attack graph contracts are not yet approved.
- Reporting/intelligence and notification/case contracts are not yet approved.
- Named data owners, retention rules, connector trust policies and production readiness evidence
  remain capability-specific governance inputs.
