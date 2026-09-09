# ACS-XCAP-011 — Cognitive Cyber Fusion & Cross-Domain Reasoning M0 Definition of Ready

**Status:** `READY_FOR_HUMAN_GOVERNANCE_REVIEW`
**Capability:** `ACS-XCAP-011`
**Maturity:** `M0_CONTRACT_AND_GOVERNANCE_ONLY`
**Implementation authorization:** `NOT AUTHORIZED`

## Canonical authority chain

This artifact is subordinate, in order, to:

1. [ACS Master Engineering Specification — Baseline Enterprise v5.3 — Final Consolidated Engineering Edition](../baseline/ACS-MASTER-ENGINEERING-SPECIFICATION-BASELINE-ENTERPRISE-v5.3-FINAL-CONSOLIDATED-ENGINEERING-EDITION.txt);
2. [ACS Cyberdefense Functional Evolution Governed Architectural Delta Package v1.0 — Frozen](../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md);
3. [ACS Cyberdefense Capability Registry](../governance/cyberdefense/ACS-CYBERDEFENSE-CAPABILITY-REGISTRY.md);
4. the `ACS-XCAP-011` capability record in that registry; and
5. this `ACS-XCAP-011 M0 Definition of Ready` artifact.

This artifact is not an independent source of truth and cannot override an upstream authority.

## 1. Authority and purpose

This DoR is subordinate to the ACS Master Engineering Specification v5.3, the frozen
Cyberdefense authority, Capability Registry, Architecture Readiness Gate, Dependency Graph,
Cyberdefense RTM, ADR-0006/0007/0008/0009/0011/0012/0013/0026, canonical XCAP-005 Evidence
and Chain of Custody, and canonical platform MPA governance/runtime. It authorizes no runtime.

M0 defines only versioned Fusion request/result contracts, reference-only integrations,
provenance, confidence, uncertainty, explainability, failure semantics, ports, candidate events,
bounded observability, acceptance, and traceability.

`M0_BEFORE_CYB001 = ALLOWED`
`M1_BEFORE_CYB001 = BLOCKED`

## 2. Frozen boundary

M0 excludes runtime implementation, persistence, entity normalization or ownership, asset
authority, operational correlation, graph storage, model execution, direct AI-provider access,
autonomous response, CYB-001, production AI, and claims of complete cross-domain intelligence.
It may define typed references, but cannot create parallel evidence, AI, correlation, graph,
event, audit, authorization, identity, or tenant authorities.

| Boundary           | Canonical authority                             | M0 rule                                                                                                    |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Evidence           | XCAP-005                                        | Reference only; raw mutation/custody bypass prohibited; durable derivation uses XCAP-005.                  |
| AI/model execution | XCAP-003 and AI Gateway                         | XCAP-011 orchestrates Fusion; M0 performs no model execution or direct provider call.                      |
| Correlation        | XCAP-006                                        | Optional typed references only; required before M2.                                                        |
| Graph              | XCAP-007                                        | Optional typed references only; required before M3.                                                        |
| Identity/tenant    | OIDC, ACTIVE membership, trusted server context | Client fields never establish authority; cross-tenant Fusion denied by default.                            |
| Authorization      | `AuthorizationPort`                             | Proposed permissions are `cyberdefense.fusion.request` and `.read`; registration/assignment is later work. |
| Critical action    | Canonical MPA plus operation owner              | Fusion recommendation is neither authorization nor execution.                                              |
| Events             | Event Foundation                                | Candidate contracts only; no parallel publication mechanism.                                               |
| Audit/telemetry    | Canonical audit and observability               | Bounded metadata only; content and secrets prohibited.                                                     |

## 3. Governed request contract

The stable request contract identifier is `cyberdefense.fusion.request`; its initial
`schema_version` is `1.0.0`. That contract MUST contain:

- `schema_version`, `tenant_id`, `fusion_request_id`, `request_id`, `correlation_id`;
- `reasoning_purpose`, `requested_reasoning_mode`, `policy_version`;
- typed arrays `evidence_references`, `observable_references`, `entity_references`,
  `correlation_references`, and `graph_references`;
- optional typed `case_reference`, `time_window`, and `context_snapshot_reference`.

Every reference is tenant-bound, authorized, provenance-aware, integrity-aware, and resolved
through its canonical owner. `tenant_id` and authority-bearing context are server-derived or
canonically validated. A required unavailable/unsupported dependency fails closed. Raw evidence
embedding is prohibited by default.

## 4. Governed result contract

The stable result contract identifier is `cyberdefense.fusion.result`; its initial
`schema_version` is `1.0.0`. That contract MUST contain `schema_version`, `fusion_result_id`,
originating request identity, `status`, generated timestamp, contract/policy versions, assertions,
hypotheses, supporting and contradicting references, cross-domain assertions, explanation,
evidence gaps, assumptions, recommended investigation actions, optional response candidates,
uncertainty, confidence dimensions, and provenance.

Allowed assertion classes are `FACT`, `OBSERVATION`, `CORRELATION`, `INFERENCE`, `HYPOTHESIS`,
`PREDICTION`, and `RECOMMENDATION`. Derived output never silently becomes producer-domain truth.

`FUSION_OUTPUT_IS_AUTHORITY = NO`
`RECOMMENDATION_IS_AUTHORIZATION = NO`
`FUSION_CAN_EXECUTE_RESPONSE = NO`

## 5. Provenance, confidence, and explainability

Every valid result traces input evidence and canonical domain references; XCAP-005 integrity,
source trust and derivation state; model/provider, model version and prompt/template version when
applicable; reasoning-policy and confidence-computation versions; generation time; and supporting
and contradicting references. An untraceable result fails closed.

Provenance is mandatory, immutable in meaning and version-bound to the result, inputs,
supporting/contradicting references and applicable model/policy versions. Missing, malformed,
detached, mismatched or tampered provenance fails closed. M0 does not introduce signatures, PKI or
KMS.

Confidence remains multidimensional: `MODEL_CONFIDENCE`, `EVIDENCE_SUFFICIENCY`, `SOURCE_TRUST`,
`CORRELATION_STRENGTH`, `HYPOTHESIS_CONFIDENCE`, and `OPERATIONAL_DECISION_CONFIDENCE`. Each has a
value or `UNKNOWN`, a policy/computation version, and supporting references. No confidence value
grants authority. Production thresholds remain `TBD_BY_GOVERNED_POLICY`.

Confidence is system-derived under governed computation/policy versions. Client-supplied,
malformed or out-of-contract confidence is rejected; permitted absence is explicit `UNKNOWN`.

Every result explains why each assertion exists, its supporting/contradicting inputs, contributing
domains, missing evidence, assumptions, and remaining uncertainty. “AI says so” is invalid.

## 6. Threat and privacy controls

Evidence content is data, never system instruction, tool authority, or authorization. The future
implementation must isolate untrusted content, validate provenance/integrity/source trust, and
resist prompt injection, poisoned telemetry, false IOC injection, fabricated relationships,
hallucinated entity/IOC promotion, and cross-tenant inference. Secrets to models and raw evidence
in ordinary logs/events are prohibited by default. Data minimization applies to every request,
result, event, audit record, and telemetry signal.

Later model-mediated results must bind an allowlisted provider/model identity and version through
the canonical AI Gateway. Missing, mismatched, revoked, untrusted or compromised provider/model
identity fails closed without direct-provider fallback or autonomous authority.

## 7. Failure and consistency semantics

Authentication, inactive membership, tenant or authorization failure, cross-tenant/unauthorized
reference, missing evidence/provenance, integrity failure, AI Gateway/model unavailability,
timeout, malformed output, schema failure, policy mismatch, dependency outage, insufficient
confidence, stale context, replay, and divergent idempotency all fail closed with bounded reasons.
Idempotent replay may return the same safe result; divergent reuse is rejected. No failure path
can authorize or execute a response.

## 8. Candidate events and observability

Reserved Event Foundation candidates are `cyberdefense.fusion.requested`, `.completed`, `.failed`,
`.hypothesis_generated`, and `.hypothesis_superseded`. Payloads contain bounded identifiers,
versions, state/reason codes, counts and references—not raw evidence, prompts, credentials,
secrets, or unrestricted model responses.

Telemetry may expose latency, reasoning mode, allowlisted provider/model class, bounded outcome,
input-reference/hypothesis counts, confidence bands, dependency degradation, schema failures, and
permitted aggregate token/cost measures. Sensitive or high-cardinality labels are prohibited.

## 9. Readiness gates for future M0 implementation

- this DoR, DoD, registry, ADR, AIDR, SDR, catalogs, RTM and acceptance matrices receive human approval;
- contract versions, owners, compatibility and failure policies are approved;
- proposed permissions receive separate authorization before registration;
- no dependency is represented as implemented unless canonical evidence exists;
- security/privacy threat controls and test evidence plan are accepted; and
- implementation receives a separate explicit authorization.

`IMPLEMENTATION_READY = GOVERNANCE_REVIEW_PENDING`
`IMPLEMENTATION_AUTHORIZED = NO`
