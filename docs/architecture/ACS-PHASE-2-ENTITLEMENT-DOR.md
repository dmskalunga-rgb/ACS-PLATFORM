# ACS Phase 2 — Tenant-Scoped Commercial Entitlement Definition of Ready

**Status:** `DETERMINISTIC_FOR_IMPLEMENTATION_PREPARATION`
**Implementation status:** `LOCAL_IMPLEMENTATION_EVIDENCED`
**ADR:** [ADR-0023](decisions/ADR-0023-tenant-scoped-commercial-entitlement.md) (`PROPOSED`)

## 1. Authority and aggregate boundary

The repository-owner disposition selects `NEXT_CAPABILITY = ENTITLEMENT` after the integrated Subscription slice. Entitlement is a separate, tenant-scoped, non-financial aggregate. It is not a mutation of Subscription, Contract, Proposal, Plan, Plan Feature, Customer, Usage, Billing, Invoice, Payment, Receipt, Collection, Accounting, or Commission.

An Entitlement is created only by an explicit command against one authoritative same-tenant `ACTIVE` Subscription. Contract-less and Subscription-less creation are prohibited. An `ACTIVE` Subscription never creates an Entitlement automatically.

There is at most one current Entitlement for the same immutable Subscription-origin Plan-line assertion. This deterministic cardinality prevents duplicate access assertions without inventing quantity, quota, seat, capacity, metering, or financial semantics.

## 2. Immutable origin and content model

The client supplies only `subscription_id`; tenant, Customer, Contract, Plan, Plan Feature, quantity, limit, quota, billing, and lifecycle authority are rejected. The server derives and snapshots:

- trusted tenant ID and authoritative Subscription ID/version/status;
- immutable Subscription Contract and Customer origin;
- the immutable Subscription commercial-origin Plan-line identity and available Plan identity/code/name/description; and
- a Plan Feature reference only if that fact is already present in the immutable source snapshot.

The minimal deterministic entitlement type is `PLAN_LINE_ACCESS`: an access assertion for one immutable commercial Plan line. It has no quantity, limit, meter, allowance, seat, storage, or monetary meaning. Missing historical Plan Feature evidence remains absent; implementation must not look up later mutable Plan Feature state to manufacture a feature entitlement.

## 3. Lifecycle and effective dates

| From                    | Explicit action      | To                   | Rule                                                                                |
| ----------------------- | -------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| —                       | `create`             | `DRAFT`              | Requires one same-tenant `ACTIVE` Subscription and unused current origin assertion. |
| `DRAFT`                 | `request-activation` | `PENDING_ACTIVATION` | Explicit, expected-version command.                                                 |
| `PENDING_ACTIVATION`    | `activate`           | `ACTIVE`             | Separate authorized actor; creator self-activation is denied.                       |
| `ACTIVE`                | `suspend`            | `SUSPENDED`          | Explicit, versioned command only.                                                   |
| `SUSPENDED`             | `resume`             | `ACTIVE`             | Explicit, versioned command only.                                                   |
| `ACTIVE` or `SUSPENDED` | `cancel`             | `CANCELLED`          | Terminal state.                                                                     |
| `ACTIVE` or `SUSPENDED` | `terminate`          | `TERMINATED`         | Terminal state.                                                                     |

No automatic activation, suspension, restoration, expiry, cancellation, termination, renewal, or Subscription mutation is permitted. `effective_from` is required and cannot precede the governing Subscription effective authority. `effective_until`, when supplied, must be later than `effective_from` and cannot exceed the governing Subscription end when one exists. Terminal states are immutable.

## 4. Ownership, SoD, and permissions

Owner assignment is explicit, expected-version protected, and limited to an active membership of the same tenant. The immutable creator remains available for audit. Activation is an approval-like state transition: a creator cannot activate their own Entitlement. No broad `manage` permission or administrative runtime bypass is allowed.

Proposed least-privilege vocabulary:

- `commercial.entitlement.read`
- `commercial.entitlement.create`
- `commercial.entitlement.update`
- `commercial.entitlement.assign`
- `commercial.entitlement.request_activation`
- `commercial.entitlement.activate`
- `commercial.entitlement.suspend`
- `commercial.entitlement.resume`
- `commercial.entitlement.cancel`
- `commercial.entitlement.terminate`

## 5. Mandatory security and transaction path

Every path must be:

`signed OIDC → canonical identity → active tenant membership → AuthorizationPort → trusted context → least-privilege PostgreSQL role → RLS/FORCE RLS → transaction → audit/outbox`.

Knowing an entitlement, Subscription, Contract, Customer, Plan, or Plan Feature identifier grants no authority. Every relationship is verified server-side in the trusted tenant context. Mutations require tenant-scoped idempotency and `expected_version`; divergent idempotency payload reuse and stale versions conflict.

Aggregate write, immutable origin/history snapshot, audit record, outbox event, idempotency record, and version update commit atomically. TEST_ONLY failure injection after any mandatory write must prove complete rollback.

## 6. Events and downstream firewall

Tenant-safe proposed events are `commercial.entitlement.created`, `requested_activation`, `activated`, `suspended`, `resumed`, `cancelled`, `terminated`, `updated`, and `assigned`. They contain identifiers, status/version, and approved immutable origin references only—never PII, quantities, limits, pricing, payment, or mutable full Plan Feature data.

The following are mandatory `NONE` results:

- `ENTITLEMENT_TO_USAGE_SIDE_EFFECT = NONE`
- `ENTITLEMENT_TO_BILLING_SIDE_EFFECT = NONE`
- `ENTITLEMENT_TO_INVOICE_SIDE_EFFECT = NONE`
- `ENTITLEMENT_TO_PAYMENT_SIDE_EFFECT = NONE`
- `ENTITLEMENT_TO_RECEIPT_SIDE_EFFECT = NONE`
- `ENTITLEMENT_TO_COLLECTION_SIDE_EFFECT = NONE`
- `ENTITLEMENT_TO_ACCOUNTING_SIDE_EFFECT = NONE`
- `ENTITLEMENT_TO_COMMISSION_SIDE_EFFECT = NONE`

No provisioning/access-control integration is implied by this commercial assertion; a future consuming capability requires independent governance.

## 7. Deterministic acceptance matrix

### Positive cases

| ID          | Precondition / command                             | Expected result / required evidence                                                           |
| ----------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ENT-POS-001 | Same-tenant `ACTIVE` Subscription; explicit create | One `DRAFT` Entitlement with server-derived immutable origin.                                 |
| ENT-POS-002 | Create                                             | Customer, Contract, Subscription, Plan-line and available feature facts are snapshot-derived. |
| ENT-POS-003 | List/detail                                        | Tenant-scoped read succeeds through signed OIDC and RLS/FORCE RLS.                            |
| ENT-POS-004 | Draft update/assign                                | Bounded update and active same-tenant owner assignment succeed.                               |
| ENT-POS-005 | Request activation                                 | `DRAFT → PENDING_ACTIVATION` is explicit and versioned.                                       |
| ENT-POS-006 | Separate actor activates                           | `PENDING_ACTIVATION → ACTIVE` succeeds with valid effective dates.                            |
| ENT-POS-007 | Suspend/resume                                     | `ACTIVE → SUSPENDED → ACTIVE` succeeds explicitly.                                            |
| ENT-POS-008 | Cancel                                             | Authorized terminal `CANCELLED` transition succeeds.                                          |
| ENT-POS-009 | Terminate                                          | Authorized terminal `TERMINATED` transition succeeds.                                         |
| ENT-POS-010 | Idempotent replay                                  | Same tenant-scoped command returns canonical original outcome.                                |
| ENT-POS-011 | Concurrent expected-version mutation               | Exactly one mutation succeeds; competing stale mutation conflicts.                            |
| ENT-POS-012 | Mutation                                           | Aggregate, history, audit, outbox and idempotency commit atomically.                          |

### Negative and security cases

| ID          | Precondition / command                                             | Expected result / required evidence                                |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| ENT-NEG-001 | Unauthenticated request                                            | Denied.                                                            |
| ENT-NEG-002 | Missing action permission                                          | Denied.                                                            |
| ENT-NEG-003 | Missing, foreign, non-`ACTIVE`, or terminal Subscription           | Rejected.                                                          |
| ENT-NEG-004 | Cross-tenant Entitlement/Subscription BOLA or IDOR reference       | Denied without disclosure.                                         |
| ENT-NEG-005 | Client tenant/Customer/Contract/Plan/Feature substitution          | Rejected.                                                          |
| ENT-NEG-006 | Duplicate current immutable origin assertion                       | Prevented under sequential, replay, and concurrent creation.       |
| ENT-NEG-007 | Quantity, limit, quota, meter, seat, capacity or financial input   | Rejected.                                                          |
| ENT-NEG-008 | Creator self-activation                                            | Denied.                                                            |
| ENT-NEG-009 | Invalid transition or terminal mutation                            | Rejected.                                                          |
| ENT-NEG-010 | Invalid effective dates or dates outside Subscription authority    | Rejected.                                                          |
| ENT-NEG-011 | Stale expected version                                             | Conflict without partial mutation.                                 |
| ENT-NEG-012 | Divergent idempotency-key payload                                  | Conflict.                                                          |
| ENT-NEG-013 | Trusted-context replacement by body/query/route/JWT-only authority | Denied.                                                            |
| ENT-NEG-014 | Direct least-privilege database session                            | Cannot bypass RLS/FORCE RLS.                                       |
| ENT-NEG-015 | TEST_ONLY audit/outbox/history failure                             | Full transaction rollback; no partial artifacts.                   |
| ENT-NEG-016 | Event/audit payload                                                | Contains no sensitive/mutable commercial facts.                    |
| ENT-NEG-017 | Unauthorized amplification or automatic downstream effect          | No Usage, financial, accounting, or Commission side effect exists. |
| ENT-NEG-018 | Broad administrative runtime bypass                                | Denied; only explicit permissions are authoritative.               |

## 8. Definition of Ready and preserved governance

`ENTITLEMENT_DOR_READY_FOR_PUBLICATION_REVIEW` requires this DoR, ADR-0023, traceability, threat analysis, and catalog reconciliation to be consistent and documentation-only. It authorizes neither implementation nor publication.

`ADR-0023 = PROPOSED`. Retention, formal SLO, named owners/approvers, production step-up/IdP/broker decisions, QG-18–QG-22, baseline custody, ACS-REQ completeness, and commit-signing enforcement remain unresolved.
