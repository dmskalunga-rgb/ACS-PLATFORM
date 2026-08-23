# ACS Phase 2 — Tenant-Scoped Commercial Subscription Definition of Ready

**Status:** `DETERMINISTIC_FOR_IMPLEMENTATION_PREPARATION`
**Implementation status:** `NOT_IMPLEMENTED`
**ADR:** [ADR-0022](decisions/ADR-0022-tenant-scoped-commercial-subscription.md) (`PROPOSED`)
**Phase boundary:** Commercial Subscription only; no Billing, Invoice, Payment, Collection, Entitlement, Usage, Release, or Production authorization.

## 1. Purpose and bounded aggregate

`Commercial Subscription` is a tenant-scoped commercial aggregate. It is separate from Contract, Plan, Plan Feature, Entitlement, Usage, Billing, Invoice, Payment, Receipt, Collection, Partner, Commission, CRM, and accounting aggregates.

A Subscription records an explicitly requested, non-financial commercial lifecycle that originates from an authoritative `ACTIVE` Contract. It does not provision capacity, seats, modules, limits, access, or runtime entitlements.

The initial implementation boundary is deliberately narrow:

- create a Subscription only by an explicit command using one authoritative `ACTIVE` Contract;
- preserve immutable commercial origin and lifecycle facts;
- authorize and isolate the aggregate in the existing OIDC, AuthorizationPort, trusted-context, PostgreSQL RLS/FORCE RLS, audit, and outbox path;
- expose only the API and UI workflows listed in this document.

## 2. Authoritative origin and immutable facts

### 2.1 Contract origin

Creation is explicit; Contract activation must never create a Subscription automatically. Contract-less creation is rejected.

The command supplies only `contract_id`; tenant, Customer, Plan, Plan Feature, quantities, commercial terms, and lifecycle state are never accepted as client authority. The server must verify that the Contract:

- belongs to the trusted tenant context;
- is `ACTIVE`;
- has an authoritative Customer origin; and
- has no current Subscription in that tenant.

There is at most one current Subscription for a Contract. Replaying the same idempotency key returns the original result; a concurrent or distinct request for the same current Contract is rejected without creating a second Subscription.

`source_contract_id`, the source Contract revision/version, Contract identifier, Customer origin, and Contract commercial origin are immutable after creation. A Subscription creation request against a Contract lacking an authoritative Customer origin is invalid rather than permitting a client-supplied Customer substitute.

### 2.2 Customer and Plan origin

The Subscription Customer is derived only from the authoritative Contract origin and is immutable. Client-provided Customer IDs are rejected.

The Subscription preserves an immutable commercial-origin snapshot for every Plan line represented by its authoritative Contract origin. The minimal snapshot contains the source line identity, Plan identity, Plan code/name/description available in the Contract commercial snapshot, and quoted quantity/value facts already preserved by that source. It is historical commercial evidence, not a mutable lookup and not a financial calculation.

Plan Feature origin is preserved only when it is already present in the authoritative Contract commercial origin. A missing historical Plan Feature fact remains absent; the Subscription must not look up a later mutable Plan Feature state and must not create runtime entitlement semantics to fill that gap.

Contract quantity remains a commercial source fact only. It must not become capacity, seats, users, storage, modules, limits, entitlement, usage allowance, or provisioning authority.

## 3. Data and lifecycle model

Required aggregate facts are tenant ID, immutable origin facts, status, effective dates, owner, creator, current version, immutable revision/history records, audit references, and outbox references. The implementation must use the repository's established expected-version and idempotency patterns.

### 3.1 Lifecycle

| From                    | Explicit action      | To                   | Rule                                                                                                            |
| ----------------------- | -------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| —                       | `create`             | `DRAFT`              | Requires the authoritative `ACTIVE` Contract origin.                                                            |
| `DRAFT`                 | `request-activation` | `PENDING_ACTIVATION` | Explicit, versioned action only.                                                                                |
| `PENDING_ACTIVATION`    | `activate`           | `ACTIVE`             | Separate authority; creator self-activation is denied.                                                          |
| `ACTIVE`                | `suspend`            | `SUSPENDED`          | Explicit, versioned action only.                                                                                |
| `SUSPENDED`             | `resume`             | `ACTIVE`             | Explicit, versioned action only.                                                                                |
| `ACTIVE` or `SUSPENDED` | `cancel`             | `CANCELLED`          | Terminal state.                                                                                                 |
| `ACTIVE` or `SUSPENDED` | `terminate`          | `TERMINATED`         | Terminal state.                                                                                                 |
| `ACTIVE`                | `renew`              | `ACTIVE`             | Explicit only; records immutable history/revision and may extend a defined end date only to a later valid date. |

No other transition is valid. `CANCELLED` and `TERMINATED` are terminal. Renew is never automatic, never changes the Contract, and has no price, invoice, payment, entitlement, usage, or downstream effect.

`effective_from` is required. `effective_until`, when present, must be later than `effective_from`. A start date cannot precede the governing Contract's effective authority. Server-side validation, not client interpretation, enforces these constraints.

### 3.2 Ownership and segregation of duties

The owner must be an active membership of the same tenant. Owner assignment is explicit and versioned. The immutable creator is retained for audit and SoD evaluation.

The initial policy requires a distinct authorized actor for `activate`: the Subscription creator cannot self-activate. This restriction is enforced by the application authorization path and must not be bypassed by a broad administrative runtime role.

## 4. Authorization and security invariants

The following least-privilege permissions are the proposed Subscription permission vocabulary:

- `commercial.subscription.read`
- `commercial.subscription.create`
- `commercial.subscription.update`
- `commercial.subscription.assign`
- `commercial.subscription.request_activation`
- `commercial.subscription.activate`
- `commercial.subscription.suspend`
- `commercial.subscription.resume`
- `commercial.subscription.cancel`
- `commercial.subscription.terminate`
- `commercial.subscription.renew`

`create`, lifecycle actions, assignment, and update remain separate permissions; no generic `commercial.subscription.manage` permission is introduced by this DoR. Future role composition requires independent governance.

Every path must be:

`signed OIDC → canonical identity → active membership → AuthorizationPort → trusted tenant context → least-privilege PostgreSQL role → RLS/FORCE RLS → transaction → audit/outbox`.

Tenant authority cannot derive from request body, query parameters, route substitution, JWT claims alone, or client-provided origin fields. No admin-runtime bypass, RLS bypass, cross-tenant reference, IDOR/BOLA path, mass assignment, or unredacted sensitive commercial origin in events/logs/audit is permitted.

## 5. Transactionality, history, audit, and events

Every mutating action is versioned and idempotent where the repository standard requires it. A stale `expected_version` returns the established conflict result. Reusing an idempotency key with a divergent payload returns conflict and cannot create or mutate a second fact.

Create, update, assignment, lifecycle change, immutable revision/history, audit record, and transactional outbox record must commit atomically. A test-only failure injected after any of these writes must prove that no partial Subscription, revision, audit, or outbox artifact persists.

Proposed event vocabulary is limited to tenant-safe lifecycle facts: `commercial.subscription.created`, `requested_activation`, `activated`, `suspended`, `resumed`, `cancelled`, `terminated`, `renewed`, `updated`, and `assigned`. Events contain only identifiers, status/version, and approved origin references required by consumers; they must not contain contact email, mutable full Plan Feature data, price calculations, payment data, entitlement facts, or capacity claims.

## 6. Explicit non-side-effects

The following are mandatory `NONE` results for every Subscription action unless a separately governed future capability changes the boundary:

- entitlement/provisioning/access-control side effects;
- usage metering, allowance, quota, or capacity side effects;
- Billing, Invoice, Payment, Receipt, Collection, tax, currency, accounting, or ledger side effects;
- automatic Contract mutation, automatic renewal, automatic suspension, or Contract activation side effects;
- Partner financial attribution and Commission generation;
- trial, upgrade, downgrade, proration, or plan reinterpretation behavior.

Partner context, when later needed, remains non-financial. Commission is `OPTIONAL_FUTURE` and requires independent governance.

## 7. Future API and UI boundary

The future tenant-scoped API surface is limited to list/detail, explicit create from Contract, draft update, owner assignment, request activation, activate, suspend, resume, cancel, terminate, and renew. Mutation endpoints require expected version and repository-standard idempotency handling. No endpoint accepts tenant, Customer, Plan, Plan Feature, entitlement, capacity, billing, or financial authority from the client.

The future UI is limited to a tenant-scoped list/detail view and explicit lifecycle/assignment commands rendered only when permissions and state allow them. It must not present capacity, billing, payment, trial, proration, upgrade/downgrade, entitlement, or provisioning controls.

## 8. Deterministic acceptance matrix

### Positive cases

| ID          | Required proof                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| SUB-POS-001 | Explicit creation from one same-tenant `ACTIVE` Contract succeeds once.                                      |
| SUB-POS-002 | Customer and immutable Contract/Plan commercial-origin snapshots are server-derived.                         |
| SUB-POS-003 | Tenant list/detail read respects RLS/FORCE RLS isolation.                                                    |
| SUB-POS-004 | Draft update and same-tenant active-owner assignment follow separate permissions.                            |
| SUB-POS-005 | `DRAFT → PENDING_ACTIVATION` is explicit and versioned.                                                      |
| SUB-POS-006 | A separately authorized actor activates `PENDING_ACTIVATION → ACTIVE` with valid dates.                      |
| SUB-POS-007 | Authorized suspend/resume performs `ACTIVE → SUSPENDED → ACTIVE`.                                            |
| SUB-POS-008 | Authorized cancel reaches terminal `CANCELLED`.                                                              |
| SUB-POS-009 | Authorized terminate reaches terminal `TERMINATED`.                                                          |
| SUB-POS-010 | Explicit renew from `ACTIVE` records immutable history and a later valid end date without financial effects. |
| SUB-POS-011 | Correct expected-version/idempotency replay returns the canonical original outcome.                          |
| SUB-POS-012 | Immutable origin, lifecycle, owner, audit, revision, and outbox facts commit atomically.                     |

### Negative and security cases

| ID          | Required proof                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SUB-NEG-001 | Unauthenticated request is denied.                                                                                                            |
| SUB-NEG-002 | Missing least-privilege permission is denied for each protected action.                                                                       |
| SUB-NEG-003 | Contract-less, missing, or non-`ACTIVE` Contract origin is rejected.                                                                          |
| SUB-NEG-004 | Cross-tenant Contract/reference access and BOLA/IDOR attempts are denied.                                                                     |
| SUB-NEG-005 | Client-provided tenant, Customer, Plan, Plan Feature, or origin substitution is rejected.                                                     |
| SUB-NEG-006 | A second current Subscription for the same Contract is prevented under replay and concurrency.                                                |
| SUB-NEG-007 | Inactive, foreign-tenant, or nonexistent owner assignment is rejected.                                                                        |
| SUB-NEG-008 | Creator self-activation is denied.                                                                                                            |
| SUB-NEG-009 | Invalid lifecycle transitions and terminal-state mutation are denied.                                                                         |
| SUB-NEG-010 | Invalid effective dates or a start before Contract authority are rejected.                                                                    |
| SUB-NEG-011 | Quantity-to-capacity, seat, quota, module, limit, entitlement, or usage fields are rejected.                                                  |
| SUB-NEG-012 | Trial, automatic renewal, upgrade/downgrade, proration, and Contract auto-mutation are rejected.                                              |
| SUB-NEG-013 | Entitlement, usage, billing, invoice, payment, receipt, collection, accounting, Partner financial, and Commission side effects remain absent. |
| SUB-NEG-014 | Stale expected-version requests conflict without partial mutation.                                                                            |
| SUB-NEG-015 | Divergent idempotency payload reuse conflicts.                                                                                                |
| SUB-NEG-016 | Trusted context cannot be replaced by body/query/route/JWT-only authority.                                                                    |
| SUB-NEG-017 | Least-privilege database role cannot bypass RLS/FORCE RLS or access another tenant.                                                           |
| SUB-NEG-018 | Mass assignment of immutable origin, creator, lifecycle, audit, or version facts is rejected.                                                 |
| SUB-NEG-019 | Events, logs, and audit do not disclose prohibited sensitive or mutable commercial data.                                                      |
| SUB-NEG-020 | Failure injection proves audit/outbox/revision atomicity and no downstream side effect.                                                       |
| SUB-NEG-021 | Renew outside `ACTIVE`, without a defined end date, or without a later valid end date is rejected.                                            |
| SUB-NEG-022 | No broad administrative runtime role or self-authorized bypass can perform protected operations.                                              |

## 9. Governance dependencies preserved

This DoR does not resolve or accept retention policy, production broker selection, production IdP/client registration, production `acr`/`amr` mapping, SLO/performance thresholds, named owners/approvers, QG-18–QG-22, baseline custody, global ECOM/EDIM/EDOLM completeness, ACS-REQ completeness, or commit-signing enforcement. Step-up/MFA policy remains subject to the prior governance disposition and is not provider-specific in this document.

## 10. Definition of Ready

`SUBSCRIPTION_DOR_READY_FOR_PUBLICATION_REVIEW` is supported only when this document, ADR-0022, the Subscription traceability matrix, the threat analysis, and reconciled catalog entries are documentation-only, internally consistent, formatted, and reviewed. It authorizes no implementation or publication by itself.
