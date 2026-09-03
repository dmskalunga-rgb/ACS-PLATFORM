# ACS Platform — Multi-Person Authorization Definition of Ready

**Status:** `HUMAN_GOVERNANCE_APPROVED_PENDING_CANONICAL_PUBLICATION`
**Capability identity:** `ACS-PLATFORM-MPA` (approved for governance registration)
**Implementation authorization:** `NOT AUTHORIZED`

## Authority and placement

Baseline Enterprise v5.3, section 5.43, requires a Multi-Person
Authorization (MPA) module based on four-eyes, dual control and separation of
duties for critical operations. It gives examples including sensitive data
export, privileged-account creation and log deletion. The baseline establishes
the requirement; it does not prescribe an implemented MPA lifecycle, authority
class catalogue or runtime API.

`ACS-PLATFORM-MPA` is approved as a transversal platform capability subordinate
to canonical ACS authorization. It extends, and must reuse, `AuthorizationPort`,
trusted server tenant context, active membership/role authority, RLS/FORCE RLS,
canonical audit, Event Foundation and transactional outbox. It creates no
parallel authorization, tenant, audit or event system.

The published authorization-bootstrap envelope is **not** generic MPA. Its
status is `UNPUBLISHED_PROPOSED`; its scope is the deployment-time,
tenant-scoped creation of the first `tenant-authorization-administrator`.
Reusable concepts are immutable tenant/target/request binding, expected version,
expiry, reject/revoke/consume, atomic single-use consumption, audit/outbox,
and fail-closed concurrency. Non-reusable semantics are its fixed target role,
deployment-only requester, two bootstrap fingerprint allowlists, 30-minute
bootstrap policy and one-time initial-role authorization.

## Generic mission and boundary

MPA governs a bounded request where one operational actor cannot authorize a
specified protected operation alone. An envelope binds immutable tenant,
operation, resource/target, requester, approval-policy identifier and version,
authority composition, request/correlation identity, creation time, expiry and
expected version. Cross-tenant and cross-operation reuse are prohibited;
cross-target reuse is prohibited by default.

Consumers submit only governed operation, target, tenant context, policy and
authority-composition references. MPA returns an authorization-state/proof
reference. Consumer content, evidence and business side effects remain outside
MPA. A consumer may not create a local approval engine.

## Scope, non-scope and dependencies

MPA scope is generic tenant-bound approval requests, authority composition,
lifecycle, SoD, immutable binding, expiry, reject/revoke/consume, idempotency,
concurrency, atomicity, AuthorizationPort integration, canonical audit, Event
Foundation/outbox and the generic consumer contract.

MPA does not own consumer business semantics, XCAP-005 evidence logic,
commercial-pricing approval, a BPM/workflow platform, case management, identity
proofing, human-resource identity verification, physical-person biometrics, or
parallel authorization/audit/event infrastructure.

MPA depends on canonical OIDC identity, trusted tenant context,
AuthorizationPort, applicable membership/authority data, audit, Event
Foundation, transactional outbox, observability, and PostgreSQL/RLS/FORCE RLS
when a future implementation persists tenant data. It does not depend on
XCAP-005; XCAP-005 depends on MPA.

`DOR_SCOPE = COMPLETE`
`DOR_NON_SCOPE = COMPLETE`
`DEPENDENCY_INVERSION = NONE`

## Governed generic model

| Concept              | Proposed invariant                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requester / approver | `REQUEST_PERMISSION != APPROVAL_AUTHORITY` where a policy requires independence.                                                                                                                                           |
| Authority class      | Policy-defined classes are registered through canonical governance. Clients and consumers cannot invent unregistered classes. Bootstrap classes apply only where a consumer policy explicitly binds them.                  |
| Human independence   | Technical identity and authority-class independence are validated by ACS. Physical-person independence is `EXTERNAL_HUMAN_CONFIRMATION_REQUIRED`.                                                                          |
| SoD                  | Self-approval is prohibited where independence is required. One actor cannot occupy multiple required distinct approvals. Same-class multiplicity is policy-defined. Governance ownership grants no operational authority. |
| Lifecycle            | `REQUESTED → PARTIALLY_APPROVED → APPROVED`; `REJECTED`, `REVOKED`, `CONSUMED` and `EXPIRED` are terminal. No non-`APPROVED` state authorizes use.                                                                         |
| Consumption          | `SINGLE_USE` is required for destructive/one-shot actions. `MULTI_USE_IF_EXPLICITLY_GOVERNED` is allowed only by policy. Consumption and protected operation share one atomic boundary where persistence applies.          |
| Concurrency          | Expected-version and transactional locking govern decisions. Last-write-wins security decisions are prohibited. Concurrent consume permits one success only.                                                               |
| Idempotency          | Request, decision, consumption and protected-operation retries bind to tenant, actor, command and canonical request fingerprint; divergent reuse fails closed.                                                             |
| Tenant               | Server tenant authority is mandatory; client tenant authority is none; RLS/FORCE RLS applies where persistence is tenant-bound.                                                                                            |
| Audit/event          | Every transition uses canonical audit; Event Foundation/outbox applies transactionally where required. Events contain only bounded governance metadata, never secrets or resource content.                                 |

Candidate Event Foundation names (`authorization.approval.requested`,
`partially_approved`, `approved`, `rejected`, `revoked`, `consumed`, `expired`)
are proposals only and require Event Foundation registration/versioning.

## Lifecycle and state-transition contract

| State                | Entry condition                                         | Allowed transition                                                 | Authorization effect                               | Concurrency rule                          |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------- |
| `REQUESTED`          | Valid tenant-bound request and policy                   | `PARTIALLY_APPROVED`, `APPROVED`, `REJECTED`, `REVOKED`, `EXPIRED` | None                                               | Expected version required                 |
| `PARTIALLY_APPROVED` | A valid subset of required independent decisions exists | `APPROVED`, `REJECTED`, `REVOKED`, `EXPIRED`                       | None                                               | Expected version required                 |
| `APPROVED`           | All policy-required independent approvals are valid     | `CONSUMED`, `REVOKED`, `EXPIRED`                                   | Only the bound operation/target/policy may proceed | Consumption locks the governed transition |
| `REJECTED`           | Authorized rejection                                    | None                                                               | None                                               | Terminal                                  |
| `REVOKED`            | Authorized revocation before use                        | None                                                               | None                                               | Terminal                                  |
| `CONSUMED`           | Atomic governed use                                     | None                                                               | None for single-use policy                         | Terminal; replay denied                   |
| `EXPIRED`            | Authoritative time exceeds policy expiry                | None                                                               | None                                               | Terminal                                  |

Ambiguous, stale or conflicted state authorizes nothing. Reject/revoke/approve
and consume races must use expected-version controls and a canonical atomicity
boundary; last-write-wins is prohibited.

## Generic policy, binding and consumer contract

An approved MPA policy must register: `policy_id`, version, request permission,
approve/reject/revoke/consume/read permissions, required authority-class
composition, distinct actor/class requirements, requester independence, expiry,
single-use or explicitly governed reuse, protected-operation eligibility and
audit/event rules. Its immutable envelope binding contains tenant, operation,
target, requester, policy/version, authority requirements, request/correlation
identity, creation time, expiry and expected version.

A consumer supplies only server-resolved tenant context, registered operation,
target, policy/version and required composition reference. It receives canonical
state/proof/reference and must atomically bind consumption to its protected
operation where policy requires it. It cannot supply authority classes, tenant
authority, approval state or protected-content payload to MPA.

## Threat, audit, event and observability contracts

The MPA threat model covers self approval, authority-class forgery,
client-fabricated authority, tenant spoofing, cross-tenant/operation/target
reuse, replay, consumed/rejected/revoked/expired use, stale version, concurrent
double consumption, audit omission, outbox divergence, unauthorized transition,
policy-version substitution and false physical-human independence claims.

MPA uses canonical ACS audit only. Applicable transition audit metadata is the
MPA envelope ID, tenant ID, policy ID/version, protected operation ID, bounded
target reference, requester and acting-approver identity references, authority
class, action, previous/resulting state, request/correlation ID, timestamp,
expected/resulting version, policy-permitted reason reference and consumption
outcome. Tokens, credentials, secrets, protected payloads and sensitive
consumer content are prohibited.

MPA uses existing Event Foundation and transactional outbox only. The semantic
events requested, partially approved, approved, rejected, revoked, consumed and
expired each carry tenant, envelope ID, protected operation, policy/version,
lifecycle state, request/correlation context, event-schema version and audit
relationship. They never carry protected content. Exact names and registration
remain `PENDING_CANONICAL_EVENT_REGISTRATION`.

Bounded observability covers request, partial/complete approval, rejection,
revocation, expiry, consumption, latency, SoD/wrong-authority/tenant denials,
stale-version and concurrency conflicts, retries/replay and failed atomic
operations. Security-significant anomaly alerts are required. Numeric SLOs are
`FUTURE_GOVERNED_CONFIGURATION`. Telemetry must not contain protected content,
tokens or credentials.

`MPA_AUDIT_METADATA_CONTRACT = DEFINED`
`EVENT_SEMANTIC_CONTRACT = COMPLETE`
`OBSERVABILITY_CONTRACT = COMPLETE`
`DOR_THREAT_MODEL = COMPLETE`

## Acceptance-governance matrix

| ID            | Requirement                             | Expected future evidence                            |
| ------------- | --------------------------------------- | --------------------------------------------------- |
| `MPA-POS-001` | Valid policy-bound request              | `REQUESTED` envelope with audit metadata            |
| `MPA-POS-002` | Partial independent approval            | `PARTIALLY_APPROVED`, no operation authority        |
| `MPA-POS-003` | Complete required authority composition | `APPROVED` only within bound scope                  |
| `MPA-POS-004` | Atomic single-use consumption           | One governed side effect and `CONSUMED` state       |
| `MPA-POS-005` | Idempotent protected-operation retry    | Original result, no duplicate authority effect      |
| `MPA-NEG-001` | Self approval                           | Denied; no approval state advance                   |
| `MPA-NEG-002` | Wrong or unregistered authority class   | Denied fail-closed                                  |
| `MPA-NEG-003` | Cross-tenant approval or consume        | Denied; no side effect                              |
| `MPA-NEG-004` | Wrong operation reuse                   | Denied; no side effect                              |
| `MPA-NEG-005` | Wrong target reuse                      | Denied; no side effect                              |
| `MPA-NEG-006` | Rejected envelope use                   | Denied; no side effect                              |
| `MPA-NEG-007` | Revoked envelope use                    | Denied; no side effect                              |
| `MPA-NEG-008` | Expired envelope use                    | Denied; no side effect                              |
| `MPA-NEG-009` | Consumed approval replay                | Denied; no second side effect                       |
| `MPA-NEG-010` | Concurrent double consumption           | Exactly one success; other attempt conflicts/denies |
| `MPA-NEG-011` | Stale expected version                  | Conflict; no state advance                          |

Bootstrap tests remain `PARTIALLY_REUSABLE`: their lifecycle/concurrency
properties may inspire requirements but are not generic MPA execution evidence.

Future implementation evidence must cover contracts, domain/service behavior,
persistence where required, tenant isolation, AuthorizationPort, authority
classes, SoD, lifecycle/state transitions, binding/expiry, reject/revoke/
consume, idempotency, concurrency, atomicity, audit/outbox/events,
observability, all matrix cases, security validation and regression.

`DOR_ACCEPTANCE_SURFACE = COMPLETE`

## XCAP-005 proposed consumer binding

`cyberdefense.evidence.export`,
`cyberdefense.evidence.retention_override`, and
`cyberdefense.evidence.destroy` are proposed MPA consumers. Their exact
authority composition, policy versions and reuse semantics must be bound by
approved MPA policy, not made platform defaults. Active legal hold must prohibit
destruction; an unapproved legal-hold override is not authorized.

## Approved human dispositions

`DECISION-MPA-001` through `DECISION-MPA-010` are recorded as approved in the
[MPA policy and contract registry](../governance/cyberdefense/ACS-PLATFORM-MPA-POLICY-AND-CONTRACT-REGISTRY.md).
They establish approved governance content only; controlled publication and a
later implementation authorization remain required.

## Ready condition

The package is human-governance approved and ready for controlled publication
preparation. Canonical publication/change control, then a separate explicit
implementation authorization, remain required.

`MPA_REQUIRED_BY_BASELINE = YES`
`MPA_EXTENDS_EXISTING_AUTHORIZATION_FOUNDATION = YES`
`PARALLEL_AUTHORIZATION_SYSTEM = NO`
`HUMAN_GOVERNANCE_DECISION = APPROVED`
`XCAP_005_IMPLEMENTATION = BLOCKED_BY_MPA_DEPENDENCY`
