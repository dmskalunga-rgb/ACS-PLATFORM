# ACS Cyberdefense Capability Registry

Status: `CANONICAL_FROZEN_GOVERNANCE_BASELINE`
Authority source: the canonically frozen [Cyberdefense root subordinate authority](../../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md), the ACS Enterprise v5.3 baseline, and accepted ACS ADRs. This governance authority authorizes no implementation.
Scope: governance only; this registry authorizes no implementation, schema, service, UI, identity, or runtime change.

## Purpose and classification

This is the single ACS registry for future cyberdefense capabilities. It does not define
microservices, a parallel IAM system, a parallel tenant model, a separate AI core, an
independent graph, or a separate evidence/reporting store.

| Class | Meaning |
| --- | --- |
| `TRANSVERSAL_CAPABILITY` | A reusable ACS platform capability consumed by authorized domains. |
| `OPERATIONAL_CYBERDEFENSE_CAPABILITY` | A governed cyberdefense domain capability that composes transversal ACS capabilities. |

All records are `GOVERNANCE_REGISTERED_NOT_IMPLEMENTATION_AUTHORIZED` until the
`CYBERDEFENSE_ARCHITECTURE_GATE` is satisfied for a specific implementation proposal.

## Binding capability contract

Every registry record below is bound to this contract. A proposal must replace each
`GAP` with approved, capability-specific evidence before it can pass the architecture gate.

| Contract field | Required definition / existing ACS boundary |
| --- | --- |
| Identity and tenant boundary | Validated OIDC identity and canonical ACS active membership; tenant context is server-authoritative (ADR-0011 and ADR-0013). |
| Authorization model | Server-side, explicit ACS authorization; no Keycloak realm-role substitution. |
| Data ownership | Named domain owner and authoritative source are required; otherwise `GAP`. |
| Events produced/consumed | Versioned contract through the ACS Event Foundation (ADR-0006); otherwise `GAP`. |
| Evidence contract | Immutable, tenant-bound evidence identity, retention and chain-of-custody are required; current platform-wide model is `GAP`. |
| Audit | Append-only security/operation audit with transaction coupling where a mutation exists. |
| AI integration | Existing AI Gateway boundary only (ADR-0008); explainability/evidence requirements must be defined. |
| Correlation and knowledge graph | Reuse the transversal correlation/graph model; current concrete contracts are `GAP`. |
| Reporting and notification/case integration | Reuse approved ACS reporting and event/case boundaries; current concrete contracts are `GAP`. |
| Observability | Use ACS observability standards and bounded telemetry (ADR-0009). |
| External integrations | Explicit connector trust, data classification, ingestion and failure behavior are required. |
| Dependencies | Must be listed in the capability proposal and validated against the dependency graph. |
| Fail-closed behavior | Required for identity, tenant, authorization, evidence integrity and security-impacting execution. |
| RLS requirement | A tenant-scoped capability must define tables/functions, least-privilege principals, FORCE RLS analysis and cross-tenant negative proof; otherwise `TBD_BY_GOVERNED_DOR`. |
| Retention requirement | Evidence, audit, event and operational-data retention/classification rules are required; otherwise `GAP`. |
| DoR / DoD | Approved capability-specific DoR, DoD, positive acceptance, negative/security acceptance and production readiness evidence are required. |

For avoidance of doubt, every `ACS-CYB` record explicitly reserves all of the following
until its governed DoR defines them: `TENANT_BOUNDARY`, `IDENTITY_REQUIREMENT`,
`AUTHORIZATION_REQUIREMENT`, `RLS_REQUIREMENT`, `EVENTS_PRODUCED`, `EVENTS_CONSUMED`,
`AUDIT_REQUIREMENT`, `EVIDENCE_CONTRACT`, `AI_CORE_INTEGRATION`,
`CORRELATION_INTEGRATION`, `KNOWLEDGE_GRAPH_INTEGRATION`, `REPORTING_INTEGRATION`,
`CASE_ORCHESTRATION_INTEGRATION`, `OBSERVABILITY_REQUIREMENT`, `EXTERNAL_CONNECTORS`,
`CONNECTOR_TRUST`, `RETENTION_REQUIREMENT`, `FAIL_CLOSED_RULES`, `DOR`, `DOD`,
`POSITIVE_ACCEPTANCE`, `NEGATIVE_SECURITY_ACCEPTANCE`, `PRODUCTION_READINESS`, and
`COMMERCIAL_READINESS`, and `DATA_OWNERSHIP`. An unset field is
`GAP` or `TBD_BY_GOVERNED_DOR`; it is never an implied design.

Every `ACS-CYB` record also reserves `CYBER_FUSION_INTEGRATION`,
`FUSION_SIGNALS_PRODUCED`, `FUSION_SIGNALS_CONSUMED`, `FUSION_EVIDENCE_PRODUCED`,
`FUSION_EVIDENCE_CONSUMED`, `FUSION_ENTITY_TYPES`, `FUSION_CORRELATION_KEYS`,
`FUSION_CONTEXT_DIMENSIONS`, `FUSION_GRAPH_RELATIONSHIPS`, `FUSION_CONFIDENCE_INPUT`,
`FUSION_HYPOTHESIS_CONTRIBUTION`, `FUSION_ATTACK_PATH_CONTRIBUTION`,
`FUSION_BLAST_RADIUS_CONTRIBUTION`, `FUSION_INCIDENT_CONTRIBUTION`,
`FUSION_RESPONSE_CONTRIBUTION`, `FUSION_EXPLAINABILITY_REQUIREMENT`, and
`FUSION_FAIL_CLOSED_RULES`. `NOT_APPLICABLE` requires capability-specific governed
architectural justification.

## Transversal capability registry

| ID | Capability | State | Initial dependency boundary |
| --- | --- | --- | --- |
| ACS-XCAP-001 | Identity, Tenant & Trusted Context | `EXISTING_ACS_FOUNDATION` | ADR-0007, ADR-0011, ADR-0013 |
| ACS-XCAP-002 | Authorization & Policy Decision | `EXISTING_ACS_FOUNDATION` | ADR-0007, ADR-0012, ADR-0026 |
| ACS-XCAP-003 | Cognitive AI Core | `GAP_ARCHITECTURE_REQUIRED` | Must reuse ADR-0008 AI Gateway |
| ACS-XCAP-004 | Event & Integration Fabric | `EXISTING_ACS_FOUNDATION` | ADR-0006, Event Foundation |
| ACS-XCAP-005 | Evidence & Chain of Custody | `GAP_ARCHITECTURE_REQUIRED` | Audit/evidence extension; no isolated store |
| ACS-XCAP-006 | Detection & Correlation Core | `GAP_ARCHITECTURE_REQUIRED` | Event Fabric and Evidence; graph enrichment is a later consumer/integration, not a prerequisite for core correlation |
| ACS-XCAP-007 | Knowledge / Attack Graph | `GAP_ARCHITECTURE_REQUIRED` | Authoritative domain data and Evidence |
| ACS-XCAP-008 | Audit, Compliance & Governance | `EXISTING_ACS_FOUNDATION_WITH_GAPS` | Audit records, governance catalogs, ADRs |
| ACS-XCAP-009 | Reporting, Analytics & Intelligence | `GAP_ARCHITECTURE_REQUIRED` | Authorized operational data products only |
| ACS-XCAP-010 | Notification, Escalation & Case Orchestration | `GAP_ARCHITECTURE_REQUIRED` | Event Fabric, Authorization, Audit |
| ACS-XCAP-011 | Cognitive Cyber Fusion & Cross-Domain Reasoning | `GAP_ARCHITECTURE_REQUIRED` | M0/M1 use XCAP-004/005/008; later stages consume XCAP-003/006/007/009/010; derives, never replaces, domain truth |

## Transversal maturity assessment

| Capability | Maturity | Evidence boundary |
| --- | --- | --- |
| ACS-XCAP-001 | `EXISTING` | Phase 1 identity, active membership and trusted tenant context. |
| ACS-XCAP-002 | `EXISTING` | Server-side authorization and governed dual-control foundation. |
| ACS-XCAP-003 | `PARTIAL` | AI Gateway boundary exists; no cognitive-cyber contract exists. |
| ACS-XCAP-004 | `EXISTING` | Event Foundation and transactional delivery contracts exist. |
| ACS-XCAP-005 | `GAP` | No approved platform-wide cyber evidence/custody contract. |
| ACS-XCAP-006 | `GAP` | No approved cyber detection/correlation contract. |
| ACS-XCAP-007 | `GAP` | No approved knowledge/attack graph authority. |
| ACS-XCAP-008 | `PARTIAL` | Audit, observability and governance primitives exist; cyber compliance model is not defined. |
| ACS-XCAP-009 | `GAP` | No approved cyber reporting/data-product architecture. |
| ACS-XCAP-010 | `GAP` | No approved notification/escalation/case orchestration contract. |
| ACS-XCAP-011 | `GAP` | First-class Fusion governance is defined; no implementation contract or runtime exists. |

## ACS-XCAP-011 Cognitive Cyber Fusion & Cross-Domain Reasoning contract

`ACS-XCAP-011` is a `TRANSVERSAL_CAPABILITY`. It is distinct from `ACS-XCAP-003`
(AI/model execution and cognitive primitives), `ACS-XCAP-006` (deterministic detection
and correlation), and `ACS-XCAP-007` (graph authority and relationship representation).
It owns governed cross-domain evidence/signal/context fusion, entity resolution, cyber
situation synthesis, hypothesis construction and derived-intelligence reasoning.

Its contract reserves multi-source signal fusion, cross-domain evidence fusion, entity
resolution/linking/deduplication, observable normalization, asset/identity/threat/
vulnerability/behavior/network/endpoint/cloud context fusion, temporal/topological/
cross-capability correlation, source/evidence/authorization/tenant provenance, confidence
and source-trust weighting, hypothesis generation/refinement/rejection, attack-path/
blast-radius/lateral-movement/campaign reasoning, risk contextualization, incident/case
enrichment, evidence-gap identification, next-best investigation action, governed response
recommendation, explainability and auditability.

The reserved canonical transformation is:

```text
RAW_EVIDENCE → NORMALIZED_OBSERVABLE → CORRELATED_SIGNAL → FUSED_CONTEXT
→ HYPOTHESIS → DECISION_OR_RECOMMENDATION
```

Original evidence is preserved; trace-back, provenance, confidence, explainability and audit
are mandatory. Assertions must be classified as `FACT`, `OBSERVATION`, `CORRELATION`,
`INFERENCE`, `HYPOTHESIS`, `PREDICTION`, or `RECOMMENDATION`. High-impact outcomes require
human review. Autonomous destructive response is prohibited unless separately governed.

Fusion is tenant-bound, has no client tenant authority, prohibits cross-tenant fusion by
default, and reuses existing ACS identity, server-side authorization, RLS/FORCE RLS, Event
Foundation, transactional outbox, audit, observability, AI Gateway and commercial boundaries.
It creates no parallel AI, evidence, graph, reporting, identity, tenant or authorization system.

## Operational cyberdefense capability registry

| ID | Capability | State | Required transversal dependencies |
| --- | --- | --- | --- |
| ACS-CYB-001 | Asset Discovery & Cyber Asset Inventory | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 008 |
| ACS-CYB-002 | External Attack Surface Management | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 007, 009 |
| ACS-CYB-003 | Vulnerability Management | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 007, 009 |
| ACS-CYB-004 | Secure Configuration & Posture Management | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 009 |
| ACS-CYB-005 | Identity Threat Detection & Protection | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 008, 010 |
| ACS-CYB-006 | Network Detection & Response | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 007, 010 |
| ACS-CYB-007 | Endpoint Detection / EDR-XDR Integration | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 007, 010 |
| ACS-CYB-008 | SIEM & Security Analytics | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 007, 009, 010 |
| ACS-CYB-009 | UEBA | `GOVERNANCE_REGISTERED` | 001, 002, 003, 004, 005, 006, 007, 009 |
| ACS-CYB-010 | Cyber Threat Intelligence | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 007, 008, 009 |
| ACS-CYB-011 | IOC / Observable Management | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 007, 008 |
| ACS-CYB-012 | Detection Engineering | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 008 |
| ACS-CYB-013 | Threat Hunting | `GOVERNANCE_REGISTERED` | 001, 002, 003, 004, 005, 006, 007, 008 |
| ACS-CYB-014 | Malware Analysis | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 007, 008 |
| ACS-CYB-015 | Sandbox & Dynamic Analysis | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 008, 010 |
| ACS-CYB-016 | Attack / Exposure Graph | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 006, 007, 009 |
| ACS-CYB-017 | Incident Management | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 008, 009, 010 |
| ACS-CYB-018 | Digital Forensics | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 008, 009, 010 |
| ACS-CYB-019 | SOAR / Response Orchestration | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 008, 010 |
| ACS-CYB-020 | Containment & Eradication | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 008, 010, 019 |
| ACS-CYB-021 | Recovery & Cyber Resilience | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 008, 009, 010, 017 |
| ACS-CYB-022 | Cyber Risk & Security Posture | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 007, 008, 009 |
| ACS-CYB-023 | Continuous Assurance & Compliance | `GOVERNANCE_REGISTERED` | 001, 002, 004, 005, 008, 009, 010 |
| ACS-CYB-024 | SOC Command Center | `GOVERNANCE_REGISTERED` | 001–010 |
| ACS-CYB-025 | Cyberdefense Operational & Executive Intelligence | `GOVERNANCE_REGISTERED` | 001–010 |

The numeric references in the last column denote `ACS-XCAP` records. References to
`019` or `017` in that column are operational capability dependencies and are elaborated
in the dependency graph; they do not create a circular prerequisite for the foundational waves.

## Intended commercial-boundary relationship

This classification identifies future policy/entitlement integration only. It does not create
pricing, billing, metering or entitlement behavior.

| Operational capability | Commercial integration |
| --- | --- |
| ACS-CYB-001 | `FUTURE_POLICY` |
| ACS-CYB-002 | `FUTURE_POLICY` |
| ACS-CYB-003 | `FUTURE_POLICY` |
| ACS-CYB-004 | `FUTURE_POLICY` |
| ACS-CYB-005 | `FUTURE_POLICY` |
| ACS-CYB-006 | `FUTURE_POLICY` |
| ACS-CYB-007 | `FUTURE_POLICY` |
| ACS-CYB-008 | `FUTURE_POLICY` |
| ACS-CYB-009 | `FUTURE_POLICY` |
| ACS-CYB-010 | `OPTIONAL` |
| ACS-CYB-011 | `OPTIONAL` |
| ACS-CYB-012 | `OPTIONAL` |
| ACS-CYB-013 | `OPTIONAL` |
| ACS-CYB-014 | `OPTIONAL` |
| ACS-CYB-015 | `OPTIONAL` |
| ACS-CYB-016 | `OPTIONAL` |
| ACS-CYB-017 | `FUTURE_POLICY` |
| ACS-CYB-018 | `FUTURE_POLICY` |
| ACS-CYB-019 | `FUTURE_POLICY` |
| ACS-CYB-020 | `FUTURE_POLICY` |
| ACS-CYB-021 | `FUTURE_POLICY` |
| ACS-CYB-022 | `OPTIONAL` |
| ACS-CYB-023 | `OPTIONAL` |
| ACS-CYB-024 | `FUTURE_POLICY` |
| ACS-CYB-025 | `FUTURE_POLICY` |

If a future capability needs Plan, Subscription, Entitlement or Usage/Metering integration,
its DoR must name the existing commercial authority and retain its explicit lifecycle boundaries.

## Deliberate semantic separations

| Concern pair | Separation |
| --- | --- |
| XCAP-006 Detection & Correlation / CYB-008 SIEM | The former is shared correlation infrastructure; SIEM is an operational analytics consumer/producer. |
| XCAP-007 Knowledge / Attack Graph / CYB-016 Attack / Exposure Graph | The former is a transversal knowledge authority; the latter is a cyber operational graph use case. |
| XCAP-005 Evidence / CYB-018 Digital Forensics | Evidence is custody/integrity infrastructure; forensics is an investigative operational domain. |
| XCAP-010 Notification/Case / CYB-017 Incident Management | The former is reusable orchestration; incident management owns incident lifecycle. |
| XCAP-009 Reporting / CYB-025 Executive Intelligence | The former is reporting infrastructure; the latter is a domain intelligence product. |
| XCAP-003 Cognitive AI / CYB-009 UEBA | The former is governed AI integration; UEBA is a specific security analytic capability. |
| CYB-022 Risk/Posture / CYB-023 Continuous Assurance | Posture evaluates risk state; assurance evaluates continuing control/compliance evidence. |
| XCAP-011 Fusion / XCAP-003, 006, 007 | Fusion derives cross-domain intelligence by consuming AI primitives, deterministic correlation and graph representations; it owns none of their underlying authority. |

## Non-duplication and implementation boundary

- One capability can be delivered by one or more bounded changes; one capability is not one microservice.
- Existing ACS commercial, identity, authorization, event, audit, observability and AI boundaries remain authoritative.
- Any missing architecture, owner, contract or acceptance evidence is a `GAP`, not an implementation license.
- `IMPLEMENTED`, `INTEGRATED`, `SECURITY_VERIFIED`, `PRODUCTION_READY`,
  `COMMERCIAL_READY` and `MARKET_READY` are distinct lifecycle states. Feature code alone
  cannot imply a later state.
- This registry must be read with the [Architecture Readiness Gate](ACS-CYBERDEFENSE-ARCHITECTURE-READINESS-GATE.md), [Dependency Graph](ACS-CYBERDEFENSE-DEPENDENCY-GRAPH.md), and [Traceability Matrix](../../traceability/ACS-CYBERDEFENSE-TRACEABILITY-MATRIX.md).

## Fusion-integrated pre-final checkpoint

This is a reviewed pre-final checkpoint with exactly eleven `ACS-XCAP` and twenty-five
`ACS-CYB` records. Cognitive Cyber Fusion is explicitly represented by `ACS-XCAP-011`; it
is not implicitly satisfied by `ACS-XCAP-003` alone. The registry remains unfrozen pending
the final Cyberdefense governance-delta review.
