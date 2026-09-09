# ACS-XCAP-011 — Cognitive Cyber Fusion M0 Policy and Contract Registry

**Status:** `READY_FOR_HUMAN_GOVERNANCE_REVIEW`
**Registry version:** `1.0.0`
**Implementation authorization:** `NOT AUTHORIZED`

## Canonical authority chain

This artifact is subordinate, in order, to:

1. [ACS Master Engineering Specification — Baseline Enterprise v5.3 — Final Consolidated Engineering Edition](../../baseline/ACS-MASTER-ENGINEERING-SPECIFICATION-BASELINE-ENTERPRISE-v5.3-FINAL-CONSOLIDATED-ENGINEERING-EDITION.txt);
2. [ACS Cyberdefense Functional Evolution Governed Architectural Delta Package v1.0 — Frozen](../../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md);
3. [ACS Cyberdefense Capability Registry](ACS-CYBERDEFENSE-CAPABILITY-REGISTRY.md);
4. the `ACS-XCAP-011` capability record in that registry; and
5. this `ACS-XCAP-011 M0 Policy and Contract Registry` artifact.

This artifact is not an independent source of truth and cannot override an upstream authority.

## 1. Contract registrations

| Contract                         | Version | Owner                             | Boundary                                                                                        |
| -------------------------------- | ------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cyberdefense.fusion.request`    | `1.0.0` | XCAP-011                          | Tenant-bound request of governed reasoning over canonical references.                           |
| `cyberdefense.fusion.result`     | `1.0.0` | XCAP-011                          | Derived intelligence with assertion class, provenance, explanation, uncertainty and confidence. |
| `cyberdefense.fusion.reference`  | `1.0.0` | Referenced canonical producer     | Typed opaque reference; never copied producer authority.                                        |
| `cyberdefense.fusion.confidence` | `1.0.0` | XCAP-011 policy                   | Six independent dimensions, value or `UNKNOWN`, computation version and support.                |
| `cyberdefense.fusion.provenance` | `1.0.0` | XCAP-011 with canonical producers | Input/support/contradiction, integrity/trust, policy and applicable model/template lineage.     |

Request and result required fields are normative in the M0 DoR. Unknown required schema versions,
missing authority-bearing context, or unresolved required references fail closed. Compatibility is
explicit and versioned; consumers may not silently coerce a newer schema.

`CONTRACT_IDENTIFIER` is stable semantic identity; `SCHEMA_VERSION` is independently versioned.
The request identity is `cyberdefense.fusion.request` with schema `1.0.0`. The result identity is
`cyberdefense.fusion.result` with schema `1.0.0`. A version suffix is not part of either identifier.

## 2. Policy registrations

| Policy                            | Governed value                                     |
| --------------------------------- | -------------------------------------------------- |
| `M0_SCOPE`                        | `CONTRACT_AND_GOVERNANCE_ONLY`                     |
| `EVIDENCE_AUTHORITY`              | `XCAP005_CANONICAL_REUSE`                          |
| `RAW_EVIDENCE_EMBEDDING_DEFAULT`  | `PROHIBITED`                                       |
| `AI_EXECUTION_AUTHORITY`          | `XCAP003_VIA_AI_GATEWAY`                           |
| `M0_MODEL_EXECUTION`              | `NONE`                                             |
| `CROSS_TENANT_FUSION`             | `PROHIBITED_BY_DEFAULT`                            |
| `FUSION_OUTPUT_IS_AUTHORITY`      | `NO`                                               |
| `RECOMMENDATION_IS_AUTHORIZATION` | `NO`                                               |
| `AUTONOMOUS_RESPONSE`             | `PROHIBITED`                                       |
| `PRODUCTION_THRESHOLDS`           | `TBD_BY_GOVERNED_POLICY`                           |
| `M1_BEFORE_CYB001`                | `BLOCKED`                                          |
| `M2_BEFORE_XCAP006`               | `BLOCKED`                                          |
| `M3_BEFORE_XCAP007`               | `BLOCKED`                                          |
| `MODEL_PROVIDER_TRUST`            | `AI_GATEWAY_ALLOWLIST_AND_VERSION_BOUND`           |
| `PROVENANCE_BINDING`              | `MANDATORY_IMMUTABLE_IN_MEANING_AND_VERSION_BOUND` |
| `CONFIDENCE_DERIVATION`           | `SYSTEM_DERIVED_VERSION_BOUND_NON_AUTHORITATIVE`   |

Proposed permission keys, pending separate human disposition and registration, are
`cyberdefense.fusion.request` and `cyberdefense.fusion.read`. No broad Fusion administrator role is
defined. Permission possession never bypasses reference authorization, tenant scope, policy,
evidence trust, or MPA for a later protected operation.

### Threat-to-control registrations

| Threat                      | M0 control                                                                                                                                                                                                                                | Acceptance           | Future implementation evidence                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `MODEL_PROVIDER_COMPROMISE` | Canonical AI Gateway trust boundary; allowlisted provider/model identity and version bound to policy, provenance and schema; missing, mismatched, revoked or untrusted identity fails closed; no direct-provider or autonomous authority. | `XCAP011-M0-NEG-019` | Gateway adapter/contract tests, provider/model mismatch and revocation tests, bounded audit/telemetry evidence at DoD. |
| `PROVENANCE_TAMPERING`      | Provenance is mandatory and immutable in meaning; result, input, support/contradiction and applicable model/policy versions are bound; missing, malformed, detached or mismatched provenance fails closed.                                | `XCAP011-M0-NEG-020` | Schema/binding tests and tamper/mismatch negative evidence at DoD; no new cryptographic infrastructure implied.        |
| `CONFIDENCE_SPOOFING`       | Confidence is system-derived, version-bound and non-authoritative; malformed/out-of-contract client values are rejected and permitted absence is explicit `UNKNOWN`; AuthorizationPort/MPA remain mandatory.                              | `XCAP011-M0-NEG-021` | Confidence schema/derivation tests, client-spoof rejection and authorization/MPA non-bypass evidence at DoD.           |

## 3. Candidate Event Foundation reservations

| Event                                       | Trigger               | Safe payload boundary                                                                     |
| ------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| `cyberdefense.fusion.requested`             | Accepted request      | Tenant/request/result correlation, mode, schema/policy version, bounded reference counts. |
| `cyberdefense.fusion.completed`             | Valid result          | IDs, status, assertion/hypothesis counts, confidence bands, versions.                     |
| `cyberdefense.fusion.failed`                | Governed failure      | IDs, bounded failure class, dependency class, versions.                                   |
| `cyberdefense.fusion.hypothesis_generated`  | New hypothesis        | Result/hypothesis IDs, class, bounded confidence band, provenance reference.              |
| `cyberdefense.fusion.hypothesis_superseded` | Explicit supersession | Prior/new hypothesis IDs, reason code, provenance reference.                              |

These are registry-level candidates only. M0 authoring does not register runtime schemas or publish
events. Raw evidence, prompts, credentials, secrets, sensitive claims and unrestricted model output
are prohibited.

## 4. Positive acceptance matrix

| ID                   | Deterministic future acceptance                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `XCAP011-M0-POS-001` | A valid same-tenant request validates with every mandatory field and typed reference.                              |
| `XCAP011-M0-POS-002` | One-reference evidence request resolves XCAP-005 identity, integrity and provenance without embedding raw content. |
| `XCAP011-M0-POS-003` | A valid result contains assertion class, explanation, gaps, assumptions, uncertainty and support/contradiction.    |
| `XCAP011-M0-POS-004` | All six confidence dimensions carry value or `UNKNOWN`, computation version and support.                           |
| `XCAP011-M0-POS-005` | Idempotent replay returns the same safe result and produces no duplicate side effect.                              |
| `XCAP011-M0-POS-006` | Candidate lifecycle event validates against Event Foundation envelope and redaction rules.                         |
| `XCAP011-M0-POS-007` | Bounded telemetry reports allowed counts/outcomes without content or high-cardinality secrets.                     |
| `XCAP011-M0-POS-008` | A recommendation remains non-authoritative and requires the protected operation's authorization/MPA path.          |
| `XCAP011-M0-POS-009` | Optional absent correlation/graph references remain valid at M0 and create no implicit authority.                  |
| `XCAP011-M0-POS-010` | Every result reference traces bidirectionally to its canonical owner and originating request.                      |

## 5. Negative and security acceptance matrix

| ID                   | Required denial/control                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XCAP011-M0-NEG-001` | Unauthenticated request denied generically.                                                                                                                                  |
| `XCAP011-M0-NEG-002` | Inactive/no membership denied.                                                                                                                                               |
| `XCAP011-M0-NEG-003` | Missing request/read permission denied through AuthorizationPort.                                                                                                            |
| `XCAP011-M0-NEG-004` | Client tenant spoofing or cross-tenant reference denied without existence disclosure.                                                                                        |
| `XCAP011-M0-NEG-005` | Unauthorized canonical reference denied.                                                                                                                                     |
| `XCAP011-M0-NEG-006` | Missing evidence/provenance or failed integrity rejected.                                                                                                                    |
| `XCAP011-M0-NEG-007` | Raw evidence embedding without governed exception rejected.                                                                                                                  |
| `XCAP011-M0-NEG-008` | Prompt injection in evidence is treated as data and cannot alter system/tool policy.                                                                                         |
| `XCAP011-M0-NEG-009` | Poisoned telemetry/false IOC cannot be promoted without provenance and trust validation.                                                                                     |
| `XCAP011-M0-NEG-010` | Fabricated or hallucinated entity relationship cannot become canonical entity truth.                                                                                         |
| `XCAP011-M0-NEG-011` | Hallucinated IOC cannot be promoted to producer-domain fact.                                                                                                                 |
| `XCAP011-M0-NEG-012` | Confidence, including high confidence, cannot grant authority.                                                                                                               |
| `XCAP011-M0-NEG-013` | Recommendation cannot authorize or execute response.                                                                                                                         |
| `XCAP011-M0-NEG-014` | Fusion cannot bypass canonical MPA for a protected operation.                                                                                                                |
| `XCAP011-M0-NEG-015` | Secrets, raw evidence, prompts or unrestricted output cannot enter events/telemetry/audit.                                                                                   |
| `XCAP011-M0-NEG-016` | Direct provider SDK/model call or parallel AI platform is rejected architecturally.                                                                                          |
| `XCAP011-M0-NEG-017` | Parallel evidence/correlation/graph/event/audit/authorization authority is rejected.                                                                                         |
| `XCAP011-M0-NEG-018` | M1 implementation before canonical CYB-001 asset/entity authority is rejected.                                                                                               |
| `XCAP011-M0-NEG-019` | Missing, mismatched, revoked or untrusted provider/model identity is rejected at the canonical AI Gateway boundary without direct-provider fallback or autonomous authority. |
| `XCAP011-M0-NEG-020` | Missing, malformed, detached or mismatched version-bound provenance is rejected and cannot qualify a Fusion result or create authority.                                      |
| `XCAP011-M0-NEG-021` | Client-supplied, malformed or out-of-contract confidence is rejected; permitted absence is explicit `UNKNOWN` and no confidence bypasses AuthorizationPort or MPA.           |

## 6. Failure-injection acceptance matrix

| ID                  | Injected condition                   | Expected outcome                                                 |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `XCAP011-M0-FI-001` | AI Gateway unavailable               | Bounded dependency failure; no partial/authoritative result.     |
| `XCAP011-M0-FI-002` | Model unavailable                    | Fail closed; no direct-provider fallback.                        |
| `XCAP011-M0-FI-003` | Timeout                              | Bounded timeout result; no autonomous action.                    |
| `XCAP011-M0-FI-004` | Malformed result                     | Schema rejection; no event claiming completion.                  |
| `XCAP011-M0-FI-005` | Unsupported schema version           | Compatibility failure before processing.                         |
| `XCAP011-M0-FI-006` | Policy-version mismatch              | Fail closed with bounded policy reason.                          |
| `XCAP011-M0-FI-007` | Canonical dependency unavailable     | Required-reference resolution fails closed.                      |
| `XCAP011-M0-FI-008` | Insufficient/unknown confidence      | Explicit uncertainty/gap or governed refusal; never authority.   |
| `XCAP011-M0-FI-009` | Stale context snapshot               | Rejected or explicitly non-current under policy.                 |
| `XCAP011-M0-FI-010` | Exact replay                         | Deterministic idempotent outcome without duplicate event/result. |
| `XCAP011-M0-FI-011` | Divergent idempotency reuse          | Conflict rejected.                                               |
| `XCAP011-M0-FI-012` | Event/outbox or audit append failure | Whole applicable transaction rolls back; no split state.         |

`POSITIVE_ACCEPTANCE_COUNT = 10`
`NEGATIVE_SECURITY_ACCEPTANCE_COUNT = 21`
`FAILURE_INJECTION_ACCEPTANCE_COUNT = 12`
`IMPLEMENTATION = NONE`
