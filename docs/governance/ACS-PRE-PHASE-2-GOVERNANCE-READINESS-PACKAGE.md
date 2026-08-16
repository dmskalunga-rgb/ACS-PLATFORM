# ACS Pre-Phase-2 Governance and Operational Readiness Package

Status: `PRE_PHASE_2_TECHNICAL_IMPLEMENTATION_REQUIRED`

Date: 2026-08-16

Starting checkpoint: `develop@8698fe43ae7c4a1f2e3d2d86ae5f1e9dda60d7a2`

This package is advisory and non-normative. It records evidence, proposed dispositions, and
blocking decisions. It does not approve an ADR, select a Phase 2 slice, authorize implementation,
accept risk, or modify the ACS baseline.

## Documentary reconciliation

- Production OIDC/JWT evidence is promoted from remote-CI pending to
  `VERIFIED_AND_INTEGRATED` using runs `31936812725`, `31936812713`, and `31936812776` on the
  integrated starting checkpoint.
- OIDC traceability rows are promoted from `IMPLEMENTED_PENDING_CI` to
  `VERIFIED_AND_INTEGRATED` using the same integrated run set.
- Phase 1 threat controls with direct OIDC, PostgreSQL, RLS, tenant-administration, audit, and
  regression evidence are promoted to `VERIFIED_INTEGRATED`.
- Token replay, global logout/revocation, MFA policy, production IdP registration, retention,
  commit-signing enforcement, and organizational SoD remain open.

No documentation-only check in this change is treated as new functional validation.

## ADR disposition matrix

| ADR      | Implementation consistency                                                                                                               | Evidence                                                                                   | Deviation or residual issue                                                                           | Recommendation                                                    | Authority state                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| ADR-0011 | Trusted identity, server-side membership resolution, AuthorizationPort, opaque grants, and FORCE RLS match the integrated implementation | Phase 1 traceability; Tenant Administration evidence; runs `31936812713`, `31936812776`    | Named owners and operational grant cleanup remain pending                                             | `ACCEPT`                                                          | `PROPOSED`; human approval required |
| ADR-0012 | One-use transaction/PID-bound grants and replay denial match migration and runtime evidence                                              | Tenant Administration evidence; Phase 1 threat analysis; runs `31936812713`, `31936812776` | Retention/cleanup and service-process credential hardening remain pending                             | `REVISE` to add approved operational lifecycle before acceptance  | `PROPOSED`; human approval required |
| ADR-0013 | Provider-neutral OIDC/JWT validation, immutable `iss` + `sub`, safe telemetry, and fail-closed configuration match implementation        | Production OIDC/JWT evidence; runs `31936812725`, `31936812713`, `31936812776`             | Production client registration, MFA assurance policy, refresh/revocation/global logout remain pending | `REVISE` to bind approved production assurance/session policy     | `PROPOSED`; human approval required |
| ADR-0014 | Tenant roles, authorization lifecycle, idempotency, audit, and transactional outbox match the integrated slice                           | Tenant Administration evidence; runs `31935367613`, `31935367596`, `31935367655`           | Publisher, retention, global SoD, and MFA/step-up are explicitly incomplete                           | `REVISE` before approval to record the operational/event boundary | `PROPOSED`; human approval required |

`ACCEPT` is a recommendation to the accountable human authority, not an approval or status
transition. No ADR status was changed by this package.

## Phase 2 catalog readiness

The ECOM, EDIM, and EDOLM working catalogs now contain candidate entries for the Commercial
boundary, explicit authorization, tenant-scoped relational data, audit, and event delivery. Every
new Phase 2 entry remains `PENDING_GOVERNANCE_APPROVAL` or `PRE_IMPLEMENTATION_CANDIDATE`.

Before a first Phase 2 slice can be authorized, governance must identify:

1. the exact baseline-backed vertical slice and its accountable owner/approver;
2. producer, consumer, contract, failure policy, SLO, test, and evidence obligations;
3. authoritative data sources, tenant scope, owner/steward, classification, lineage, residency,
   retention, deletion, legal basis, and consumers;
4. stable source references while individual normative `ACS-REQ` identifiers remain absent.

The catalog entries do not create entities, schemas, APIs, events, brokers, or requirements.

## MFA and step-up decision package

Proposed decision for human security/governance approval:

- Each privileged operation declares a minimum assurance policy independent of ordinary
  authentication.
- Validated OIDC `acr` and `amr` values are trusted only after issuer-specific mapping approved by
  the Identity Security owner; absent, unknown, stale, or insufficient assurance fails closed.
- Tenant role and membership administration requires step-up assurance and a bounded freshness
  interval. Future commercial/financial approvals require a separately approved, at least equally
  strong policy.
- The API enforces assurance server-side before issuing an authorization grant. Browser state,
  client claims, or UI visibility never prove assurance or authorization.
- Success, denial, required assurance, observed mapped assurance, correlation, actor, tenant,
  operation, and policy version are durably audited without raw tokens or unnecessary claims.
- Emergency access requires a separately governed break-glass process, time bounds, independent
  review, and high-priority audit/alerting.

Threats addressed include stolen lower-assurance sessions, claim confusion, stale assurance,
step-up bypass, and unaudited privileged use. Production IdP mapping, assurance values, freshness,
fallback behavior, owner, approver, and break-glass policy remain
`GOVERNANCE_DECISION_REQUIRED`.

## Separation-of-duties decision package

Proposed policy model for human approval:

- The actor assigning tenant authorization cannot assign roles to themselves; this control is
  already implemented for the Phase 1 tenant-administration slice.
- Future commercial/financial role combinations must use an approved incompatibility matrix.
  At minimum, request/initiation, approval, settlement/execution, reconciliation, and audit review
  are separate candidate duties; no specific product role is created by this proposal.
- Authorization is evaluated from current server-side membership and role state. Client claims
  cannot satisfy a duty or override an incompatibility.
- Conflicting assignments and attempts fail closed and generate durable, tenant-scoped,
  correlated evidence. Emergency overrides require time bounds and independent retrospective
  review.
- Owners must define who may request, approve, periodically recertify, revoke, and audit each
  privileged role before any affected Phase 2 implementation.

The final incompatibility matrix, role names, approval quorum, recertification interval,
exceptions, and owners remain `GOVERNANCE_DECISION_REQUIRED`.

## Event delivery readiness

### Existing boundary

Tenant Administration writes a canonical, tenant-scoped, append-only outbox record atomically
with each accepted mutation and audit record. This proves transactional capture, not event
delivery. No publisher, broker, delivery retry, DLQ, replay service, or consumer checkpoint exists.

### Required delivery design

- A publisher reads committed outbox records through a least-privilege boundary, claims work
  safely, publishes the canonical versioned envelope, and records delivery state without mutating
  event identity or payload.
- Delivery is at least once. Consumers are idempotent by `event_id` and tenant, with a governed
  deduplication retention window.
- Retry uses bounded exponential backoff with jitter and classified terminal/non-terminal errors.
  Exhausted messages enter a tenant-aware DLQ with alerting and evidence.
- Replay requires explicit authorization, tenant scope, compatible schema, rate limiting,
  correlation, reason, approval where applicable, and immutable audit.
- Ordering is guaranteed only where a contract explicitly names an aggregate/partition key and
  sequence rule; global ordering is not inferred.
- Metrics and alerts cover unpublished age/depth, attempts, latency, terminal failures, DLQ,
  replay, consumer lag, and deduplication outcomes without high-cardinality secrets.
- Event, outbox, delivery-attempt, DLQ, replay, and consumer-deduplication retention require data
  owner, security, privacy, and operational approval.
- Contract compatibility, duplicate delivery, retry, DLQ, replay authorization, cross-tenant
  denial, observability, recovery, and evidence tests are mandatory before delivery acceptance.

### Disposition

VOL-VII-7.7 requires at-least-once delivery, idempotency, retry, dead-letter, and controlled
replay. The current outbox alone does not satisfy that delivery requirement. A separately
authorized technical foundation slice is therefore required before a Phase 2 mutation depends on
events or is accepted as complete. This document does not implement that slice or select a broker.

## Operational hardening disposition

No row records accepted risk; `DEFERRED_WITH_ACCEPTED_RISK` is not used because no risk-acceptance
authority or evidence was provided.

| Item                               | Classification                 | Required disposition/evidence                                                                                  |
| ---------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Outbox retention/cleanup           | `REQUIRED_BEFORE_PHASE_2`      | Bound growth, preserve delivery/replay evidence, define owner, schedule, failure alert, and safe deletion      |
| Idempotency retention/cleanup      | `REQUIRED_BEFORE_PHASE_2`      | Define replay window, tenant isolation, cleanup concurrency, audit, and retry behavior before new mutations    |
| Trusted grant retention/cleanup    | `REQUIRED_BEFORE_PRODUCTION`   | Operational job, bounded retention, monitoring, least privilege, and recovery test                             |
| Production IdP/client registration | `REQUIRED_BEFORE_PRODUCTION`   | Approved issuer/audience/JWKS/client, secret boundary if applicable, owner, rotation, and environment evidence |
| Refresh/revocation/global logout   | `REQUIRED_BEFORE_PRODUCTION`   | Approved session/token lifecycle, provider integration, incident revocation, audit, and user-state evidence    |
| SLO/performance thresholds         | `GOVERNANCE_DECISION_REQUIRED` | Owners must approve measurable latency, availability, throughput, backlog, and recovery objectives             |
| Commit-signing enforcement         | `GOVERNANCE_DECISION_REQUIRED` | Repository/organization authority must choose enforcement scope and exception/break-glass process              |
| GitHub Actions Node.js deprecation | `REQUIRED_BEFORE_PRODUCTION`   | Upgrade affected action versions and revalidate CI without weakening gates                                     |
| Vite `node:crypto` observation     | `REQUIRED_BEFORE_PRODUCTION`   | Prove browser bundle does not execute the crypto path or separate the contract boundary and regression test it |

## Preserved governance gaps

- QG-18 through QG-22 remain `UNDEFINED_IN_BASELINE`.
- Baseline custody and formal `FROZEN` status remain ambiguous.
- ECOM, EDIM, and EDOLM remain incomplete working catalogs pending formal owners and approvals.
- Individual normative `ACS-REQ` identifiers remain incomplete; no identifier is invented here.
- ADR-0011 through ADR-0014 remain `PROPOSED`.
- Owners, approvers, retention authorities, production identity authority, SoD authority, and SLO
  authority remain pending.

## Recommendation

Decision: `PRE_PHASE_2_TECHNICAL_IMPLEMENTATION_REQUIRED`.

Authorize an independent, narrowly scoped event-delivery and operational-lifecycle foundation
only after the associated ADR/catalog/security decisions receive human disposition. After that
slice is implemented and validated, reassess readiness for an independent Phase 2 authorization.
Phase 2 remains `NOT_AUTHORIZED`.
