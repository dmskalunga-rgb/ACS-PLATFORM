# ACS Phase 2 — Proposal / Quotation Definition of Ready

Status: `DETERMINISTIC_FOR_IMPLEMENTATION_PREPARATION`

`PROPOSAL_DOR = DETERMINISTIC_FOR_IMPLEMENTATION_PREPARATION`

## Purpose and boundary

`Proposal` is the tenant-scoped aggregate for a versioned commercial offer
(`Quotation`) made for exactly one Opportunity. It owns one or more commercial
Plan line items, monetary terms, validity, controlled approval and acceptance
state. `ProposalLineItem` is an owned child, not an independent aggregate.

Opportunity remains the non-financial sales pipeline. Proposal is the offer
presented for acceptance, so `PROPOSAL_DUPLICATES_OPPORTUNITY = NO`.

`PROPOSAL_IS_CONTRACT = NO`
`PROPOSAL_CREATES_SUBSCRIPTION = NO`
`PROPOSAL_ACCOUNTING_SIDE_EFFECT = NONE`
`PROPOSAL_COMMISSION_SIDE_EFFECT = NONE`

Contract, Subscription, Billing, Invoice, Payment, Receipt, Collection,
Entitlement, Usage, Price Book, dynamic pricing, discount, tax engine, AI,
PDF/email delivery, customer portal and signature are out of scope.

## Aggregate, identity and relationships

| Field / relation                     | Frozen disposition                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `proposal_id`                        | Required server-generated UUID; `INTERNAL`.                                                                                  |
| `tenant_id`                          | Required and derived only from trusted server context.                                                                       |
| `proposal_code`                      | Required tenant-scoped case-insensitive unique business identifier; generation format remains `PENDING_GOVERNANCE_APPROVAL`. |
| `title`                              | Required `BUSINESS` field.                                                                                                   |
| `opportunity_id`                     | Required same-tenant relation.                                                                                               |
| `customer_id`                        | Optional; must match Opportunity Customer when it exists, otherwise null or same-tenant.                                     |
| `partner_id`                         | Optional; must match Opportunity Partner when it exists, otherwise null or same-tenant.                                      |
| `owner_membership_id`                | Required active same-tenant membership; defaults from Opportunity owner.                                                     |
| `currency_code`                      | Required supported ISO 4217 alpha-3; one currency per Proposal.                                                              |
| `status`, `issued_at`, `valid_until` | Required server-controlled lifecycle fields.                                                                                 |
| `revision_number`                    | Required server-controlled commercial revision, starting at `1`.                                                             |
| `version`, timestamps                | Required server-controlled concurrency and audit metadata.                                                                   |

Lead is derived only through Opportunity and is never stored. Proposal has one
or more line items at submission; a DRAFT may temporarily have no lines. Every
line owns `proposal_line_item_id`, `line_number`, exactly one same-tenant
`plan_id`, `plan_name_snapshot`, `description_snapshot`, `quantity`,
`unit_price`, server-calculated `line_subtotal` and timestamps. No Plan Feature
pricing or arbitrary product identifier is permitted.

Every foreign relation is checked server-side in the same trusted context and
returns a non-disclosing canonical `404` when unavailable to the tenant.
If an Opportunity has `plan_id`, at least one line must reference it; additional
same-tenant Plans are allowed. No Proposal relation writes back to Opportunity.

## Monetary, currency and totals model

`unit_price`, `line_subtotal`, `proposal_subtotal`, `grand_total` and `quantity`
use PostgreSQL `NUMERIC(19,4)`. Inputs exceeding four decimal places are a
canonical `400` validation failure; binary floating point and silent rounding
of client over-precision are prohibited.

Price source is `MANUAL_GOVERNED_COMMERCIAL_PRICE_SNAPSHOT`. Price and Plan
text are immutable commercial snapshots for the revision and never mutate Plan
or create a Price Book. Quantity is positive quotation quantity only: it
creates no usage, entitlement, subscription capacity or billing quantity.

`ROUNDING_MODE = HALF_UP`
`ROUNDING_SCALE = 4`
`ROUNDING_POINT = PER_LINE_BEFORE_PROPOSAL_SUM`

```text
raw_line_subtotal = quantity × unit_price
line_subtotal = ROUND_HALF_UP(raw_line_subtotal, 4)
proposal_subtotal = SUM(authoritative line_subtotal)
grand_total = proposal_subtotal
```

Discount and tax are out of scope; no `discount_total` or `tax_total` exists.
Values exceeding `NUMERIC(19,4)` must fail through mapped canonical validation,
not an unclassified database/HTTP `500`.

Currency is one supported ISO 4217 alpha-3 code per Proposal; mixed currency
and FX conversion are prohibited. Currency display-fraction metadata governs
presentation only and cannot rescale or rewrite stored Proposal history.

## Lifecycle, expiry and revision history

`EXPIRED` is a persisted state; wall-clock passage never mutates a Proposal by
itself. A `SENT` Proposal is unacceptable after `valid_until` even while still
persisted as `SENT`: acceptance requires `current_time <= valid_until`.
`POST /expire` may persist `SENT → EXPIRED` only after expiry and requires
`commercial.proposal.expire`. A future scheduler may call that same command;
none is required in the initial slice.

| From                                           | Allowed transitions                                | Mutability                    |
| ---------------------------------------------- | -------------------------------------------------- | ----------------------------- |
| `DRAFT`                                        | `PENDING_APPROVAL`                                 | Commercial content editable.  |
| `PENDING_APPROVAL`                             | `DRAFT`, `APPROVED`                                | Commercial content locked.    |
| `APPROVED`                                     | `SENT`, `CANCELLED`; `DRAFT` only through `REVISE` | Commercial content locked.    |
| `SENT`                                         | `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`     | Commercial content immutable. |
| `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED` | none                                               | Immutable terminal state.     |

`PENDING_APPROVAL → DRAFT` means approval return/rework and records
`proposal.approval_returned`; it is audit-only unless a justified consumer
requires a later event. `REJECTED` means only commercial/customer rejection
after `SENT` and is terminal. No reopen and no Proposal root DELETE exist.

Current Proposal rows are authoritative state. `ProposalRevision` and owned
`ProposalRevisionLineItem` are immutable append-only commercial snapshots.
They preserve Proposal code/title, relations, owner where historically relevant,
currency, validity, state where relevant, all line Plan IDs/text/quantity/price/
subtotal, Proposal totals, timestamp and `created_by_membership_id`. Audit says
who changed what and when; revision snapshots preserve the offer itself.

Commercial revision begins at `1`, increments only through governed revision,
never decrements or reuses a number, and never overwrites a snapshot.
`POST /commercial/proposals/:proposalId/revise` is allowed only from `APPROVED`.
It atomically snapshots the approved revision, increments the number, resets
current state to `DRAFT`, unlocks commercial fields, records audit/outbox and
requires reapproval. Generic PATCH cannot change APPROVED commercial content.
SENT Proposals cannot be revised in place; a replacement requires a new
Proposal aggregate.

## Authorization, SoD and security

The complete permission set is `commercial.proposal.read`, `.create`, `.update`,
`.assign`, `.approve`, `.revise`, `.send`, `.accept`, `.reject`, `.cancel`,
`.expire` and `.admin`.

Creator identity is immutable `created_by_membership_id`. A creator/requestor
cannot approve their own monetary Proposal; owner reassignment does not alter
that comparison. Approval records `approved_by_membership_id` and `approved_at`.
Owner assignment defaults from Opportunity; explicit assignment needs an active
same-tenant membership and appropriate authority. Reassignment requires `.assign`
and is allowed only in `DRAFT` or `PENDING_APPROVAL`.

`APPROVED → SENT` requires `.send`; `SENT → ACCEPTED` requires `.accept`;
`SENT → REJECTED` requires `.reject`; cancellations require `.cancel`; expiry
requires `.expire`; and the approved revision command requires `.revise`.
`admin` bypasses none of SoD, lifecycle, expected version, tenant isolation,
RLS/FORCE RLS, audit or idempotency.

The mandatory path is OIDC → canonical identity → membership → AuthorizationPort
→ trusted tenant context → repository → least-privilege PostgreSQL role →
RLS/FORCE RLS → append-only audit → transactional outbox. No client tenant
authority, `SUPERUSER` or `BYPASSRLS` is allowed. Production `acr`/`amr` mapping
for sensitive actions remains `PENDING_GOVERNANCE_APPROVAL`.

Create, lifecycle commands, revision and externally retriable line creation are
idempotent. Same key/same request replays canonically; divergent request is
`409`. Every mutable aggregate or line operation requires `expected_version`;
stale mutations are `409` and cannot use last-write-wins.

## API, events and UI

The initial API is:

- `POST`, `GET` `/api/v1/commercial/proposals`
- `GET`, `PATCH` `/api/v1/commercial/proposals/:proposalId`
- `POST` `/api/v1/commercial/proposals/:proposalId/lines`
- `PATCH`, `DELETE` `/api/v1/commercial/proposals/:proposalId/lines/:lineId`
- `POST` `/submit`, `/approve`, `/revise`, `/send`, `/accept`, `/reject`,
  `/cancel`, `/expire` below `/api/v1/commercial/proposals/:proposalId`

Line DELETE is DRAFT-only, expected-version-bound, audited, increments aggregate
version and cannot permit submission with zero valid lines. `DRAFT →
PENDING_APPROVAL` checks lines, relations, owner, currency, validity, money,
primary Plan inclusion where relevant and current server totals. Approval checks
permission, SoD, current version and continued commercial validity; sending
sets `issued_at` server-side and requires a future `valid_until`.

Events are `commercial.proposal.created`, `.updated`, `.approval_requested`,
`.approved`, `.revision_created`, `.sent`, `.accepted`, `.rejected`, `.expired`
and `.cancelled`. Every event has canonical envelope/event/schema identifiers,
tenant-safe context, aggregate ID, status, aggregate version, justified revision
and relationship IDs only. It excludes contact PII, notes, full price lines,
snapshots, tokens, secrets and raw audit payloads.

Future UI includes list, create, detail, DRAFT edit, line management,
submit/approve/revise/send/accept/reject/cancel/expire actions, timeline and
accessible loading, empty, `401`, `403`, `404`, `409` and generic-error states.
PDF, email, portal, signature, Contract, Subscription, Invoice/Payment,
Commission, Pricing administration, tax and AI are excluded.

## Classification, retention and quality

Identifiers are `INTERNAL`; code/title/status and Plan snapshots are `BUSINESS`;
currency/prices/totals/validity are `CONFIDENTIAL_COMMERCIAL`; authorization and
audit metadata are `SECURITY`. Contact PII and unrestricted free text are out
of scope.

`RETENTION = PENDING_GOVERNANCE_APPROVAL` and is
`LOCAL_IMPLEMENTATION_NON_BLOCKING` by established registry precedent.
`FORMAL_PROPOSAL_SLO = PENDING_GOVERNANCE_APPROVAL`; future evidence requires
`BASELINE_MEASUREMENT_NOT_SLO`. QG-01–08, QG-10 and QG-11 apply; QG-09 is not
applicable; QG-12 is pre-production; QG-18–22 are `UNDEFINED_IN_BASELINE`.

## Mandatory acceptance matrices

Positive cases: `PRP-POS-001` create; `002` list; `003` detail; `004` draft
update; `005` line create; `006` line update; `007` DRAFT line delete; `008`
submit; `009` approval return; `010` approve; `011` send; `012` accept; `013`
reject; `014` cancel; `015` same-tenant relations; `016` totals; `017` snapshot
stability; `018` revision; `019` expiry; `020` explicit revise; `021` expire;
`022` owner reassignment; `023` approval return to DRAFT; `024` multi-Plan
primary Plan inclusion; `025` immutable revision preservation.

Negative cases: `PRP-NEG-001` unauthenticated create; `002` list; `003`
detail; `004` update; `005` endpoint/action permission denial; `006` tenant
injection; `007` unknown field; `008` server-owned field mutation; `009` mass
assignment; `010` foreign Opportunity; `011` foreign Customer; `012` foreign
Partner; `013` foreign Plan; `014` foreign owner membership; `015` BOLA detail;
`016` BOLA mutation; `017` duplicate normalized code; `018` invalid currency;
`019` invalid quantity; `020` invalid money representation; `021` client total
injection; `022` invalid validity; `023` expired acceptance; `024` illegal
transition; `025` terminal mutation; `026` creator self-approval; `027`
unauthorised approve; `028` unauthorised send; `029` unauthorised accept; `030`
unauthorised cancel; `031` stale version; `032` divergent replay; `033`
cross-tenant idempotency; `034` RLS/FORCE RLS; `035` no SUPERUSER/BYPASSRLS;
`036` hard DELETE; `037` audit redaction; `038` event leakage; `039` line
mutation outside DRAFT; `040` line relation cross-tenant; `041` commercial
revision integrity; `042` over-precision money; `043` numeric overflow; `044`
expired acceptance guard; `045` premature expire; `046` expire permission;
`047` revise non-APPROVED; `048` PATCH of APPROVED content; `049` snapshot
integrity; `050` revision monotonicity; `051` SENT revise; `052` approval return;
`053` reject permission; `054` Customer mismatch; `055` Partner mismatch; `056`
missing Opportunity primary Plan line; `057` invalid owner state; `058` owner
assignment permission; `059` self-approval after owner reassignment.

Concurrency must cover Proposal and line writers, submit/update,
approve/return-to-DRAFT, revise/send, accept/cancel, accept/expire, owner
reassignment/update and stale revision commands. Atomicity must prove rollback
of create/line/submit/approval, revision snapshot+increment+reset, send, accept,
reject, cancel and expire with audit/outbox. Audit evidence records creator,
approver, owner/revision/transition actors, tenant, aggregate, revision/version
and action without token, secret or contact PII leakage.

`PROPOSAL_DOR_EXTRA_SCOPE = NONE`
