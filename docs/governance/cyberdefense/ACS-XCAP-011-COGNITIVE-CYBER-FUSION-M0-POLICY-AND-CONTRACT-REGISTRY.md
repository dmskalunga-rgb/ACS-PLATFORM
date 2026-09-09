# ACS-XCAP-011 — Cognitive Cyber Fusion M0 Policy and Contract Registry

**Baseline governance status:** `APPROVED_AND_CANONICALLY_INTEGRATED`
**Local closure content:** `CANONICALLY_INTEGRATED_AND_VERIFIED`
**Local closure canonical integration:** `YES`
**Implementation governance:** `CLOSED`
**Implementation readiness:** `IMPLEMENTATION_AUTHORIZATION_READY`
**Implementation authorization:** `NOT AUTHORIZED`
**Runtime status:** `NOT_IMPLEMENTED`
**Closure delta custody:** `CANONICAL_DEVELOP`
**Registry version:** `1.0.0`

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

### 1.1 Normative scalar and collection rules

- UUID fields use lowercase RFC 4122 textual form and reject nil UUIDs.
- Timestamps use RFC 3339 UTC with a terminal `Z`; normalization converts an equivalent offset to
  UTC before hashing or serialization.
- Human-readable bounded strings are Unicode NFC, trimmed, reject control characters, and retain
  case unless an enum says otherwise.
- Enum values are uppercase ASCII and unknown values fail with `SCHEMA_INVALID`.
- Arrays preserve input order, reject duplicate reference identity, and use inclusive bounds.
- Objects reject unknown fields. Canonical serialization is UTF-8 JSON with lexicographically
  ordered object keys, preserved array order, normalized scalars, and no insignificant whitespace.

### 1.2 Typed reference schema `cyberdefense.fusion.reference@1.0.0`

Every reference is a closed object with these fields:

| Field                  | Type and bounds                                                                             | Presence and authority                             | Validation and failure                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `reference_type`       | enum `EVIDENCE`, `OBSERVABLE`, `ENTITY`, `CORRELATION`, `GRAPH`, `CASE`, `CONTEXT_SNAPSHOT` | required, non-null; client claim                   | Must match its containing field; mismatch is `SCHEMA_INVALID`.                               |
| `canonical_owner`      | enum from the M0 owner table below                                                          | required, non-null; client claim, server validated | Unsupported owner/type combination is `REFERENCE_OWNER_UNSUPPORTED`.                         |
| `resource_id`          | non-nil lowercase RFC 4122 UUID                                                             | required, non-null; client claim                   | Opaque identifier; malformed value is `SCHEMA_INVALID`.                                      |
| `tenant_id`            | non-nil lowercase RFC 4122 UUID                                                             | required, non-null; client equality assertion      | Any mismatch with trusted or resolved tenant is `CROSS_TENANT_REFERENCE`.                    |
| `resource_version`     | discriminator-specific closed value below                                                   | required, non-null; client claim, owner validated  | Mismatch is `REFERENCE_VERSION_MISMATCH`.                                                    |
| `provenance_reference` | non-nil lowercase RFC 4122 UUID                                                             | required for `EVIDENCE`; prohibited otherwise      | Missing/mismatch is `REFERENCE_PROVENANCE_INVALID`; prohibited presence is `SCHEMA_INVALID`. |

The M0 owner and version allowlist is closed:

| Discriminator      | Allowed owner at M0    | `resource_version` semantics                                      | Non-empty support state |
| ------------------ | ---------------------- | ----------------------------------------------------------------- | ----------------------- |
| `EVIDENCE`         | `ACS-XCAP-005`         | positive decimal integer without leading zero; immutable version  | supported               |
| `CONTEXT_SNAPSHOT` | `ACS-PLATFORM-CONTEXT` | NFC source revision matching `^[A-Za-z0-9._:-]{1,64}$`            | supported               |
| `OBSERVABLE`       | none                   | unavailable until an owner is canonically registered              | unsupported             |
| `ENTITY`           | none                   | unavailable until CYB-001 or another canonical owner is approved  | unsupported             |
| `CORRELATION`      | none                   | unavailable until XCAP-006                                        | unsupported             |
| `GRAPH`            | none                   | unavailable until XCAP-007                                        | unsupported             |
| `CASE`             | none                   | unavailable until XCAP-010 or another canonical owner is approved | unsupported             |

Unsupported discriminator input fails `REFERENCE_OWNER_UNSUPPORTED`; it never creates authority.
`ENTITY` remains opaque/reference-only and establishes no CYB-001 identity, normalization, merge,
deduplication, ownership or asset authority. The deterministic resolution precedence is:

1. malformed object/type/version → `SCHEMA_INVALID`;
2. disallowed owner/discriminator → `REFERENCE_OWNER_UNSUPPORTED`;
3. canonical resolver unavailable → `REFERENCE_OWNER_UNAVAILABLE`;
4. tenant mismatch → `CROSS_TENANT_REFERENCE`;
5. missing canonical-owner read authority → `REFERENCE_UNAUTHORIZED`;
6. authorized same-tenant absence → `REFERENCE_NOT_FOUND`;
7. version mismatch → `REFERENCE_VERSION_MISMATCH`;
8. evidence integrity other than `VERIFIED` → `REFERENCE_INTEGRITY_FAILED`;
9. evidence provenance other than `VERIFIED` → `REFERENCE_PROVENANCE_INVALID`.

Only the first applicable code is returned. Cross-tenant existence is never disclosed.

### 1.3 Fusion request schema `cyberdefense.fusion.request@1.0.0`

The request is a closed object. Maximum encoded canonical JSON size is 256 KiB. The aggregate
number of entries across the five reference arrays is 1–128; at M0 all are XCAP-005 evidence
references.

| Field                        | Type/domain                                                         | Presence                        | Authority and validation                                                 | Failure                       |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| `schema_version`             | literal `1.0.0`                                                     | required, non-null              | client supplied; exact match, no coercion                                | `SCHEMA_INVALID`              |
| `tenant_id`                  | non-nil UUID                                                        | required, non-null              | server derived; a client value is accepted only as an equality assertion | `TENANT_CONTEXT_INVALID`      |
| `fusion_request_id`          | non-nil UUID                                                        | required, non-null              | server generated                                                         | `SCHEMA_INVALID`              |
| `request_id`                 | non-nil UUID                                                        | required, non-null              | server request context                                                   | `SCHEMA_INVALID`              |
| `correlation_id`             | non-nil UUID                                                        | required, non-null              | server request context or validated canonical parent                     | `SCHEMA_INVALID`              |
| `idempotency_key`            | non-nil lowercase RFC 4122 UUID                                     | required, non-null              | client supplied; bound by the XCAP-011 bounded receipt                   | `IDEMPOTENCY_CONFLICT`        |
| `reasoning_purpose`          | enum `EVIDENCE_REFERENCE_VALIDATION`, `EVIDENCE_METADATA_SYNTHESIS` | required, non-null              | client supplied; exact mode pairing below                                | `SCHEMA_INVALID`              |
| `requested_reasoning_mode`   | enum `REFERENCE_VALIDATION`, `DETERMINISTIC_SYNTHESIS`              | required, non-null              | client supplied; M0 rejects model-mediated modes                         | `SCHEMA_INVALID`              |
| `policy_version`             | literal `1.0.0`                                                     | required, non-null              | M0 governance-contract version; no production policy is implied          | `POLICY_VERSION_MISMATCH`     |
| `evidence_references`        | array of `EVIDENCE` references, 1–128                               | required, non-null              | canonical XCAP-005 resolution; precedence in section 1.2                 | exact reference code          |
| `observable_references`      | empty array at M0                                                   | required, non-null              | any element has no M0 owner                                              | `REFERENCE_OWNER_UNSUPPORTED` |
| `entity_references`          | empty array at M0                                                   | required, non-null              | any element has no M0 owner; no entity authority                         | `REFERENCE_OWNER_UNSUPPORTED` |
| `correlation_references`     | empty array at M0                                                   | required, non-null              | any element requires the unavailable XCAP-006 owner                      | `REFERENCE_OWNER_UNSUPPORTED` |
| `graph_references`           | empty array at M0                                                   | required, non-null              | any element requires the unavailable XCAP-007 owner                      | `REFERENCE_OWNER_UNSUPPORTED` |
| `case_reference`             | prohibited at M0                                                    | optional field must be absent   | any presence has no M0 owner                                             | `REFERENCE_OWNER_UNSUPPORTED` |
| `time_window`                | closed object `{start, end}` of RFC 3339 UTC timestamps             | optional, non-null when present | `start <= end`; production duration limits are policy-owned              | `SCHEMA_INVALID`              |
| `context_snapshot_reference` | context snapshot object below                                       | optional, non-null when present | exact freshness evaluation below                                         | `CONTEXT_STALE`               |

Empty reference arrays are valid individually, but an entirely reference-free request is invalid.
Authentication, ACTIVE membership and `cyberdefense.fusion.request` authorization are evaluated
before reference resolution. Reference failures do not disclose cross-tenant existence.

The purpose/mode allowlist is closed: `EVIDENCE_REFERENCE_VALIDATION` pairs only with
`REFERENCE_VALIDATION`; `EVIDENCE_METADATA_SYNTHESIS` pairs only with
`DETERMINISTIC_SYNTHESIS`. Any other value or mismatched pair is `SCHEMA_INVALID`. Every M0
reasoning, confidence and content-policy version is the literal governance-contract version
`1.0.0`; another well-formed value is `POLICY_VERSION_MISMATCH` and a malformed value is
`SCHEMA_INVALID`. Production thresholds or policies are neither invented nor activated by this
binding.

### 1.4 Context snapshot schema and staleness

`CONTEXT_SNAPSHOT_AUTHORITY = EXISTING_CANONICAL_AUTHORITIES` and `NEW_CONTEXT_PLATFORM = NO`.
The snapshot is a request-scoped, non-persistent projection of the existing authenticated identity,
ACTIVE membership and server-issued tenant context. It creates no generic context service.

The closed projection `cyberdefense.fusion.context-snapshot@1.0.0` contains required non-null:

| Field                | Exact authority and validation rule                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `snapshot_id`        | non-nil UUID equal to the originating server `request_id`                                             |
| `tenant_id`          | non-nil UUID equal to the server-issued trusted tenant                                                |
| `user_id`            | non-nil UUID returned by the canonical tenant-context membership resolution                           |
| `membership_id`      | non-nil UUID returned by the canonical ACTIVE-membership repository                                   |
| `membership_status`  | literal `ACTIVE`                                                                                      |
| `context_permission` | literal `platform.context.read`, already authorized through `AuthorizationPort`                       |
| `source_revision`    | literal `platform-context-request-projection-v1`                                                      |
| `projection_version` | literal `1.0.0`                                                                                       |
| `policy_version`     | literal `1.0.0`                                                                                       |
| `captured_at`        | server request-receipt RFC 3339 UTC timestamp                                                         |
| `valid_until`        | required RFC 3339 UTC timestamp equal to the tenant-context grant expiry and later than `captured_at` |

The server materializes this projection after normal identity, membership, context and permission
resolution. A trusted internal caller may supply the same object only as equality assertions; each
field is revalidated against those existing authorities. Missing/malformed facts are
`SCHEMA_INVALID`; tenant/user/membership/status/permission mismatch is `TENANT_CONTEXT_INVALID`;
revision, projection/policy version, future `captured_at`, or evaluation at/after `valid_until` is
`CONTEXT_STALE`. No caller freshness claim establishes authority and no snapshot is persisted.

### 1.5 Fusion result schema `cyberdefense.fusion.result@1.0.0`

The result is a closed object with maximum canonical JSON size 512 KiB. Unless stated otherwise,
all arrays are required, non-null and may be empty. Text is NFC, trimmed and free of control
characters. M0 accepts only deterministic, non-model-mediated results.

| Field                                                            | Exact type/domain                                                                 | Presence and rule                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `schema_version`                                                 | literal `1.0.0`                                                                   | required, non-null                                                     |
| `fusion_result_id`                                               | non-nil UUID                                                                      | required; server generated                                             |
| `fusion_request_id`, `request_id`, `correlation_id`, `tenant_id` | non-nil UUIDs                                                                     | required; exact originating request/trusted-context bindings           |
| `status`                                                         | enum `COMPLETED`, `REFUSED`, `FAILED`                                             | required                                                               |
| `generated_at`                                                   | RFC 3339 UTC                                                                      | required; server generated                                             |
| `contract_versions`                                              | closed object with request, result, reference, provenance and confidence versions | required; every value literal `1.0.0`                                  |
| `policy_versions`                                                | closed object `{reasoning_policy, confidence_policy, content_policy}`             | required; every value literal `1.0.0`                                  |
| `assertions`                                                     | array of assertion objects, 0–128                                                 | required; `COMPLETED` requires at least one assertion or evidence gap  |
| `hypotheses`                                                     | array of hypothesis objects, 0–64                                                 | required                                                               |
| `cross_domain_assertions`                                        | array of cross-domain assertion objects, 0–64                                     | required                                                               |
| `explanation`                                                    | explanation object                                                                | required                                                               |
| `evidence_gaps`                                                  | array of evidence-gap objects, 0–64                                               | required                                                               |
| `assumptions`                                                    | array of assumption objects, 0–64                                                 | required                                                               |
| `recommended_investigation_actions`                              | array of investigation-action objects, 0–32                                       | required; non-authoritative                                            |
| `response_candidates`                                            | array of response-candidate objects, 0–16                                         | optional; non-null when present and never executable                   |
| `uncertainty`                                                    | uncertainty object                                                                | required                                                               |
| `confidence`                                                     | exactly six unique confidence-dimension objects                                   | required                                                               |
| `provenance`                                                     | provenance object                                                                 | required                                                               |
| `failure_code`                                                   | bounded failure enum or null                                                      | required; null only for `COMPLETED`, non-null otherwise                |
| `classification`                                                 | canonical Event Foundation classification enum                                    | required; server-derived maximum of all inputs, never below `INTERNAL` |

An assertion object contains required `assertion_id` UUID, `assertion_class` enum `FACT`,
`OBSERVATION`, `CORRELATION`, `INFERENCE`, `HYPOTHESIS`, `PREDICTION`, or `RECOMMENDATION`,
`statement` string 1–4096, `supporting_references` array 1–64, `contradicting_references` array
0–64, `explanation` string 1–4096, and `contributing_domains` array of 1–16 unique owner IDs.
`FACT` and `OBSERVATION` require a canonical producer reference; Fusion cannot originate them.

A hypothesis object contains required `hypothesis_id` UUID, `hypothesis_class` enum `INFERENCE` or
`PREDICTION`, `statement` string 1–4096,
`supporting_references` array 1–64, `contradicting_references` array 0–64,
`confidence_dimension` literal `HYPOTHESIS_CONFIDENCE`, and `state` enum `GENERATED` or
`SUPERSEDED`. M0 validates this shape but performs no model-driven hypothesis generation.

A cross-domain assertion has the assertion shape and requires 2–16 unique
`contributing_domains`. An evidence-gap object contains `gap_id` UUID, `description` string
1–2048 and `required_reference_types` array of 1–7 unique reference discriminators. An assumption
contains `assumption_id` UUID, `statement` string 1–2048 and `supporting_references` array 0–32.

An investigation action contains `action_id` UUID, `description` and `rationale` strings 1–2048,
and `required_permission` string 1–128 or null. A response candidate has the same bounded identity
and text plus required `protected_operation` string 1–128 and literal
`authorization_state: NOT_AUTHORIZED`; it cannot represent an approval, MPA consumption or
execution instruction.

The explanation object contains `summary` string 1–4096, `assertion_explanations` array 0–128 of
closed `{assertion_id, rationale}` objects, and `remaining_uncertainty` string 1–4096. Every
assertion ID appears exactly once in `assertion_explanations`. The uncertainty object contains
`level` enum `LOW`, `MEDIUM`, `HIGH`, `UNKNOWN` and `reasons` array of 1–32 strings, each 1–1024.

`REFUSED` and `FAILED` results have empty assertion/hypothesis/action arrays, a non-null bounded
failure code, an explanation and provenance sufficient to identify the request and evaluated
policy without exposing sensitive input. A malformed result is rejected and cannot be normalized
into a success. All nested references are `cyberdefense.fusion.reference@1.0.0`; result structural,
cardinality, enum or unknown-field failure is `MODEL_RESULT_INVALID`, confidence failure is
`CONFIDENCE_INVALID`, provenance failure uses the exact section 1.7 code, and sensitive/untrusted
content failure uses the exact section 2 code. `recommended_investigation_actions.required_permission`
is null or a registered canonical permission key matching `^[a-z][a-z0-9_.]{2,127}$`;
`response_candidates.protected_operation` follows the same pattern and must resolve to a canonical
MPA policy or is `AUTHORIZATION_DENIED`. Every result carries a required top-level `classification`
from the canonical classification enum and may not be lower than any resolved input.

### 1.6 Confidence schema `cyberdefense.fusion.confidence@1.0.0`

The result contains exactly one object for each dimension: `MODEL_CONFIDENCE`,
`EVIDENCE_SUFFICIENCY`, `SOURCE_TRUST`, `CORRELATION_STRENGTH`, `HYPOTHESIS_CONFIDENCE`, and
`OPERATIONAL_DECISION_CONFIDENCE`. Each closed object contains:

- `dimension`: one of the six enum values;
- `state`: `KNOWN` or `UNKNOWN`;
- `value`: decimal number in inclusive range 0–1 when `KNOWN`, otherwise null;
- `computation_version` and `policy_version`: literal `1.0.0` at M0;
- `supporting_references`: array of 0–64 typed references, requiring at least one when `KNOWN`.

For model-free M0, `MODEL_CONFIDENCE` is `UNKNOWN`. Values are system-derived; client-supplied
confidence is rejected with `CONFIDENCE_INVALID`. Duplicate/missing dimensions, NaN/infinity,
out-of-range values, a non-null `UNKNOWN` value, a null `KNOWN` value or missing support for a
known value are invalid. No value or band grants authorization or satisfies MPA.

### 1.7 Provenance schema `cyberdefense.fusion.provenance@1.0.0`

The closed provenance object contains required `derivation_id`, `fusion_request_id`,
`fusion_result_id` and `tenant_id` non-nil UUIDs; arrays `input_bindings` (1–256),
`support_bindings` (0–256) and `contradiction_bindings` (0–256);
`reasoning_policy_version: 1.0.0`; `confidence_computation_version: 1.0.0`; server RFC 3339 UTC
`generated_at`; required null `model_binding`; literal
`canonicalization_version: xcap011-m0-provenance-v1`; and lowercase hexadecimal `binding_sha256`
of exactly 64 characters. Every array preserves normalized request order and rejects duplicate
binding identity.

Each array element is the closed `cyberdefense.fusion.provenance-binding@1.0.0` object:

| Field                         | Type/presence and bounds                                                                       | Authority, validation and failure                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `binding_id`                  | required non-nil UUID                                                                          | server UUIDv5 derived from request ID, binding role and zero-based normalized index; mismatch → `PROVENANCE_INVALID`    |
| `binding_role`                | required enum `INPUT`, `SUPPORT`, `CONTRADICTION`                                              | must match containing array; mismatch → `PROVENANCE_INVALID`                                                            |
| `reference`                   | required non-null `cyberdefense.fusion.reference@1.0.0` object                                 | exact resolved reference; validation uses section 1.2 precedence                                                        |
| `canonical_owner`             | required owner literal allowed for the reference discriminator                                 | server copied from canonical resolver; mismatch → `PROVENANCE_INVALID`                                                  |
| `resolved_tenant_id`          | required non-nil UUID                                                                          | server trusted tenant; mismatch → `CROSS_TENANT_REFERENCE`                                                              |
| `resolved_resource_id`        | required non-nil UUID                                                                          | must equal `reference.resource_id`; mismatch → `PROVENANCE_INVALID`                                                     |
| `resolved_resource_version`   | required positive integer for evidence or 1–64 NFC revision for context snapshot               | exact canonical resolved value; mismatch → `REFERENCE_VERSION_MISMATCH`                                                 |
| `integrity_state`             | required enum `VERIFIED`, `FAILED`, `UNVERIFIABLE`, `NOT_APPLICABLE`                           | XCAP-005 supplies evidence value; context uses `NOT_APPLICABLE`; non-verified evidence → `REFERENCE_INTEGRITY_FAILED`   |
| `provenance_state`            | required enum `VERIFIED`, `INCOMPLETE`, `INVALID`, `TAMPERED`, `UNAVAILABLE`, `NOT_APPLICABLE` | XCAP-005 supplies evidence value; context uses `NOT_APPLICABLE`; non-verified evidence → `REFERENCE_PROVENANCE_INVALID` |
| `source_trust_state`          | required enum `UNTRUSTED`, `VALIDATED`, `TRUSTED`, `NOT_APPLICABLE`                            | XCAP-005 supplies evidence value; context uses `NOT_APPLICABLE`; client values are rejected                             |
| `derivation_state`            | required enum `ORIGINAL`, `DERIVED`, `NOT_APPLICABLE`                                          | XCAP-005 supplies evidence value; context uses `NOT_APPLICABLE`                                                         |
| `derivation_id`               | required nullable non-nil UUID                                                                 | required for `DERIVED`, null otherwise; mismatch → `PROVENANCE_INVALID`                                                 |
| `classification`              | required canonical classification                                                              | server derived without lowering source classification; mismatch → `SENSITIVE_CONTENT_REJECTED`                          |
| `canonicalization_identifier` | required NFC string 1–64                                                                       | evidence literal `xcap005-evidence-metadata-v1`; context literal `platform-context-request-projection-v1`               |
| `projection_contract_version` | required literal `1.0.0`                                                                       | canonical projection contract; mismatch → `PROVENANCE_INVALID`                                                          |
| `resolved_at`                 | required server RFC 3339 UTC timestamp                                                         | not before request receipt or after result `generated_at`; violation → `PROVENANCE_INVALID`                             |

UUIDv5 uses the RFC 4122 URL namespace; its name is
`urn:acs:xcap011:m0:<fusion_request_id>:<binding_role>:<zero_based_index>`. `model_binding` is
strictly null in M0. Later model-mediated binding requires separate governance and the AI Gateway.

Tamper validation removes `binding_sha256`, canonicalizes the remaining provenance object using
the scalar/serialization rules in section 1.1, computes SHA-256 over its UTF-8 bytes and compares
in constant time. Missing provenance is `PROVENANCE_MISSING`; malformed, detached, owner/version,
request/result/tenant or support/contradiction mismatch is `PROVENANCE_INVALID`; hash mismatch is
`PROVENANCE_TAMPERED`; an unsupported canonicalization/version is `PROVENANCE_INVALID`. No new
signature, PKI or KMS authority is created.

## 2. Policy registrations

| Policy                            | Governed value                                        |
| --------------------------------- | ----------------------------------------------------- |
| `M0_SCOPE`                        | `CONTRACT_VALIDATION_AND_BOUNDED_IDEMPOTENCY_RECEIPT` |
| `M0_RUNTIME_PERSISTENCE`          | `BOUNDED_COMMAND_RECEIPT_ONLY`                        |
| `EVIDENCE_AUTHORITY`              | `XCAP005_CANONICAL_REUSE`                             |
| `RAW_EVIDENCE_EMBEDDING_DEFAULT`  | `PROHIBITED`                                          |
| `AI_EXECUTION_AUTHORITY`          | `XCAP003_VIA_AI_GATEWAY`                              |
| `M0_MODEL_EXECUTION`              | `NONE`                                                |
| `CROSS_TENANT_FUSION`             | `PROHIBITED_BY_DEFAULT`                               |
| `FUSION_OUTPUT_IS_AUTHORITY`      | `NO`                                                  |
| `RECOMMENDATION_IS_AUTHORIZATION` | `NO`                                                  |
| `AUTONOMOUS_RESPONSE`             | `PROHIBITED`                                          |
| `PRODUCTION_THRESHOLDS`           | `TBD_BY_GOVERNED_POLICY`                              |
| `M1_BEFORE_CYB001`                | `BLOCKED`                                             |
| `M2_BEFORE_XCAP006`               | `BLOCKED`                                             |
| `M3_BEFORE_XCAP007`               | `BLOCKED`                                             |
| `MODEL_PROVIDER_TRUST`            | `AI_GATEWAY_ALLOWLIST_AND_VERSION_BOUND`              |
| `PROVENANCE_BINDING`              | `MANDATORY_IMMUTABLE_IN_MEANING_AND_VERSION_BOUND`    |
| `CONFIDENCE_DERIVATION`           | `SYSTEM_DERIVED_VERSION_BOUND_NON_AUTHORITATIVE`      |

Approved contract permission keys, pending implementation-time registration, are
`cyberdefense.fusion.request` and `cyberdefense.fusion.read`. No broad Fusion administrator role is
defined. Permission possession never bypasses reference authorization, tenant scope, policy,
evidence trust, or MPA for a later protected operation.

`cyberdefense.fusion.request` authorizes an ACTIVE same-tenant human membership to submit one M0
request through the server-issued tenant context. `cyberdefense.fusion.read` authorizes an ACTIVE
same-tenant human membership to read only a result produced for that tenant and still requires
authorization for every canonical source reference. Neither permits response execution, MPA
approval/consumption, evidence-content read, tenant selection, model invocation or cross-tenant
access. Both are enforced by the existing `AuthorizationPort`; default role assignment is `NONE`.
Future registration uses exactly
`database/migrations/20260909000000_xcap011_cognitive_fusion_m0.sql`, inserting the two keys into
`platform.permissions` with `ON CONFLICT (permission_key) DO NOTHING`. The same ordered migration
creates only the bounded receipt table, least-privilege runtime role/grants, RLS/FORCE RLS policies
and no role assignment.

### Threat-to-control registrations

| Threat                      | M0 control                                                                                                                                                                                                                                | Acceptance           | Future implementation evidence                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `MODEL_PROVIDER_COMPROMISE` | Canonical AI Gateway trust boundary; allowlisted provider/model identity and version bound to policy, provenance and schema; missing, mismatched, revoked or untrusted identity fails closed; no direct-provider or autonomous authority. | `XCAP011-M0-NEG-019` | Gateway adapter/contract tests, provider/model mismatch and revocation tests, bounded audit/telemetry evidence at DoD. |
| `PROVENANCE_TAMPERING`      | Provenance is mandatory and immutable in meaning; result, input, support/contradiction and applicable model/policy versions are bound; missing, malformed, detached or mismatched provenance fails closed.                                | `XCAP011-M0-NEG-020` | Schema/binding tests and tamper/mismatch negative evidence at DoD; no new cryptographic infrastructure implied.        |
| `CONFIDENCE_SPOOFING`       | Confidence is system-derived, version-bound and non-authoritative; malformed/out-of-contract client values are rejected and permitted absence is explicit `UNKNOWN`; AuthorizationPort/MPA remain mandatory.                              | `XCAP011-M0-NEG-021` | Confidence schema/derivation tests, client-spoof rejection and authorization/MPA non-bypass evidence at DoD.           |

### Failure, content-classification and idempotency contracts

The closed M0 failure-code enum is `AUTHENTICATION_REQUIRED`, `MEMBERSHIP_INACTIVE`,
`TENANT_CONTEXT_INVALID`, `AUTHORIZATION_DENIED`, `CROSS_TENANT_REFERENCE`,
`REFERENCE_UNAUTHORIZED`, `REFERENCE_NOT_FOUND`, `REFERENCE_VERSION_MISMATCH`,
`REFERENCE_OWNER_UNAVAILABLE`, `REFERENCE_OWNER_UNSUPPORTED`, `REFERENCE_INTEGRITY_FAILED`,
`REFERENCE_PROVENANCE_INVALID`, `PROVENANCE_MISSING`, `PROVENANCE_INVALID`,
`PROVENANCE_TAMPERED`, `CONFIDENCE_INVALID`, `INSUFFICIENT_CONFIDENCE`,
`CONTEXT_STALE`, `POLICY_VERSION_MISMATCH`, `DEPENDENCY_UNAVAILABLE`, `DEPENDENCY_TIMEOUT`,
`SCHEMA_INVALID`, `REPLAY_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `UNTRUSTED_CONTENT`,
`SENSITIVE_CONTENT_REJECTED`, `MODEL_PROVIDER_UNTRUSTED`, and `MODEL_RESULT_INVALID`. External
mapping is generic: authentication is `401`; authorization, membership, cross-tenant and reference
authorization denial is `403`; authorized same-tenant absence is `404`; replay, idempotency,
version, context and policy conflicts are `409`; schema, integrity, provenance, confidence, content
and model-result/insufficient-confidence rejection is `422`; owner/dependency unavailable is `503`; dependency timeout is
`504`. Unsupported owners are `422`. Responses contain only the bounded code,
request/correlation identifiers and a non-sensitive message.

When XCAP-005 reports its domain code `EVIDENCE_INTEGRITY_FAILED`, the Fusion reference boundary
returns `REFERENCE_INTEGRITY_FAILED`; its provenance-domain failures return
`REFERENCE_PROVENANCE_INVALID`. This translation is one-way and does not redefine XCAP-005.

Untrusted input uses the closed `cyberdefense.fusion.untrusted-content@1.0.0` object:

| Field                  | Exact M0 rule                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `content_class`        | required non-null enum `UNTRUSTED_TEXT`, `STRUCTURED_OBSERVATION`, `EXTERNAL_TELEMETRY`, `POTENTIAL_PROMPT_INJECTION` |
| `source_reference`     | required non-null typed reference; M0 therefore permits only an XCAP-005 evidence reference                           |
| `content_reference`    | required non-null UUID opaque pointer; never inline content                                                           |
| `trust_state`          | required enum `UNTRUSTED`, `VALIDATED`, `TRUSTED`; server-derived from canonical owner                                |
| `instruction_state`    | required literal `DATA_ONLY`; any other value is prohibited                                                           |
| `redaction_state`      | required enum `NOT_REQUIRED`, `REDACTED`, `REJECTED`; server-derived                                                  |
| `classification_state` | required enum `CLASSIFIED`, `UNKNOWN`; server-derived                                                                 |

Unknown fields and nulls are rejected. Payload is always data: it cannot become a
system/developer instruction, tool command, authorization decision, or MPA decision. Raw evidence
content is never embedded. Missing/unknown wrapping, client-derived trust, or non-`DATA_ONLY`
instruction state is `UNTRUSTED_CONTENT`.

The closed `cyberdefense.fusion.content-decision@1.0.0` interface reuses the Event Foundation
classification enum `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`, and
`BOARD_CONFIDENTIAL`. XCAP-005 `RESTRICTED_SECURITY` maps to `RESTRICTED` at the
event/telemetry boundary without lowering its source classification.

| Field                                                                 | Exact M0 rule                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `classification`                                                      | required non-null canonical enum; server-derived highest input classification            |
| `classification_authority`                                            | required enum `ACS-XCAP-005`, `ACS-EVENT-FOUNDATION`; server-derived                     |
| `redaction_required`                                                  | required boolean; server-derived from policy version                                     |
| `redaction_state`                                                     | required enum `NOT_REQUIRED`, `REDACTED`, `REJECTED`                                     |
| `allowed_destination`                                                 | required unique array 1–5 of `FUSION_RESULT`, `MODEL`, `EVENT`, `AUDIT`, `OBSERVABILITY` |
| `model_eligibility`                                                   | required enum `PROHIBITED_M0`                                                            |
| `event_eligibility`, `audit_eligibility`, `observability_eligibility` | required enum `METADATA_ONLY`, `REDACTED`, `PROHIBITED`                                  |
| `policy_version`                                                      | required semantic version, 1–32 characters                                               |

Unknown fields/nulls are rejected. Unknown classification or authority, a destination inconsistent
with eligibility, or failed required redaction is `SENSITIVE_CONTENT_REJECTED`. Logs, events,
audit and telemetry carry bounded metadata only.

The M0 content-decision matrix is closed. `MODEL` is never an allowed destination and
`model_eligibility` is always `PROHIBITED_M0`:

| Canonical classification | `redaction_required` | Required `redaction_state` | Exact `allowed_destination`                        | Event / audit / observability eligibility |
| ------------------------ | -------------------- | -------------------------- | -------------------------------------------------- | ----------------------------------------- |
| `PUBLIC`                 | `false`              | `NOT_REQUIRED`             | `FUSION_RESULT`, `EVENT`, `AUDIT`, `OBSERVABILITY` | all `METADATA_ONLY`                       |
| `INTERNAL`               | `false`              | `NOT_REQUIRED`             | `FUSION_RESULT`, `EVENT`, `AUDIT`, `OBSERVABILITY` | all `METADATA_ONLY`                       |
| `CONFIDENTIAL`           | `true`               | `REDACTED`                 | `FUSION_RESULT`, `EVENT`, `AUDIT`, `OBSERVABILITY` | all `REDACTED`                            |
| `RESTRICTED`             | `true`               | `REDACTED`                 | `FUSION_RESULT`, `EVENT`, `AUDIT`, `OBSERVABILITY` | all `REDACTED`                            |
| `BOARD_CONFIDENTIAL`     | `true`               | `REDACTED`                 | `FUSION_RESULT`, `EVENT`, `AUDIT`, `OBSERVABILITY` | all `REDACTED`                            |

`FUSION_RESULT` contains only the deterministic bounded M0 templates in section 2.1 and opaque
references; `METADATA_ONLY` and `REDACTED` never permit source statements or evidence content.
XCAP-005 `RESTRICTED_SECURITY` maps to `RESTRICTED` while retaining the source classification in
provenance. Any unknown value, client-selected downgrade, missing mandatory redaction, destination
outside the row, or eligibility inconsistent with the row fails `SENSITIVE_CONTENT_REJECTED`.

### 2.1 Deterministic M0 synthesis

`DETERMINISTIC_SYNTHESIS_MODEL_EXECUTION = NO`. Both M0 modes consume only successfully resolved
projection metadata; neither reads evidence bytes nor invokes a model, AI Gateway provider, prompt,
tool, correlation engine or graph engine.

Normalization rejects duplicate `(canonical_owner, tenant_id, resource_id, resource_version)`
identity with `SCHEMA_INVALID`, then sorts evidence references by lowercase `evidence_id` and
ascending `evidence_version`. Context projection, when present, follows evidence bindings.

- `REFERENCE_VALIDATION` with purpose `EVIDENCE_REFERENCE_VALIDATION` creates one `INFERENCE`
  assertion per normalized evidence reference. Its statement is exactly
  `Evidence <evidence_id> version <evidence_version> passed M0 reference validation.` Its support
  contains only that reference; contradictions and contributing domains are empty except for the
  single owner `ACS-XCAP-005`.
- `DETERMINISTIC_SYNTHESIS` with purpose `EVIDENCE_METADATA_SYNTHESIS` creates exactly one
  `INFERENCE` assertion whose statement is
  `M0 metadata synthesis validated <count> governed evidence reference(s).` It supports every
  normalized evidence reference in order, has no contradictions, and has contributing domain
  `ACS-XCAP-005` only. It makes no content or entity claim.

Assertion UUIDs use UUIDv5 with the RFC 4122 URL namespace and name
`urn:acs:xcap011:m0:<fusion_request_id>:assertion:<zero_based_index>`. Explanations repeat the exact
bounded validation facts without content. Hypotheses, cross-domain assertions, assumptions,
investigation actions and response candidates are empty. Evidence gaps are empty after successful
resolution. All six confidence dimensions are `UNKNOWN`, have null value, literal computation and
policy version `1.0.0`, and empty support. Classification is the maximum mapped input
classification, never below `INTERNAL`; uncertainty is `UNKNOWN` with the single reason
`M0 performs deterministic metadata processing without model inference.`

Provenance bindings preserve normalized order and the exact canonical projections. The result
status is `COMPLETED`, `failure_code` is null, and `generated_at` equals the receipt
`completed_at`. Resolution, schema, policy, context, provenance, content or dependency failure
constructs no success result and returns the unique bounded code selected by sections 1–3.

M0 persists only an `ACS_XCAP011_M0_BOUNDED_COMMAND_RECEIPT` in
`cyberdefense.fusion_command_receipts`. Its closed record contains trusted
`tenant_id`, UUID `idempotency_key`, lowercase SHA-256 `request_hash`, literal
`operation: cyberdefense.fusion.request`, request/result/reference schema versions, status enum
`IN_PROGRESS`, `COMPLETED`, `FAILED`, nullable `fusion_request_id`, nullable `fusion_result_id`,
nullable lowercase SHA-256 `result_hash`, nullable bounded `failure_code`, server timestamps
`created_at`, `completed_at`, `expires_at`, and positive integer `row_version`. No Fusion content,
evidence content, prompt, model input/output, hypothesis, graph, correlation, entity, credential or
secret is stored.

The primary key is `(tenant_id, idempotency_key)`. The request hash covers the normalized semantic
request, actor, permission and contract versions, excluding server-generated request/correlation,
Fusion IDs and timestamps. The runtime configuration `ACS_XCAP011_M0_RECEIPT_LIFETIME_SECONDS` is
required and bounded to 300–86400; the server derives `expires_at`. In one database transaction,
insert-or-lock serializes the key. Same key/hash returns the stored identifiers and deterministically
recomputed result only when its hash matches `result_hash`; the initial result uses
`generated_at = completed_at`, and replay reconstructs that same timestamp and the stored
identifiers. A `FAILED` receipt reconstructs only the same bounded failure response from its stored
failure code and timestamps; no result body is retained. Different hash is
`IDEMPOTENCY_CONFLICT`. Concurrent same key/hash yields one execution plus replay; concurrent
different hashes fails closed. Same keys in different tenants are independent. At/after expiry the
old receipt is `REPLAY_CONFLICT`; authorized cleanup may remove it, after which the key begins a new
bounded lifetime. Cleanup never deletes audit. This capability-local authority is not a generic
platform receipt/CAS service.

The table has RLS and FORCE RLS. Dedicated NOLOGIN role `acs_xcap011_fusion` receives only schema
USAGE plus table SELECT/INSERT/UPDATE; a dedicated runtime LOGIN inherits only that role through
`ACS_XCAP011_DATABASE_URL`. Policies require server-issued trusted tenant context and
`cyberdefense.fusion.request` for INSERT/UPDATE and either Fusion permission for SELECT. No table
DELETE is granted. A `SECURITY DEFINER` cleanup function with fixed `search_path`, owned by the
NOLOGIN migration owner, executable only by `acs_xcap011_fusion`, validates trusted tenant context
and deletes only expired receipts in that tenant while recording canonical audit; PUBLIC execution
is revoked, and it neither returns nor deletes audit/outbox rows. Receipt mutation, allowed audit and Event Foundation outbox
append use one PostgreSQL transaction. Cross-tenant same-key rows are isolated by the composite
key and RLS.

FI-012 is a mandatory transactional failure injection: failure at receipt, audit or outbox append
rolls back all three and constructs no success result or event. A bounded failure audit/event may
be written only in a separate canonical transaction after classification. No Fusion result body or
domain state participates in the receipt transaction.

## 3. Final Event Foundation contracts

| Event                                       | Trigger               |
| ------------------------------------------- | --------------------- |
| `cyberdefense.fusion.requested`             | Accepted request      |
| `cyberdefense.fusion.completed`             | Valid result          |
| `cyberdefense.fusion.failed`                | Governed failure      |
| `cyberdefense.fusion.hypothesis_generated`  | New hypothesis        |
| `cyberdefense.fusion.hypothesis_superseded` | Explicit supersession |

All use schema `1.0.0`, producer `acs-platform-api`, the canonical Event Foundation envelope, trusted
server tenant binding, required request/correlation identifiers, and causation equal to the
originating command/event identifier. Classification is the highest input classification and may
never be lower than `INTERNAL`. Raw evidence, prompts, credentials, secrets, sensitive claims and
unrestricted model output are prohibited. An authorized M0 implementation registers and publishes
these schemas only through the canonical Event Foundation. Its bounded receipt transaction must
append the applicable receipt, audit and outbox state atomically; no Fusion result body or other
domain state is persisted.

The Event Foundation envelope fields are exact: `event_id`, `tenant_id`, `correlation_id`, and
`causation_id` are required non-nil UUIDs; `timestamp` is required server RFC 3339 UTC;
`producer` is literal `acs-platform-api`; `schema_version` is literal `1.0.0`; `event_type` is one
of the five names above; `classification` is required canonical enum and is the maximum of
`INTERNAL` and every input classification. `payload` is a closed object with the event-specific
fields below. Unknown fields/nulls are rejected with `SCHEMA_INVALID`.

Every payload requires these exact version fields, each literal `1.0.0`:
`request_schema_version`, `result_schema_version`, `reference_schema_version`,
`provenance_schema_version`, `confidence_schema_version`, `reasoning_policy_version`,
`confidence_policy_version`, and `content_policy_version`. They are server contract/policy facts,
not client authority.

| Event                   | Required closed payload fields                                                                                                                                                                                                                                                                                                             | Optional fields                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `requested`             | `fusion_request_id` non-nil UUID; `reasoning_mode` M0 enum; `reasoning_purpose` closed M0 enum; `evidence_reference_count` integer 1–128; `observable_reference_count`, `entity_reference_count`, `correlation_reference_count`, `graph_reference_count` literal integer `0`; `context_snapshot_present` boolean; all eight version fields | none                                                                                                                             |
| `completed`             | `fusion_request_id`, `fusion_result_id` non-nil UUIDs; `status` literal `COMPLETED`; `assertion_count` integer 1–128; `hypothesis_count`, `cross_domain_assertion_count`, `evidence_gap_count` integers 0–64; `investigation_action_count` integer 0–32; `response_candidate_count` integer 0–16; all eight version fields                 | none                                                                                                                             |
| `failed`                | `fusion_request_id` non-nil UUID; `failure_code` closed M0 failure enum; `dependency_class` closed enum below; all eight version fields                                                                                                                                                                                                    | `fusion_result_id` non-nil UUID, present only if result construction began                                                       |
| `hypothesis_generated`  | `fusion_request_id`, `fusion_result_id`, `hypothesis_id` non-nil UUIDs; `hypothesis_class` enum `INFERENCE`, `PREDICTION`; `confidence_state` enum `KNOWN`, `UNKNOWN`; `provenance_sha256` lowercase hexadecimal string of 64 characters; all eight version fields                                                                         | none                                                                                                                             |
| `hypothesis_superseded` | `fusion_request_id`, `fusion_result_id`, `prior_hypothesis_id` non-nil UUIDs; `supersession_reason` enum below; `provenance_sha256` lowercase hexadecimal string of 64 characters; all eight version fields                                                                                                                                | `new_hypothesis_id` non-nil UUID, required only for `CONTRADICTED_BY_NEW_EVIDENCE` or `CONTEXT_SUPERSEDED`, prohibited otherwise |

Every count is server-derived from the validated request/result. Every identifier is server-derived
or copied from the canonical request/result. Unknown, null, missing, out-of-range or additional
payload fields are `SCHEMA_INVALID`.

`DEPENDENCY_CLASS` is the closed enum `NONE`, `XCAP005_EVIDENCE`, `PLATFORM_CONTEXT`,
`AUTHORIZATION`, `EVENT_FOUNDATION`, `AUDIT`, `IDEMPOTENCY_RECEIPT`, `AI_GATEWAY_CONTRACT`.
The deterministic mapping is:

| Failure and proven failing boundary                                   | `dependency_class`    |
| --------------------------------------------------------------------- | --------------------- |
| `REFERENCE_OWNER_UNAVAILABLE` while resolving `ACS-XCAP-005`          | `XCAP005_EVIDENCE`    |
| `REFERENCE_OWNER_UNAVAILABLE` while validating the context projection | `PLATFORM_CONTEXT`    |
| `DEPENDENCY_UNAVAILABLE` or `DEPENDENCY_TIMEOUT` at XCAP-005          | `XCAP005_EVIDENCE`    |
| same codes at tenant/context membership resolution                    | `PLATFORM_CONTEXT`    |
| same codes at `AuthorizationPort`                                     | `AUTHORIZATION`       |
| same codes at Event Foundation outbox append                          | `EVENT_FOUNDATION`    |
| same codes at canonical audit append                                  | `AUDIT`               |
| same codes at bounded receipt persistence                             | `IDEMPOTENCY_RECEIPT` |
| same codes in AI Gateway contract-failure injection                   | `AI_GATEWAY_CONTRACT` |
| every other failure code                                              | `NONE`                |

The service records the first failing boundary before constructing the event; no client supplies
`dependency_class`. The closed `SUPERSESSION_REASON` enum is
`CONTRADICTED_BY_NEW_EVIDENCE`, `SOURCE_TRUST_REVOKED`,
`PROVENANCE_INVALIDATED`, `POLICY_VERSION_CHANGED`, `CONTEXT_SUPERSEDED`.

All events prohibit evidence/content/blob references, statements, explanations, assumptions,
prompts, model material, tokens, credentials, personal data and unrestricted strings. The receipt
transaction atomically writes its applicable audit and outbox rows. A failure before commit emits
no requested/completed/hypothesis success event; a bounded `failed` event may be written in a
separate canonical failure transaction after classification. FI-012 proves rollback of receipt,
audit and outbox together.

## 4. Positive acceptance matrix

| ID                   | Deterministic future acceptance                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `XCAP011-M0-POS-001` | A valid same-tenant request validates with every mandatory field and typed reference.                              |
| `XCAP011-M0-POS-002` | One-reference evidence request resolves XCAP-005 identity, integrity and provenance without embedding raw content. |
| `XCAP011-M0-POS-003` | A valid result contains assertion class, explanation, gaps, assumptions, uncertainty and support/contradiction.    |
| `XCAP011-M0-POS-004` | All six confidence dimensions carry value or `UNKNOWN`, computation version and support.                           |
| `XCAP011-M0-POS-005` | Idempotent replay returns the same safe result and produces no duplicate side effect.                              |
| `XCAP011-M0-POS-006` | Final lifecycle event validates against Event Foundation envelope and redaction rules.                             |
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

| ID                  | Injected condition                                                        | Expected outcome                                                                                                 |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `XCAP011-M0-FI-001` | AI Gateway unavailable                                                    | Bounded dependency failure; no partial/authoritative result.                                                     |
| `XCAP011-M0-FI-002` | Model unavailable                                                         | Fail closed; no direct-provider fallback.                                                                        |
| `XCAP011-M0-FI-003` | Timeout                                                                   | Bounded timeout result; no autonomous action.                                                                    |
| `XCAP011-M0-FI-004` | Malformed result                                                          | Schema rejection; no event claiming completion.                                                                  |
| `XCAP011-M0-FI-005` | Unsupported schema version                                                | Compatibility failure before processing.                                                                         |
| `XCAP011-M0-FI-006` | Policy-version mismatch                                                   | Fail closed with bounded policy reason.                                                                          |
| `XCAP011-M0-FI-007` | Canonical dependency unavailable                                          | Required-reference resolution fails closed.                                                                      |
| `XCAP011-M0-FI-008` | Response-candidate fixture with `OPERATIONAL_DECISION_CONFIDENCE=UNKNOWN` | `REFUSED`, empty candidate/action/assertion arrays and `INSUFFICIENT_CONFIDENCE`; never authority.               |
| `XCAP011-M0-FI-009` | Context fixture evaluated at its exact `valid_until`                      | Request rejected before synthesis with `CONTEXT_STALE`, HTTP 409 and `PLATFORM_CONTEXT` failed-event dependency. |
| `XCAP011-M0-FI-010` | Exact replay                                                              | Deterministic idempotent outcome without duplicate event/result.                                                 |
| `XCAP011-M0-FI-011` | Divergent idempotency reuse                                               | Conflict rejected.                                                                                               |
| `XCAP011-M0-FI-012` | Event/outbox or audit append failure                                      | Whole applicable transaction rolls back; no split state.                                                         |

`POSITIVE_ACCEPTANCE_COUNT = 10`
`NEGATIVE_SECURITY_ACCEPTANCE_COUNT = 21`
`FAILURE_INJECTION_ACCEPTANCE_COUNT = 12`

## 7. M0 acceptance execution classification

Every historical identifier remains mandatory as either runtime or deterministic contract evidence:

| Disposition                         | IDs                                                                                                                                        | Count |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----: |
| `M0_MANDATORY_EXECUTABLE`           | `POS-002`, `POS-005`, `POS-007`, `POS-008`, `POS-010`; `NEG-001` through `NEG-006`; `NEG-014`, `NEG-015`; `FI-010` through `FI-012`        |    16 |
| `M0_CONTRACT_LEVEL_EXECUTABLE`      | `POS-001`, `POS-003`, `POS-004`, `POS-006`, `POS-009`; `NEG-007` through `NEG-013`, `NEG-016` through `NEG-021`; `FI-001` through `FI-009` |    27 |
| `LATER_MATURITY`                    | none                                                                                                                                       |     0 |
| `NOT_APPLICABLE_WITH_JUSTIFICATION` | none                                                                                                                                       |     0 |

All abbreviated IDs in this table have the canonical `XCAP011-M0-` prefix. `NEG-019`, `FI-001`, and
`FI-002` are deterministic AI Gateway contract tests and do not invoke a provider/model. FI-012 uses
the mandatory transactional disposition above. `ACCEPTANCE_TOTAL = 43` and
`MANDATORY_UNEXECUTABLE_CASES = 0`. `MANDATORY_ACCEPTANCE_SKIPS = 0`.

### 7.1 Acceptance-to-contract/port/failure mapping

`NONE_SUCCESS` means successful execution has no failure code; `NONE_CONTRACT_ASSERTION` means a
deterministic architecture test proves absence/prohibition and emits no runtime failure.

| ID        | Exact contract or port                               | Exact outcome/failure code                                                                                       |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POS-001` | fusion request schema                                | `NONE_SUCCESS`                                                                                                   |
| `POS-002` | `Xcap005FusionEvidenceResolutionPort`                | `NONE_SUCCESS`                                                                                                   |
| `POS-003` | fusion result schema                                 | `NONE_SUCCESS`                                                                                                   |
| `POS-004` | fusion confidence schema                             | `NONE_SUCCESS`                                                                                                   |
| `POS-005` | bounded command receipt                              | `NONE_SUCCESS` exact replay                                                                                      |
| `POS-006` | five Event Foundation schemas                        | `NONE_SUCCESS`                                                                                                   |
| `POS-007` | content decision plus observability port             | `NONE_SUCCESS`                                                                                                   |
| `POS-008` | `AuthorizationPort` plus canonical MPA               | `NONE_SUCCESS` non-authoritative recommendation                                                                  |
| `POS-009` | fusion request schema                                | `NONE_SUCCESS` empty unsupported-owner arrays                                                                    |
| `POS-010` | provenance schema plus canonical owner resolver      | `NONE_SUCCESS`                                                                                                   |
| `NEG-001` | identity adapter                                     | `AUTHENTICATION_REQUIRED`                                                                                        |
| `NEG-002` | ACTIVE membership resolver                           | `MEMBERSHIP_INACTIVE`                                                                                            |
| `NEG-003` | `AuthorizationPort`                                  | `AUTHORIZATION_DENIED`                                                                                           |
| `NEG-004` | trusted context plus reference resolver              | `CROSS_TENANT_REFERENCE`                                                                                         |
| `NEG-005` | canonical owner resolver                             | `REFERENCE_UNAUTHORIZED`                                                                                         |
| `NEG-006` | XCAP-005 projection                                  | missing=`REFERENCE_NOT_FOUND`; provenance=`REFERENCE_PROVENANCE_INVALID`; integrity=`REFERENCE_INTEGRITY_FAILED` |
| `NEG-007` | content decision                                     | `SENSITIVE_CONTENT_REJECTED`                                                                                     |
| `NEG-008` | untrusted-content schema                             | `UNTRUSTED_CONTENT`                                                                                              |
| `NEG-009` | untrusted-content plus provenance schemas            | `UNTRUSTED_CONTENT`                                                                                              |
| `NEG-010` | result/reference schemas                             | `MODEL_RESULT_INVALID`                                                                                           |
| `NEG-011` | result/reference schemas                             | `MODEL_RESULT_INVALID`                                                                                           |
| `NEG-012` | confidence schema plus `AuthorizationPort`           | `CONFIDENCE_INVALID`                                                                                             |
| `NEG-013` | result response-candidate schema                     | `AUTHORIZATION_DENIED`                                                                                           |
| `NEG-014` | canonical MPA port                                   | `AUTHORIZATION_DENIED`                                                                                           |
| `NEG-015` | content decision plus Event Foundation/observability | `SENSITIVE_CONTENT_REJECTED`                                                                                     |
| `NEG-016` | AI boundary architecture test                        | `NONE_CONTRACT_ASSERTION`                                                                                        |
| `NEG-017` | canonical-owner architecture test                    | `NONE_CONTRACT_ASSERTION`                                                                                        |
| `NEG-018` | maturity dependency test                             | `NONE_CONTRACT_ASSERTION`                                                                                        |
| `NEG-019` | AI Gateway contract boundary                         | `MODEL_PROVIDER_UNTRUSTED`                                                                                       |
| `NEG-020` | provenance schema                                    | malformed/detached=`PROVENANCE_INVALID`; hash mismatch=`PROVENANCE_TAMPERED`                                     |
| `NEG-021` | confidence schema                                    | `CONFIDENCE_INVALID`                                                                                             |
| `FI-001`  | AI Gateway contract boundary                         | `DEPENDENCY_UNAVAILABLE`                                                                                         |
| `FI-002`  | AI Gateway contract boundary                         | `DEPENDENCY_UNAVAILABLE`                                                                                         |
| `FI-003`  | bounded dependency boundary                          | `DEPENDENCY_TIMEOUT`                                                                                             |
| `FI-004`  | result schema                                        | `MODEL_RESULT_INVALID`                                                                                           |
| `FI-005`  | request/result schema                                | `SCHEMA_INVALID`                                                                                                 |
| `FI-006`  | policy resolver                                      | `POLICY_VERSION_MISMATCH`                                                                                        |
| `FI-007`  | canonical owner resolver                             | `REFERENCE_OWNER_UNAVAILABLE`                                                                                    |
| `FI-008`  | confidence policy                                    | `INSUFFICIENT_CONFIDENCE`                                                                                        |
| `FI-009`  | context snapshot resolver                            | `CONTEXT_STALE`                                                                                                  |
| `FI-010`  | bounded command receipt                              | `NONE_SUCCESS` exact replay                                                                                      |
| `FI-011`  | bounded command receipt                              | `IDEMPOTENCY_CONFLICT`                                                                                           |
| `FI-012`  | receipt/audit/Event Foundation transaction           | `DEPENDENCY_UNAVAILABLE`; all success state rolls back                                                           |

### 7.2 Previously blocked mandatory acceptance closure

| Requirement | Exact contract or policy                                                | Deterministic fixture input                                                                                                       | Expected outcome                                                          | Failure code                                                                        |
| ----------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `POS-002`   | `cyberdefense.evidence.fusion-resolution@1.0.0`                         | same-tenant version-matched XCAP-005 evidence with `VERIFIED` integrity/provenance                                                | bounded projection resolves without raw bytes                             | none                                                                                |
| `POS-007`   | `cyberdefense.fusion.content-decision@1.0.0` plus bounded observability | `INTERNAL` evidence metadata and the exact M0 decision-matrix row                                                                 | only metadata-only allowlisted telemetry is emitted                       | none                                                                                |
| `POS-010`   | `cyberdefense.fusion.provenance-binding@1.0.0`                          | valid derived evidence with complete same-tenant parent, source, custody and derivation facts                                     | one version-bound `VERIFIED` binding traces to XCAP-005                   | none                                                                                |
| `NEG-004`   | trusted tenant context plus XCAP-005 resolver                           | authenticated tenant A request referencing tenant B evidence                                                                      | deny before existence disclosure                                          | `CROSS_TENANT_REFERENCE`                                                            |
| `NEG-005`   | XCAP-005 resolver plus `AuthorizationPort`                              | same-tenant existing evidence while actor lacks canonical evidence-read permission                                                | deny without projection disclosure                                        | `REFERENCE_UNAUTHORIZED`                                                            |
| `NEG-006`   | XCAP-005 Fusion projection                                              | authorized absent evidence; or present evidence with non-`VERIFIED` provenance; or present evidence with non-`VERIFIED` integrity | respectively fail with the single code selected by section 1.2 precedence | `REFERENCE_NOT_FOUND`; `REFERENCE_PROVENANCE_INVALID`; `REFERENCE_INTEGRITY_FAILED` |
| `NEG-015`   | content-decision matrix plus Event Foundation/observability             | restricted source content attempted as an event, audit or telemetry payload rather than permitted bounded metadata                | reject before append/export                                               | `SENSITIVE_CONTENT_REJECTED`                                                        |

Each semicolon-separated NEG-006 fixture is an independent parameterized case; a single fixture
contains only one condition, so no execution has alternative outcomes. All seven requirements are
executable after controlled publication and implementation of their exact governed boundary.

`IMPLEMENTATION = NONE`
