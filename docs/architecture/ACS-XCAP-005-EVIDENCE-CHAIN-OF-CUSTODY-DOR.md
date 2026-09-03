# ACS-XCAP-005 — Evidence & Chain of Custody Definition of Ready

**Status:** `READY_FOR_GOVERNANCE_REVIEW_NOT_IMPLEMENTATION_APPROVED`
**Capability:** `ACS-XCAP-005` — Evidence & Chain of Custody
**Class:** `TRANSVERSAL_CAPABILITY`
**Implementation authorization:** `NOT AUTHORIZED`

## 1. Authority, mission, and boundary

This Definition of Ready (DoR) is subordinate to the ACS Master Engineering
Specification Baseline Enterprise v5.3, the canonically frozen Cyberdefense
governance stack, the Cyberdefense Capability Registry, the Architecture
Readiness Gate, and the Cyberdefense Dependency Graph. It creates no
implementation authorization.

`ACS-XCAP-005` is the prospective shared ACS Evidence Foundation: a
tenant-bound, provenance-preserving, integrity-verifiable record of evidence
and its custody/derivation history. It must enable authorized ACS capabilities
to preserve original evidence and prove how later facts were collected,
verified, accessed, derived, retained, exported, or disposed of.

It is not a separate forensic product, module-local evidence database, second
audit or event system, disconnected file-storage product, independent trust
authority, SIEM, incident-management system, malware-analysis engine, sandbox,
object-storage redesign, PKI/KMS redesign, cross-tenant evidence-sharing
mechanism, legal/eDiscovery product, or autonomous response capability.

`PARALLEL_PLATFORM = NO`
`PARALLEL_AUDIT_SYSTEM = NO`
`PARALLEL_EVENT_SYSTEM = NO`
`PARALLEL_AUTHORIZATION = NO`
`PARALLEL_TENANT_MODEL = NO`

## 2. Existing foundation and authority reuse

| Boundary           | Existing ACS authority                                                                              | XCAP-005 disposition                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Identity           | Validated OIDC and canonical ACS identity                                                           | Reuse; no connector or evidence-local identity authority.                                                              |
| Tenant             | Active membership and server-issued trusted transaction context                                     | Reuse; tenant derives server-side only.                                                                                |
| Authorization      | `AuthorizationPort` and explicit server-side permissions                                            | Reuse; exact evidence permission catalog requires approval.                                                            |
| Database isolation | Least-privilege roles, RLS and FORCE RLS patterns                                                   | Mandatory for each persisted tenant-scoped evidence relation.                                                          |
| Audit              | `platform.audit_logs` / `platform.security_audit_logs`, append-only controls                        | Reuse for operation/security audit; it is not custody history.                                                         |
| Events and outbox  | ADR-0006, `platform.domain_events`, transactional outbox/event lifecycle                            | Reuse for tenant-safe, versioned event publication; events are not evidence storage.                                   |
| Observability      | Existing bounded telemetry and tenant fingerprinting                                                | Reuse; evidence content is prohibited from logs and metric labels.                                                     |
| Hashing            | Node `createHash('sha256')` is already used for bounded application integrity/idempotency utilities | SHA-256 is an available primitive; evidence content canonicalization, signatures, and key management remain DoR gates. |
| Retention          | Event and operational retention patterns exist, but evidence policy/ownership is not approved       | Evidence retention remains governed-policy work.                                                                       |

`EXISTING_EVIDENCE_FOUNDATION = NO`
`EXISTING_CHAIN_OF_CUSTODY_FOUNDATION = NO`

Audit, event, RLS, and hashing primitives are useful foundations but do not
individually establish an evidence identity, content-integrity, derivation, or
custody model.

## 3. Required canonical evidence model

The following concepts are required for an implementation proposal. Names are
provisional until an approved data contract/ADR confirms repository terminology.

| Concept                  | Tenant-bound                                   | Immutable / append-only requirements                                                                                                                                                                            | Mutable disposition                                                                                                            |
| ------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `EvidenceRecord`         | Yes                                            | Identity, tenant, source/provenance, timestamps, classification, content hash/algorithm, integrity result, original location/reference, parent linkage and creation request/correlation identity are immutable. | A controlled current operational status may be modeled only through append-only custody/state facts; no destructive overwrite. |
| `EvidenceBlobReference`  | Yes                                            | Storage reference version, declared size/content type, original-location reference, content identity and integrity association are immutable.                                                                   | Storage lifecycle implementation is unresolved; reference replacement requires a linked, audited custody/derivation fact.      |
| `EvidenceSource`         | Yes, except separately governed global sources | Source system/type, connector identity, trust classification, collection provenance and source event identity are immutable for a record.                                                                       | Source registration/revocation lifecycle requires its own governed owner/model.                                                |
| `EvidenceHash`           | Yes                                            | Algorithm, canonicalization/version, digest, verification time/result and verifier provenance are append-only facts.                                                                                            | A new verification does not replace an older verification.                                                                     |
| `EvidenceDerivation`     | Yes                                            | Parent evidence identity, transformation identity/version, actor/system, input/output hashes, correlation provenance and time are immutable.                                                                    | None; correction is a new derivation, never mutation of source evidence.                                                       |
| `CustodyEntry`           | Yes                                            | Append-only evidence ID, tenant, action, actor/system, source/destination, reason, request/correlation ID, timestamp, integrity-before and integrity-after.                                                     | None.                                                                                                                          |
| `EvidenceClassification` | Yes                                            | Classification at ingestion is preserved.                                                                                                                                                                       | Reclassification requires an append-only authorized decision and must preserve prior classification/provenance.                |
| `RetentionBinding`       | Yes                                            | Policy reference, effective decision, hold reference where applicable and decision provenance are append-only.                                                                                                  | Policy changes require new binding/version; no silent expiry or purge.                                                         |

Required record scope includes evidence identity; source/type/system; tenant,
actor and connector provenance; collection, observation and ingestion times;
content hash and algorithm; integrity status; classification/type; MIME/content
type and size; original location/storage reference; immutability; parent and
derived evidence; transformation/correlation provenance; custody actor/reason/
time; retention reference; future legal-hold boundary; deletion/expiry boundary;
and export provenance.

`RAW_EVIDENCE_MUTABLE = NO`
`DERIVED_EVIDENCE_REQUIRES_PARENT_PROVENANCE = YES`
`TRANSFORMATION_PROVENANCE = MANDATORY`
`TRACE_BACK_TO_ORIGINAL_SOURCE = MANDATORY`

`RAW_EVIDENCE`, `DERIVED_EVIDENCE`, `NORMALIZED_OBSERVABLE`,
`CORRELATED_SIGNAL`, and `FUSED_CONTEXT` are distinct classes. A later
normalization, correlation, or Fusion output may reference evidence but cannot
overwrite original evidence, its digest, source, or custody history.

## 4. Integrity and cryptographic decision boundary

An implementation proposal must define and test:

- content identity, an approved canonical byte representation, and a versioned
  hash/canonicalization contract;
- hash at ingestion, independently repeatable hash re-verification, tamper
  detection, metadata-integrity treatment, and derivation-integrity proof;
- failure handling for unavailable/invalid content, digest mismatch, malformed
  metadata, and unverifiable historic records; and
- redaction-safe audit/event/observability behaviour.

SHA-256 is available as an existing application primitive, but this DoR does
not approve a final evidence hash algorithm, signature scheme, KMS, key
lifecycle, key custody, encryption architecture, or storage/content-addressing
design. Those items are `TBD_BY_IMPLEMENTATION_DOR`; a new KMS, signature, or
storage technology needs separate ADR/governance approval.

`HASH_AT_INGEST = REQUIRED`
`HASH_REVERIFY = REQUIRED`
`TAMPER_DETECTION = REQUIRED`
`KEY_MANAGEMENT_BOUNDARY = FUTURE_GOVERNED_DEPENDENCY`

## 5. Custody, tenant, and authorization model

`CUSTODY_HISTORY = APPEND_ONLY`
`CUSTODY_EVENT_DELETION = PROHIBITED`
`CROSS_TENANT_EVIDENCE_READ = PROHIBITED_BY_DEFAULT`
`CROSS_TENANT_EVIDENCE_WRITE = PROHIBITED`
`CLIENT_TENANT_AUTHORITY = NONE`
`SERVER_TENANT_AUTHORITY = MANDATORY`

Each future custody transition must carry, where applicable: evidence and
tenant identity; actor or connector identity; action; source/destination;
reason; timestamp; request/correlation identity; and integrity state before
and after. Candidate action classes are `COLLECTED`, `INGESTED`, `VERIFIED`,
`ACCESSED`, `DERIVED`, `EXPORTED`, `TRANSFERRED`, `QUARANTINED`, `RETAINED`,
`EXPIRED`, and `DESTROYED`; final vocabulary requires repository convention
review.

The required execution path is:

```text
validated OIDC or authenticated connector
→ canonical identity / connector identity
→ active membership where human
→ AuthorizationPort
→ server-issued trusted tenant context
→ least-privilege evidence principal
→ RLS + FORCE RLS
→ atomic evidence/custody/audit/outbox operation
```

Conceptual permission families are evidence read, collect, verify, derive,
export, retain, and destroy. Exact keys and permission ownership are not yet
approved. Export, destruction, retention override, quarantine release, and any
cross-boundary transfer require explicit threat-model, SoD, and human-approval
disposition before implementation. No `admin` permission may bypass tenant,
RLS/FORCE RLS, integrity, custody, audit, or append-only controls.

## 6. Connector trust, events, and storage

Every evidence source must declare connector identity, server-authoritative
tenant binding, source-trust class, source/event identity, ingestion
validation, bounded input size/content validation, malicious-input handling,
quarantine boundary, replay protection, duplicate handling, audit, and
credential revocation. Internal origin alone confers no trust.

Candidate event semantics are evidence recorded, integrity verified/failed,
derived, exported, quarantined, and retention applied. Exact event names and
payloads require EDIM/event naming review. Events must use the existing Event
Foundation and transactional outbox when state/event atomicity applies. They
must contain only versioned tenant-safe identifiers, provenance references, and
approved status facts—never raw sensitive evidence, credentials, tokens, or
unbounded payloads.

An initial implementation may assess PostgreSQL for governed metadata plus an
external/object-storage reference abstraction for large content, but no storage
technology is selected by this DoR.

`NEW_STORAGE_TECHNOLOGY_REQUIRED = UNRESOLVED`

## 7. Idempotency, concurrency, retention, and privacy

The implementation DoR must define separate tenant-scoped controls for API
command idempotency, source-event replay/deduplication, same-hash handling,
divergent duplicate handling, concurrent custody transitions, concurrent
derivation, and expected-version outcomes. A duplicate must not produce a
second authoritative record, custody entry, audit row, or outbox event unless a
separate retained observation is explicitly governed.

`IDEMPOTENCY_MODEL = TENANT_AND_SOURCE_SCOPED_REPLAY_SAFE`
`CONCURRENCY_MODEL = EXPECTED_VERSION_AND_TRANSACTIONAL_CUSTODY_REQUIRED`
`ATOMICITY_MODEL = EVIDENCE_CUSTODY_AUDIT_OUTBOX_ATOMIC_WHERE_APPLICABLE`

Retention class, duration, named data owner, tenant/security policy,
hold/equivalent integration, expiry, cryptographic re-verification before
destruction, destruction authorization, and destruction audit are unresolved.

`RETENTION_POLICY = TBD_BY_GOVERNED_POLICY`

Evidence may contain credentials, tokens, PII, security telemetry, malware,
documents, network payloads, and identity data. Required future controls include
classification, least-privilege access, redaction, encryption decision,
content-logging prohibition, export governance, malware-safe processing, and
quarantine. Policy for classifications, redaction, encryption, legal hold, and
retention is an authority gap, not an implied policy.

`EVIDENCE_CONTENT_LOGGING = PROHIBITED`

## 8. Threat impact and acceptance requirements

`THREAT_MODEL_REQUIRED = YES`

The capability-specific threat model must cover evidence/hash/metadata tamper;
provenance forgery; tenant escape; authorization bypass; malicious files,
parser abuse, archive bombs and oversized content; connector compromise,
replay, duplicate/out-of-order/late evidence; custody falsification;
audit/custody divergence; unauthorized export/destruction; retention bypass;
and confusion between raw evidence and AI-derived assertions.

Required positive acceptance includes: authorized same-tenant record and read;
raw hash/reverification; preserved source and parent lineage; authorized
derivation with immutable original; append-only custody; tenant-safe event and
audit atomicity; deterministic replay; and authorized, redacted observability.

Required negative/security acceptance includes: unauthenticated/unauthorized
access; client tenant substitution; cross-tenant read/write; direct
least-privilege access without trusted context; RLS/FORCE RLS bypass attempt;
hash mismatch/tamper; forged provenance; malformed/oversized/malicious input;
unknown/revoked connector; duplicate divergent content; concurrent custody or
derivation race; attempted custody/audit mutation/deletion; secret/content
leakage in audit/events/logs; unauthorized export/destruction; and failure
injection proving no evidence/custody/audit/outbox split.

Production acceptance must later cover capacity/large evidence, backpressure,
load/soak/chaos, HA/DR, backup/restore, reprocessing, retention, integrity
reverification, upgrade/rollback, and failure recovery. No production readiness
is claimed here.

## 9. Fusion and CYB-001 contracts

`FUSION_M0_DEPENDENCY = XCAP_005_CONTRACT`
`FUSION_M1_INPUT = CANONICAL_EVIDENCE_AND_ENTITY_PROVENANCE`
`FUSION_CAN_MUTATE_RAW_EVIDENCE = NO`

XCAP-005 must supply stable evidence identity, provenance, integrity, source
trust, and derivation lineage to future ACS-XCAP-011. Fusion may create a new
referencing derived/fused context only under its own DoR; it cannot mutate raw
evidence or become a parallel entity/evidence authority.

Before ACS-CYB-001 can pass its DoR, XCAP-005 must have an approved contract
for tenant-bound observation/evidence recording, source/connector provenance,
content/integrity identity, append-only custody, trusted-context/RLS path,
replay/deduplication, tenant-safe audit/event handling, and prohibited private
evidence authority. CYB-001 implementation remains unauthorized.

## 10. Commercial and governance disposition

Evidence may later inform Plan, Subscription, Entitlement, Usage/Metering,
storage, or retention policy only through a separate approved commercial DoR.
No pricing, quota, entitlement, or usage semantics are defined here.

`COMMERCIAL_POLICY = FUTURE_GOVERNED_DECISION`

The minimum artifact set is this DoR. It incorporates the data-contract,
candidate event-contract, threat-impact, positive-acceptance, negative-security,
and production-readiness requirements at the required governance level.
Separate ADR/AIDR/SDR, EDIM/EDOLM/ECOM, detailed threat analysis, and
traceability delta are required only if the later implementation proposal
selects a new canonical boundary, storage technology, cryptographic/key
architecture, retention/legal-hold policy, or external connector model.

Open authority gaps are: named data/security owners; approved evidence
classification/redaction/encryption policy; retention and legal-hold policy;
final permission catalog and SoD/dual-control rules; content canonicalization
and signature/KMS decision; storage lifecycle; connector registration/credential
lifecycle; final event/data contracts; SLO/capacity; and production profile.

`ADDITIONAL_GOVERNANCE_REQUIRED = YES`
`IMPLEMENTATION_READY = NO`
`CYBERDEFENSE_IMPLEMENTATION = NONE`

This document is documentation governance only. It authorizes no source code,
migration, API, frontend, worker, connector, infrastructure, dependency, CI,
commit, publication, or production operation.

## 11. Remediation closure — canonical ownership and deterministic contract

This section closes the DoR governance gaps identified as `REQ-REM-001` through
`REQ-REM-011`. Where it is more specific than an earlier prospective statement,
this section is controlling. It does not register permissions, create policies,
or authorize implementation.

### 11.1 Architectural ownership

| Ownership boundary             | Canonical architectural authority                        | Named human owner | Scope                                                                          |
| ------------------------------ | -------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| Capability owner               | `CYBERDEFENSE_ROOT_SUBORDINATE_AUTHORITY`                | Kalunga Soares    | Scope, dependency and DoR/DoD governance for ACS-XCAP-005.                     |
| Data authority                 | `ACS_XCAP_005_EVIDENCE_FOUNDATION`                       | Kalunga Soares    | Evidence identity, provenance, custody and contract stewardship.               |
| Security policy authority      | Existing ACS security-governance authority               | Kalunga Soares    | Classification, access, export, connector and incident-control policy.         |
| Retention policy authority     | Existing ACS data-governance authority                   | Kalunga Soares    | Retention, legal hold, override and destruction policy.                        |
| Cryptographic policy authority | Existing ACS security/cryptographic-governance authority | Kalunga Soares    | Approved algorithms, signing, encryption, key custody and verification policy. |

`CANONICAL_EVIDENCE_AUTHORITY = DEFINED`. Kalunga Soares holds the five
governance-accountability roles above. This governance-role collision grants no
operational permission and does not waive mandatory operational SoD, dual
control, independent approval or human-approval requirements.

### 11.2 Minimum versioned evidence data contract

Every `EvidenceRecord` contract is versioned and tenant bound. It includes:

| Contract area         | Required fields / rule                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence identity     | `evidence_id`, `tenant_id`, `record_contract_version`, creation request and correlation identifiers.                                                                     |
| Source and collection | `evidence_source_id`, source type, registered connector identity where applicable, source event identity, trust class, collection, observation and ingestion timestamps. |
| Content identity      | `raw_bytes_reference`, `canonical_metadata_version`, content hash algorithm and digest, declared media type and bounded size.                                            |
| Integrity             | Ingest verification result/time/verifier, re-verification facts and tamper disposition.                                                                                  |
| Provenance            | Collector/actor, parent evidence identity, transformation identity/version, derivation inputs/outputs and provenance identity.                                           |
| Governance            | Classification reference, custody linkage, retention binding, legal-hold reference and export provenance.                                                                |

`IMMUTABLE_FIELDS` are evidence/tenant identity; source and collection facts;
raw-byte reference; canonical metadata version; initial content hash;
classification-at-ingest; parent linkage; and initial creation provenance.
`APPEND_ONLY_FIELDS` are hash verifications, custody entries, derivations,
reclassifications, retention bindings, legal-hold decisions, exports and
authorized state facts. `CONTROLLED_MUTABLE_FIELDS` are only operational
availability/reference state that is represented by an authorized append-only
fact and never overwrites original evidence or provenance.

`RAW_EVIDENCE_IMMUTABLE = YES`

### 11.3 Content identity and cryptographic integrity

| Term                  | Deterministic meaning                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `RAW_BYTES`           | The exact byte sequence received or acquired, addressed only through a governed content reference.                         |
| `CANONICAL_METADATA`  | Versioned, deterministic metadata serialization excluding mutable operational facts.                                       |
| `CONTENT_HASH`        | Digest of the approved raw-byte representation, with algorithm and canonicalization version recorded.                      |
| `EVIDENCE_IDENTITY`   | Tenant-scoped evidence record identity; it is not derived solely from a digest.                                            |
| `PROVENANCE_IDENTITY` | Source, source-event/collection instance, collector/connector and collection context that explain the evidence occurrence. |

`SAME_CONTENT_HASH = SAME_EVIDENCE` is false by default. Matching content may
be retained as distinct evidence occurrences when tenant, source event,
collection, custody, or provenance differs. A same-tenant replay with the same
authoritative replay identity follows the idempotency rules in section 11.7.

`INTEGRITY_HASHING = MANDATORY`: hash at ingestion, record the approved
algorithm/canonicalization version, re-verify repeatably, detect digest or
metadata tampering, and record derivation input/output integrity. SHA-256 is
the currently available ACS primitive; the initial binding is registered in the
[XCAP-005 Initial Policy and Contract Registry](../governance/cyberdefense/ACS-XCAP-005-EVIDENCE-CHAIN-OF-CUSTODY-INITIAL-POLICY-AND-CONTRACT-REGISTRY.md).
`DIGITAL_SIGNATURE = POLICY_BOUND / FUTURE_IF_REQUIRED`. `KMS =
EXISTING_AUTHORITY_OR_ADR_REQUIRED`; no KMS, PKI, or key technology is selected
here. A new KMS/signature/storage technology requires an ADR before
implementation selects it.

### 11.4 Authorization, SoD, and human approval contract

The sole authorization boundary is the existing server-side
`AuthorizationPort`; OIDC and connector identity establish the actor, not ACS
authorization. The following are proposed canonical catalog keys following the
existing dot-qualified convention. They are contractual names only until
registered through the canonical permission-governance path:

| Operation | Proposed permission | Authorization class | SoD / dual control / human approval |
| --- | --- | --- |
| Read | `cyberdefense.evidence.read` | `STANDARD_AUTHORIZATION` | No additional requirement. |
| Collect | `cyberdefense.evidence.collect` | `STANDARD_AUTHORIZATION` | Connector trust rules still apply. |
| Verify | `cyberdefense.evidence.verify` | `STANDARD_AUTHORIZATION` | Verifier provenance mandatory. |
| Derive | `cyberdefense.evidence.derive` | `STANDARD_AUTHORIZATION` | Original evidence remains immutable. |
| Export | `cyberdefense.evidence.export` | `ELEVATED_AUTHORIZATION` | `SOD_REQUIRED`; human approval required; dual control required for restricted-classification export. |
| Retain | `cyberdefense.evidence.retain` | `ELEVATED_AUTHORIZATION` | Policy-bound; no silent retention change. |
| Retention override | `cyberdefense.evidence.retention_override` | `ELEVATED_AUTHORIZATION` | `SOD_REQUIRED`, `DUAL_CONTROL_REQUIRED`, human approval required. |
| Destroy | `cyberdefense.evidence.destroy` | `ELEVATED_AUTHORIZATION` | `SOD_REQUIRED`, `DUAL_CONTROL_REQUIRED`, human approval required and prohibited during legal hold. |

Dual-control approvers must be distinct from the requestor and each other;
their identity, membership, authority, policy version, request and decision
must be durably auditable. No broad administrative permission bypasses tenant
context, RLS/FORCE RLS, integrity, custody, legal hold, or the approval gate.

`AUTHORIZATION_MODEL_COMPLETE = YES`
`SOD_MODEL_COMPLETE = YES`

### 11.5 Connector trust and bounded ingestion contract

No connector is trusted due to deployment location. Before collection, a
connector must have a `REGISTERED_CONNECTOR_ID`, server-authoritative tenant
binding, connector type, source class, trust classification, credential
reference (never credential material), credential lifecycle status, ingestion
policy version, size boundary, content validation disposition, quarantine
policy, replay/duplicate rule and audit requirement.

Connector lifecycle states are `UNREGISTERED`, `REGISTERED`, `QUARANTINED`,
and `REVOKED`. Only `REGISTERED` connectors may submit under their bound
tenant. Unknown, revoked, mismatched, malformed, oversized or unsafe input
fails closed; it may receive a tenant-safe quarantine fact, never an
authoritative evidence record. Credential issuance, rotation and revocation
remain existing security-governance responsibilities and are represented only
by a credential reference/lifecycle state in this contract.

`CONNECTOR_TRUST_MODEL = COMPLETE`

### 11.6 Event, outbox, atomicity and concurrency contract

XCAP-005 uses only the existing Event Foundation and transactional outbox.
Candidate event contracts are version `1` and carry tenant ID, evidence ID,
source/connector reference, request ID, correlation ID, timestamp and audit
relationship—never raw evidence, secrets, credentials or unbounded content:

| Event type                                 | Condition                                                        |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `cyberdefense.evidence.recorded`           | Authoritative evidence and initial custody recorded.             |
| `cyberdefense.evidence.integrity_verified` | Re-verification succeeds.                                        |
| `cyberdefense.evidence.integrity_failed`   | Re-verification detects a mismatch.                              |
| `cyberdefense.evidence.derived`            | A governed derived record/provenance relation is recorded.       |
| `cyberdefense.evidence.exported`           | A fully authorized export is recorded.                           |
| `cyberdefense.evidence.quarantined`        | Input is safely quarantined or refused.                          |
| `cyberdefense.evidence.retention_applied`  | A retention, hold, override or destruction decision is recorded. |

Evidence plus initial custody; every governed transition plus custody, audit
and outbox; derivation plus provenance; and export/destruction authorization
plus custody and audit are one transaction where the underlying persistence
operation applies. Failure rolls back the whole governed transition: no
successful evidence transition may lack its mandatory custody/audit/outbox
record.

Lifecycle, custody, verification, derivation, export, retention override and
destruction transitions require expected-version guards plus transactional
locking consistent with existing ACS patterns. A stale or divergent concurrent
operation receives a bounded domain conflict and produces no second governed
side effect; last-writer-wins is prohibited.

`EVENT_MODEL = COMPLETE`
`PARALLEL_EVENT_SYSTEM = NO`
`ATOMICITY_MODEL = COMPLETE`
`CONCURRENCY_MODEL = COMPLETE`

### 11.7 Deterministic idempotency contract

API-command idempotency authority is the caller-supplied idempotency key bound
to tenant, authenticated actor, command type and canonical request fingerprint.
Connector replay authority is the tenant, registered connector and authoritative
source-event identity. A canonical retry returns the original governed result;
a reused key/identity with a divergent fingerprint fails with a bounded
conflict. Neither outcome creates duplicate evidence, custody, audit or outbox
side effects.

Same content hash with different provenance is a distinct evidence occurrence,
not an automatic duplicate. A duplicate custody transition is only canonical
when evidence, action, target, reason, request identity and expected version
are the same; otherwise it is a divergent conflict. This preserves provenance
without allowing repeated authority-bearing operations.

`IDEMPOTENCY_MODEL = COMPLETE`

### 11.8 Retention, privacy, export and destruction contract

Every record has `retention_class`, `retention_policy_reference`,
`retention_start`, `retention_expiry`, legal-hold reference/status, and
append-only override/destruction facts. Durations and classification values are
policy-governed configuration, not invented here. The invariant is absolute:

```text
LEGAL_HOLD_ACTIVE → DESTRUCTION_PROHIBITED
```

Destruction eligibility is evaluated server-side from the retention policy and
hold state. Authorized destruction requires the section 11.4 dual-control and
human-approval gate, then produces durable custody/audit/destruction evidence.
Retention override and export are similarly auditable policy decisions.

Evidence containing PII, credentials, tokens, identity information, network
payloads, documents, malware, security telemetry or secrets requires
least-privilege access, encryption in transit/at rest according to approved ACS
policy, redaction where applicable, safe rendering, isolation/quarantine where
applicable, and classification-aware export controls. `EVIDENCE_CONTENT_LOGGING
= PROHIBITED`: normal telemetry, audit and events must never emit evidence
content, credentials, tokens or secrets.

`RETENTION_MODEL = COMPLETE`
`PRIVACY_MODEL_COMPLETE = YES`

### 11.9 Transversal and future-consumer dispositions

| Capability                                                  | Disposition         | Boundary                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACS-XCAP-003 Cognitive AI Core                              | `OPTIONAL`          | May consume approved metadata/provenance; cannot mutate raw evidence.                                                                                                                                                                              |
| ACS-XCAP-006 Detection & Correlation                        | `OPTIONAL`          | May reference or produce governed observations; no private evidence authority.                                                                                                                                                                     |
| ACS-XCAP-007 Knowledge / Attack Graph                       | `OPTIONAL`          | May consume derived references, never replace provenance.                                                                                                                                                                                          |
| ACS-XCAP-009 Reporting / Analytics / Intelligence           | `OPTIONAL`          | May read/export only through classification and export controls.                                                                                                                                                                                   |
| ACS-XCAP-010 Notification / Escalation / Case Orchestration | `OPTIONAL`          | May receive tenant-safe event metadata; no raw evidence in events.                                                                                                                                                                                 |
| ACS-XCAP-011 Cognitive Cyber Fusion                         | `FUTURE_DEPENDENCY` | XCAP-005 exposes evidence ID, provenance, integrity status, source trust, derivation lineage and classification for M0; Fusion cannot mutate raw evidence.                                                                                         |
| ACS-CYB-001 Asset Discovery & Cyber Asset Inventory         | `FUTURE_DEPENDENCY` | May produce observations/evidence, reference canonical evidence and derive normalized asset observations; it cannot create private evidence authority, replace provenance, mutate raw evidence, bypass connector trust or bypass tenant authority. |

Graph, correlation, AI, reporting and case orchestration are
`NOT_APPLICABLE_TO_XCAP005_CORE_WITH_JUSTIFICATION`: XCAP-005 owns evidence
identity/integrity/provenance/custody, not the downstream semantic processing
or case authority. Their optional/future-consumer contracts above avoid
dependency inversion.

`XCAP_011_M0_PREREQUISITE = SATISFIED`
`CYB_001_EVIDENCE_CONTRACT = SATISFIED`

### 11.10 Observability and production-readiness contract

Required bounded metrics and alert classes cover ingestion rate/latency/failure;
integrity-verification failure; quarantine; duplicate/replay; custody failure;
storage failure; backpressure; retention/hold/destruction actions; audit/outbox
atomicity failures; and authorization/tenant-denial rates. Metric labels use
approved bounded classifications only—never evidence content, digest, source
payload, token, credential or unbounded identifier. `SLO_THRESHOLD =
GOVERNED_CONFIGURATION`; final numerical SLOs, capacity, HA/DR and recovery
targets remain governance decisions but do not weaken the mandatory
instrumentation contract.

Production acceptance requires load/soak/chaos, large-evidence/backpressure,
backup/restore, reprocessing, tamper verification, recovery and fail-closed
validation before production use.

`OBSERVABILITY_MODEL_COMPLETE = YES`

## 12. Deterministic acceptance matrices

### 12.1 Positive acceptance matrix

| ID                | Precondition                                       | Action                                   | Expected result                                                       | Required evidence                           |
| ----------------- | -------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| `XCAP005-POS-001` | Registered tenant-bound source; trusted context    | Ingest valid bounded evidence            | Immutable record, initial custody/audit/outbox atomically recorded    | Record, custody, audit and event references |
| `XCAP005-POS-002` | Existing evidence with accessible reference        | Re-verify content                        | Matching digest produces append-only verification fact                | Hash verification fact                      |
| `XCAP005-POS-003` | Authorized parent evidence                         | Create governed derivation               | New derived identity links immutable parent/transformation provenance | Parent/derivation/custody facts             |
| `XCAP005-POS-004` | Existing evidence                                  | Append authorized custody action         | Prior custody remains unchanged; new entry is appended                | Ordered custody history                     |
| `XCAP005-POS-005` | Active same-tenant membership with read permission | Read metadata/content per classification | Server-authorized, RLS-scoped access                                  | Request/audit evidence                      |
| `XCAP005-POS-006` | Export permission and required approvals           | Export permitted evidence                | Export provenance, custody and audit atomically recorded              | Approval/export/audit facts                 |
| `XCAP005-POS-007` | Applicable retention policy, no hold               | Apply retention action                   | Append-only policy decision recorded                                  | Retention/custody/audit facts               |
| `XCAP005-POS-008` | Active legal hold                                  | Evaluate destruction                     | Destruction is prohibited; hold preserved                             | Bounded denial/audit fact                   |
| `XCAP005-POS-009` | Prior canonical command result                     | Retry same request                       | Original result returned; no duplicate governed side effect           | One record/custody/audit/outbox set         |
| `XCAP005-POS-010` | Registered trusted connector                       | Submit valid source event                | Connector-bound ingest recorded under its tenant                      | Connector/source/audit facts                |

### 12.2 Negative security matrix

| ID                | Threat                    | Action                                     | Expected fail-closed result                                  | Required evidence                |
| ----------------- | ------------------------- | ------------------------------------------ | ------------------------------------------------------------ | -------------------------------- |
| `XCAP005-NEG-001` | Cross-tenant read         | Read another tenant's evidence             | Denied with no content disclosure                            | Bounded denial/audit             |
| `XCAP005-NEG-002` | Cross-tenant write        | Write under another tenant                 | Denied; no record/custody/event                              | Bounded denial and absence proof |
| `XCAP005-NEG-003` | Tenant spoofing           | Supply client tenant override              | Server context prevails; request denied or scoped safely     | Context/audit evidence           |
| `XCAP005-NEG-004` | Content tamper            | Alter raw bytes after ingest               | Re-verification fails; tamper fact/quarantine policy applies | Integrity-failure fact           |
| `XCAP005-NEG-005` | Metadata tamper           | Alter immutable metadata                   | Denied/detected; no overwrite                                | Audit/integrity evidence         |
| `XCAP005-NEG-006` | Invalid hash              | Submit mismatching declared digest         | Ingest denied/quarantined                                    | Bounded rejection fact           |
| `XCAP005-NEG-007` | Untrusted connector       | Submit from unregistered/revoked connector | Denied/quarantined; no authoritative evidence                | Connector/audit fact             |
| `XCAP005-NEG-008` | Connector tenant mismatch | Connector submits for another tenant       | Denied; no side effects                                      | Bounded denial                   |
| `XCAP005-NEG-009` | Replay                    | Replay source event                        | Canonical result only; no duplicate side effect              | Idempotency proof                |
| `XCAP005-NEG-010` | Duplicate side effect     | Reuse idempotency identity divergently     | Conflict; no second record/custody/audit/outbox              | Conflict/absence proof           |
| `XCAP005-NEG-011` | Oversized input           | Submit over size policy                    | Refused/quarantined before authoritative persistence         | Policy/audit fact                |
| `XCAP005-NEG-012` | Malicious content         | Submit unsafe/parser-abusive input         | Isolated/quarantined; no unsafe processing                   | Quarantine/audit fact            |
| `XCAP005-NEG-013` | Unauthorized read         | Read without permission                    | Denied with no content                                       | Bounded denial                   |
| `XCAP005-NEG-014` | Unauthorized export       | Export without elevated authority          | Denied; no export provenance                                 | Bounded denial/absence proof     |
| `XCAP005-NEG-015` | Unauthorized destruction  | Destroy without required control           | Denied; evidence/custody preserved                           | Bounded denial/history           |
| `XCAP005-NEG-016` | Legal-hold destruction    | Destroy while hold active                  | Denied regardless of ordinary authority                      | Hold/denial proof                |
| `XCAP005-NEG-017` | Stale concurrency         | Submit stale transition version            | Domain conflict; no second transition                        | Version/conflict proof           |
| `XCAP005-NEG-018` | Custody divergence        | Attempt inconsistent custody action        | Rejected; append-only chain preserved                        | Chain/audit proof                |
| `XCAP005-NEG-019` | Audit divergence          | Fail audit coupling                        | Whole transaction rolls back                                 | Absence/rollback proof           |
| `XCAP005-NEG-020` | Outbox divergence         | Fail outbox coupling                       | Whole transition rolls back                                  | Absence/rollback proof           |
| `XCAP005-NEG-021` | Raw-evidence mutation     | Update original evidence                   | Denied; original hash/reference unchanged                    | Immutability proof               |
| `XCAP005-NEG-022` | AI mutation               | AI/correlation tries to alter raw evidence | Denied; only governed derivation may be created              | Provenance/denial proof          |
| `XCAP005-NEG-023` | Sensitive telemetry leak  | Emit content/secrets in logs/events        | Prohibited and test-detected                                 | Safe telemetry inspection        |

## 13. Supporting-governance artifacts and remaining gates

The separate [Definition of Done](ACS-XCAP-005-EVIDENCE-CHAIN-OF-CUSTODY-DOD.md)
defines objective implementation evidence and requires approval before it can
be used as an acceptance gate. The separate
[traceability matrix](../traceability/ACS-XCAP-005-EVIDENCE-CHAIN-OF-CUSTODY-TRACEABILITY-MATRIX.md)
maps every remediation requirement to authority, threat, acceptance and future
implementation evidence.

The [Initial Policy and Contract Registry](../governance/cyberdefense/ACS-XCAP-005-EVIDENCE-CHAIN-OF-CUSTODY-INITIAL-POLICY-AND-CONTRACT-REGISTRY.md)
registers the proposed initial crypto, data/event, ownership, permission/role,
classification, retention/hold, export and destruction contracts. Its entries
remain subject to explicit human governance approval.

`DOD_DEFINED = YES`
`DOD_APPROVAL_REQUIRED = YES`
`TRACEABILITY_COMPLETE = YES`
`POSITIVE_ACCEPTANCE_MATRIX = COMPLETE`
`NEGATIVE_SECURITY_MATRIX = COMPLETE`

The DoR is storage-technology neutral: canonical metadata persistence plus a
content/blob-reference abstraction is sufficient at this contract level.
`NEW_STORAGE_TECHNOLOGY_REQUIRED = UNRESOLVED`; a selected new storage or KMS
technology requires an ADR, but selection is not silently deferred once an
implementation proposal depends on it.

The XCAP-005 governance package and accountability gate are approved, but
implementation is blocked by the external platform-wide MPA dependency. The
[MPA DoR](ACS-PLATFORM-MPA-DOR.md) is human-governance approved and awaits
canonical publication, CI validation, merge and post-merge verification before
XCAP-005 can bind sensitive
export, retention-override and destruction operations to reusable approval
authority. This does not alter the XCAP-005 policy, data contract or matrices.

`IMPLEMENTATION_READY = NO`
`IMPLEMENTATION_BLOCKER = PLATFORM_WIDE_MPA_DEPENDENCY`
`IMPLEMENTATION_AUTHORIZED = NO`
`ACS_XCAP_005_IMPLEMENTATION = NOT_AUTHORIZED`
`CYBERDEFENSE_IMPLEMENTATION = NONE`
