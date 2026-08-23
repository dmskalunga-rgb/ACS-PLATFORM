# ACS Phase 2 — Commercial Rating Definition of Ready

**Status:** `READY_FOR_PUBLICATION_REVIEW`
**ADR:** [ADR-0025](decisions/ADR-0025-tenant-scoped-commercial-rating.md) (`PROPOSED`)
**Implementation:** `NOT_AUTHORIZED`

```text
NEXT_PHASE_2_CAPABILITY = RATING
COMMERCIAL_RATING_DOMAIN = APPROVED
RATING_IMPLEMENTATION = NOT_STARTED
```

## 1. Authority and bounded domain

Commercial Rating is a tenant-scoped monetary-valuation domain. It is distinct from
the baseline Marketplace Rating Service and from Plan, Plan Feature, Proposal,
Contract, Subscription, Entitlement, and Usage/Metering.

```text
Usage/Metering = authoritative non-financial facts
Rating         = immutable monetary valuation of approved inputs
Billing        = future billing-period/account organization
Invoice        = future legal customer document
Payment        = future settlement
Accounting     = future ledger/posting
```

Rating produces rated facts only. It creates no Billing, Invoice, Payment, Receipt,
Collection, Accounting, or Commission side effect.

## 2. Authoritative lineage and applicability

The primary input lineage is server-resolved:

```text
Tenant → Subscription → Entitlement → Usage/Metering accepted aggregate → Rating
```

Client-supplied tenant, Subscription, Entitlement, Plan, Plan Feature, quantity,
usage amount, or Rate Plan is never authoritative. The initial slice consumes only
canonical `HOURLY` or `DAILY` Usage/Metering aggregates; event-level rating is out of
scope.

Rating owns `RatingApplicability`: a tenant-scoped assignment of one Subscription to
one immutable Rate Plan version for a governed applicability scope. This is the
authoritative binding point; it does not alter Subscription semantics. A rating
execution cannot choose an arbitrary tenant Rate Plan.

## 3. Rate Plan aggregate and lifecycle

`RatePlan` is the monetary-policy aggregate. `RatePlanVersion` is immutable after
approval. A version carries at least `rate_plan_id`, `rate_plan_version_id`,
`tenant_id`, code, name, status, currency, pricing model, rule set,
`effective_from`, optional `effective_to`, creator, owner, version and timestamps.

| From                   | Action    | To                 | Rule                                                   |
| ---------------------- | --------- | ------------------ | ------------------------------------------------------ |
| —                      | create    | `DRAFT`            | Mutable only while DRAFT.                              |
| `DRAFT`                | submit    | `PENDING_APPROVAL` | No rating permitted.                                   |
| `PENDING_APPROVAL`     | approve   | `APPROVED`         | Creator self-approval denied.                          |
| `APPROVED`             | activate  | `ACTIVE`           | Creator self-activation denied.                        |
| `ACTIVE`               | supersede | `SUPERSEDED`       | Requires a deterministic replacement where applicable. |
| `APPROVED` or `ACTIVE` | retire    | `RETIRED`          | Controlled retirement only.                            |

`SUPERSEDED` and `RETIRED` are terminal. DRAFT and PENDING_APPROVAL versions cannot
rate usage. Active versions for the same tenant, applicability scope, and effective
time must not overlap.

## 4. Effective dates, currency, and arithmetic

Rate selection uses `USAGE_EVENT_WINDOW_TIME`, never processing time. Boundary
selection is `[effective_from, effective_to)`, with an absent end denoting an open
future interval. A window whose selected version is absent, inactive, or ambiguous
is denied.

Each effective version has one ISO 4217 `currency_code`. The initial deterministic
currency rule supports `USD` with `currency_minor_scale = 2`; other currencies are
`NOT_APPLICABLE` until a separately governed canonical currency metadata policy
exists. FX conversion, exchange-rate lookup, and multi-currency transformation are
not permitted.

All monetary and rate calculations use PostgreSQL decimal arithmetic. The future
schema must use `NUMERIC(24,8)` for rates, quantities, and intermediate values, and
persist `pre_tax_amount` as `NUMERIC(19,4)`. Intermediate values are retained until
the final rated line. The final amount rounds `HALF_UP` to the Rate Plan currency
minor scale; floating-point arithmetic and repeated intermediate rounding are
prohibited. This representation does not authorize tax, FX, or Billing semantics.

## 5. Rule models and units

Only these pricing models are permitted:

- `FLAT`: one deterministic amount for a governed aggregate window.
- `PER_UNIT`: authoritative aggregate quantity multiplied by an authoritative unit rate.
- `TIERED_GRADUATED`: each quantity segment is priced at its tier's rate.

Rate rules declare an exact `measurement_type` and `unit`. No automatic conversion
is allowed; a mismatch is denied. Graduated tiers are ordered, non-overlapping, use
half-open intervals `[lower_bound, upper_bound)` except for the final unbounded tier,
and must cover the rated quantity without gaps. They are not volume pricing.

Minimum/maximum charge, discount, tax/VAT, proration, credit/debit notes, wallets,
prepayment, commitment drawdown, package, volume, surge, spot, auction, ML-generated
and arbitrary-formula pricing are excluded.

## 6. Rated facts and rerating

`RatedFact` is immutable. It preserves at least its ID, tenant, Subscription,
Entitlement, input aggregate identity/window, measurement type, quantity, unit,
Rate Plan/version, pricing model, immutable rule evidence, currency, pre-tax amount,
calculation version, status, and creation time.

The lifecycle is `RATED` then, only through a later append-only re-rating,
`SUPERSEDED`. A new rated fact references the previous fact, reason, authoritative
new input, effective Rate Plan version, actor or server trigger, and timestamp.
Original monetary history is never overwritten.

Late accepted Usage and APPLIED Usage corrections may trigger server-controlled
append-only rerating. Manual rerating is a signed-OIDC high-risk command requiring
`commercial.rating.rerate`, active membership, AuthorizationPort, trusted context,
and audit. Manual monetary adjustments are not authorized; the reserved
`commercial.rating.adjust` permission has no executable initial-slice behavior.

## 7. Authorization, security, and consistency

Minimum permissions are:

- `commercial.rating.read`
- `commercial.rating.rate-plan.read`, `.create`, `.update`, `.approve`, `.activate`
- `commercial.rating.execute`
- `commercial.rating.rerate`
- `commercial.rating.adjust` (reserved only)

Every human path is:

```text
signed OIDC → canonical identity → active membership → AuthorizationPort
→ trusted context → least-privilege PostgreSQL role → RLS/FORCE RLS
→ transaction → audit/outbox
```

Measurement Source principals have no Rating authority; Rating execution is
server-controlled. Rate Plan creation/approval/activation and manual rerating are
high-risk operations. Production step-up (`acr`/`amr`) remains a production gate.

Mutable DRAFT Rate Plan commands require `expected_version`. Tenant-scoped
idempotency applies to Rate Plan commands, rating and rerating: identical replay is
stable; divergent reuse conflicts. Transactions serialize approval, activation,
supersession, retirement, rating and rerating. Concurrent identical rating produces
one authoritative result; conflicting rerating has a deterministic conflict or
serialization outcome.

## 8. Audit, events, and firewall

Rate Plan lifecycle, rating, rerating, and required privileged denials are
append-only audited. Every authoritative mutation atomically persists its audit,
outbox, idempotency and aggregate/history data. No direct broker publishing,
tokens, secrets, or full sensitive rule snapshots are allowed.

Candidate events are `commercial.rating.rate-plan.created`, `.submitted`,
`.approved`, `.activated`, `.superseded`, `.retired`, `commercial.rating.rated`,
and `commercial.rating.rerated`. Final payloads must be tenant-safe and omit
sensitive commercial detail.

```text
RATING_TO_BILLING_SIDE_EFFECT = NONE
RATING_TO_INVOICE_SIDE_EFFECT = NONE
RATING_TO_PAYMENT_SIDE_EFFECT = NONE
RATING_TO_RECEIPT_SIDE_EFFECT = NONE
RATING_TO_COLLECTION_SIDE_EFFECT = NONE
RATING_TO_ACCOUNTING_SIDE_EFFECT = NONE
RATING_TO_COMMISSION_SIDE_EFFECT = NONE
```

## 9. Deterministic acceptance matrix

### Positive cases

| ID          | Required proof                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| RAT-POS-001 | Authorized tenant creates and updates a DRAFT Rate Plan with idempotency and expected version.         |
| RAT-POS-002 | Different authorized actor approves, then a different authorized actor activates, a Rate Plan version. |
| RAT-POS-003 | FLAT rating of an authoritative hourly/daily aggregate produces one immutable pre-tax fact.            |
| RAT-POS-004 | PER_UNIT rating uses exact quantity, unit, rate, decimal arithmetic, and final HALF_UP rounding.       |
| RAT-POS-005 | TIERED_GRADUATED rating prices each deterministic segment at its own tier rate.                        |
| RAT-POS-006 | Event-window time selects the correct effective Rate Plan version.                                     |
| RAT-POS-007 | Identical rating replay returns the canonical rated fact without duplicate audit/outbox rows.          |
| RAT-POS-008 | Late Usage and an APPLIED Usage correction create append-only server rerating.                         |
| RAT-POS-009 | Authorized human manual rerating succeeds with high-risk audit evidence.                               |
| RAT-POS-010 | Same-tenant reads, retirement, and supersession preserve immutable historic references.                |

### Negative and security cases

| ID          | Required proof                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| RAT-NEG-001 | Unauthenticated or unauthorized Rate Plan/rating action is denied.                                                                           |
| RAT-NEG-002 | Cross-tenant Rate Plan, applicability, Usage, Subscription, or Entitlement substitution is denied.                                           |
| RAT-NEG-003 | Creator self-approval and creator self-activation are denied.                                                                                |
| RAT-NEG-004 | Stale DRAFT update and divergent idempotency reuse conflict.                                                                                 |
| RAT-NEG-005 | DRAFT, PENDING_APPROVAL, RETIRED, or ambiguous/overlapping versions cannot rate Usage.                                                       |
| RAT-NEG-006 | Unit/currency mismatch, unsupported model, malformed tier, overlap, gap, or invalid boundary is denied.                                      |
| RAT-NEG-007 | Effective Rate Plan version and immutable Rated Fact cannot be mutated.                                                                      |
| RAT-NEG-008 | Historical rating cannot select a later current rate; unauthorized rerating and machine attempts are denied.                                 |
| RAT-NEG-009 | Concurrent rating/rerating cannot duplicate facts, audit, outbox, or rerating effects.                                                       |
| RAT-NEG-010 | TEST_ONLY failures roll back Rate Plan/rated-fact/audit/outbox/idempotency atomically.                                                       |
| RAT-NEG-011 | Billing, Invoice, Payment, Receipt, Collection, Accounting, Commission, tax, discount, proration, and adjustment side effects remain absent. |

## 10. Production-only gates

Rate Plan, Rated Fact, Rating audit and Usage/Metering retention remain
`PENDING_GOVERNANCE_APPROVAL` with `NO_AUTOMATIC_PURGE = REQUIRED`. Named owners,
formal Rating SLO, production step-up, production IdP/client configuration and
commit-signing enforcement are pending. They block production, not DoR preparation
or the separately authorized implementation phase.
