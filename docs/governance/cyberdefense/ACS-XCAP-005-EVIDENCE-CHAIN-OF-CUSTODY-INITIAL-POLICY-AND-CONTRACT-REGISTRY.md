# ACS-XCAP-005 — Initial Policy and Contract Registry

**Status:** `READY_FOR_HUMAN_APPROVAL`
**Capability:** `ACS-XCAP-005` — Evidence & Chain of Custody
**Registry version:** `1.0.0`
**Implementation authorization:** `NOT AUTHORIZED`

## 1. Purpose and approval boundary

This registry supplies the initial policy and contract bindings required by the
XCAP-005 Definition of Ready. It reuses the ACS governance chain,
`AuthorizationPort`, trusted tenant context, RLS/FORCE RLS, append-only audit
and the Event Foundation. It creates no parallel authorization, tenant, audit,
event, storage, KMS or PKI system.

The entries are deterministic proposals prepared for human governance. Their
approval is not implied by creation of this document.

`HUMAN_DECISIONS_REQUIRED = DECISION-001, DECISION-002, DECISION-003, DECISION-004, DECISION-005, DECISION-006, DECISION-007`
`IMPLEMENTATION_AUTHORIZED = NO`

## 2. DECISION-001 — evidence hash and canonicalization policy

`EVIDENCE_HASH_POLICY = READY_FOR_HUMAN_APPROVAL`
`CANONICALIZATION_POLICY = READY_FOR_HUMAN_APPROVAL`

The proposed initial policy is SHA-256, an existing ACS primitive in Node and
PostgreSQL. It is scoped to evidence integrity and does not create a new
general cryptographic authority.

| Policy field               | Proposed deterministic binding                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HASH_ALGORITHM`           | `SHA-256`                                                                                                                                                                                                                       |
| `HASH_SCOPE`               | Exact raw evidence bytes only; metadata has an independently versioned canonical representation.                                                                                                                                |
| `HASH_INPUT`               | Received/acquired raw-byte sequence after bounded transport decoding and before normalization, rendering, redaction or derivation.                                                                                              |
| `HASH_AT_INGEST`           | Mandatory before authoritative evidence creation; a mismatching supplied digest fails closed or quarantines according to connector policy.                                                                                      |
| `HASH_REVERIFY`            | Mandatory on explicit verification, content-reference recovery, export, and destruction eligibility evaluation where content remains available.                                                                                 |
| `CANONICALIZATION_VERSION` | `xcap005-evidence-metadata-v1`; recorded immutably with the metadata hash.                                                                                                                                                      |
| `CANONICAL_METADATA_RULE`  | UTF-8 JSON object with recursively lexicographically ordered keys; UTF-8 strings; no insignificant whitespace; RFC 3339 UTC `Z` timestamps; lower-case UUIDs; absent optional fields omitted rather than represented as `null`. |
| `RAW_BYTES_RULE`           | Raw bytes are neither JSON-normalized nor transformed before hashing. Transfer decoding, archive expansion or a decoded view is a separate derived evidence artifact.                                                           |
| `METADATA_HASH_RULE`       | SHA-256 of the canonical metadata serialization, excluding mutable availability/location facts and the metadata hash field itself.                                                                                              |
| `DERIVATION_HASH_RULE`     | A derived artifact has its own raw-byte and metadata hash and records parent IDs/content hashes plus transformation identifier/version.                                                                                         |
| `TAMPER_DETECTION_OUTCOME` | Mismatch or unverifiable integrity creates an append-only integrity-failed fact; affected content is not silently served, exported or destroyed.                                                                                |

`SAME_HASH_EQUALS_SAME_EVIDENCE = NO`
`DIGITAL_SIGNATURE_REQUIRED_INITIAL = NO`
`NEW_KMS_REQUIRED_INITIAL = NO`

Digital signatures, a new PKI, KMS or storage-encryption technology require
future governance/ADR only if later selected; they are not required to
implement the initial SHA-256 integrity boundary.

## 3. DECISION-002 — data and event contract registration

`DATA_CONTRACT_STATUS = READY_FOR_HUMAN_APPROVAL`
`DATA_CONTRACT_VERSION = 1.0.0`
`EVENT_CONTRACT_STATUS = READY_FOR_HUMAN_APPROVAL`
`PARALLEL_EVENT_SYSTEM = NO`

The registered proposed data contract is `xcap005.evidence-record.v1`. Every
record contains evidence/tenant identity and contract version; source type,
connector/trust and collection provenance; raw-byte reference/media type/size;
content and metadata integrity; classification; derivation/custody; retention/
hold; and export provenance. Original evidence, source/provenance and initial
integrity identity are immutable. Verification, custody, derivation, policy
decisions and export are append-only. Operational availability/reference state
changes only through an authorized append-only governance fact.

Every proposed event uses the existing Event Foundation envelope and version
`1`: `event_type`, `schema_version`, `tenant_id`, `timestamp`,
`correlation_id`, `request_id`, `evidence_id`, source/connector reference and
an audit relationship. Normal payloads exclude raw evidence, credentials,
tokens, secrets and unbounded content.

| Event name                                 | Owner                              | Trigger / payload boundary                                                         |
| ------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `cyberdefense.evidence.recorded`           | `ACS_XCAP_005_EVIDENCE_FOUNDATION` | Evidence plus initial custody created; identifiers/status only.                    |
| `cyberdefense.evidence.integrity_verified` | `ACS_XCAP_005_EVIDENCE_FOUNDATION` | Re-verification succeeds; status/reference only.                                   |
| `cyberdefense.evidence.integrity_failed`   | `ACS_XCAP_005_EVIDENCE_FOUNDATION` | Mismatch/unverifiable result; bounded reason/quarantine reference only.            |
| `cyberdefense.evidence.derived`            | `ACS_XCAP_005_EVIDENCE_FOUNDATION` | Derived relation; parent/child identifiers only.                                   |
| `cyberdefense.evidence.exported`           | `ACS_XCAP_005_EVIDENCE_FOUNDATION` | Approved export; policy/approval/custody reference only.                           |
| `cyberdefense.evidence.quarantined`        | `ACS_XCAP_005_EVIDENCE_FOUNDATION` | Refusal/quarantine; bounded reason/source reference only.                          |
| `cyberdefense.evidence.retention_applied`  | `ACS_XCAP_005_EVIDENCE_FOUNDATION` | Retention/hold/override/destruction decision; policy/custody/audit reference only. |

## 4. DECISION-003 — ownership authority classes

| Responsibility | Authority class | Human-name rule |
| --- | --- |
| `CAPABILITY_OWNER` | `CYBERDEFENSE_ROOT_SUBORDINATE_AUTHORITY` | Kalunga Soares |
| `DATA_AUTHORITY` | `ACS_XCAP_005_EVIDENCE_FOUNDATION` | Kalunga Soares |
| `SECURITY_POLICY_AUTHORITY` | Existing ACS security-governance authority | Kalunga Soares |
| `RETENTION_POLICY_AUTHORITY` | Existing ACS data-governance authority | Kalunga Soares |
| `CRYPTOGRAPHIC_POLICY_AUTHORITY` | Existing ACS security/cryptographic-governance authority | Kalunga Soares |

Authority classes define the implementation boundary without fabricating
identities. Kalunga Soares is the named accountable human for each listed
governance role. The collision is governance accountability only and does not
grant operational authority or waive mandatory operational SoD, dual control,
independent approval or human-approval requirements.

`OWNERSHIP_MODEL = COMPLETE`

## 5. DECISION-004 — permissions and role composition

`PERMISSION_CATALOG = READY_FOR_HUMAN_APPROVAL`
`ROLE_COMPOSITION = READY_FOR_HUMAN_APPROVAL`

| Operation          | Permission key                             | Authorization | SoD | Dual control                   | Human approval |
| ------------------ | ------------------------------------------ | ------------- | --- | ------------------------------ | -------------- |
| Read               | `cyberdefense.evidence.read`               | Standard      | No  | No                             | No             |
| Collect            | `cyberdefense.evidence.collect`            | Standard      | No  | No                             | No             |
| Verify             | `cyberdefense.evidence.verify`             | Standard      | No  | No                             | No             |
| Derive             | `cyberdefense.evidence.derive`             | Standard      | No  | No                             | No             |
| Export             | `cyberdefense.evidence.export`             | Elevated      | Yes | Restricted classification only | Yes            |
| Retain             | `cyberdefense.evidence.retain`             | Elevated      | No  | No                             | Policy-bound   |
| Retention override | `cyberdefense.evidence.retention_override` | Elevated      | Yes | Yes                            | Yes            |
| Destroy            | `cyberdefense.evidence.destroy`            | Elevated      | Yes | Yes                            | Yes            |

Each key is tenant scoped and resolves only through `AuthorizationPort` after
authenticated identity, active membership where human, and trusted server
tenant context. Ordinary read/write roles may receive only read, collect,
verify or derive where explicitly approved. Export, retention override and
destroy are isolated capability grants; no generic/admin role implicitly grants
them. Tenant-role composition uses the canonical role/permission governance
path.

## 6. DECISION-005 — evidence classification policy

`CLASSIFICATION_POLICY = READY_FOR_HUMAN_APPROVAL`

No existing ACS enterprise classification vocabulary was found for evidence.
The bounded XCAP-005 proposal is `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, and
`RESTRICTED_SECURITY`. Every record has exactly one classification at ingest;
reclassification is an append-only authorized decision preserving the prior
value. `RESTRICTED_SECURITY` is the proposed threshold for mandatory
dual-control export. This is capability-local pending human approval, not an
organization-wide taxonomy.

## 7. DECISION-006 — retention and legal hold policy model

`RETENTION_POLICY_MODEL = READY_FOR_HUMAN_APPROVAL`
`LEGAL_HOLD_POLICY = READY_FOR_HUMAN_APPROVAL`

Each record binds `retention_class`, `retention_policy_id`, `start_trigger`,
`expiry_rule`, legal-hold state/reference and destruction eligibility. Duration
values are governed configuration and are not invented. A hold records its
authority, bounded reason reference, timestamp, audit relation and custody
link. The following are absolute:

```text
LEGAL_HOLD_ACTIVE → RETENTION_EXPIRY_CANNOT_DESTROY
LEGAL_HOLD_ACTIVE → MANUAL_DESTRUCTION_PROHIBITED
```

## 8. DECISION-007 — export and destruction policy model

`EXPORT_POLICY = READY_FOR_HUMAN_APPROVAL`
`DESTRUCTION_POLICY = READY_FOR_HUMAN_APPROVAL`

Export requires a tenant-scoped requester with export permission,
classification-aware policy evaluation, an authorizer distinct from the
requester, human approval, dual control for `RESTRICTED_SECURITY`,
provenance/integrity verification, and append-only export custody/audit facts.

Destruction requires retention eligibility, no legal hold, known
integrity/custody state, destruction permission, a reason, a requestor distinct
from approving authorities, dual control, human approval, and atomic
custody/audit/outbox treatment where persistence applies. This registry does
not specify physical deletion.

## 9. Consistency and decision package

The entries preserve tenant isolation, RLS/FORCE RLS, server-side
authorization, SoD, append-only custody, existing audit/event foundations, the
XCAP-011 M0 contract and the CYB-001 evidence contract.

`POLICY_CONFLICTS = NONE`

| Decision       | Proposed decision                                         | Security effect                           | Implementation effect                  | Unresolved item               |
| -------------- | --------------------------------------------------------- | ----------------------------------------- | -------------------------------------- | ----------------------------- |
| `DECISION-001` | Adopt the initial SHA-256/canonicalization policy.        | Repeatable integrity/tamper boundary.     | Binds hashing and serialization.       | Human approval.               |
| `DECISION-002` | Register data contract `1.0.0` and event set version `1`. | Versioned tenant-safe contract.           | Binds future schemas/events only.      | Human approval.               |
| `DECISION-003` | Adopt classes and assign accountable humans.              | Prevents unowned policy decisions.        | Binds governance ownership.            | Human names.                  |
| `DECISION-004` | Approve permissions and least-privilege roles.            | Prevents implicit sensitive authority.    | Enables catalog/role preparation.      | Human approval.               |
| `DECISION-005` | Approve bounded classification taxonomy.                  | Drives rendering/export controls.         | Enables policy evaluation.             | Human approval.               |
| `DECISION-006` | Approve retention/hold model and durations.               | Prevents premature destruction.           | Enables lifecycle configuration.       | Duration values and approval. |
| `DECISION-007` | Approve export/destruction constraints.                   | Prevents destructive/exfiltration bypass. | Enables elevated flows after approval. | Human approval.               |

`TECHNICAL_GOVERNANCE_CLOSURE_READY = YES`
`IMPLEMENTATION_READY_FOR_HUMAN_DISPOSITION = YES`
`CYBERDEFENSE_IMPLEMENTATION = NONE`
