# ACS Phase 2 — Contract Definition of Ready

Status: `DETERMINISTIC_FOR_IMPLEMENTATION_PREPARATION`

`CONTRACT_DOR = DETERMINISTIC_FOR_IMPLEMENTATION_PREPARATION`

## Purpose and boundary

Contract is the next tenant-scoped Commercial aggregate after Proposal / Quotation:

```text
Customer / Lead / Plan / Partner → Opportunity → Proposal (ACCEPTED) → Contract
```

It is an explicit, authorised creation from exactly one `ACCEPTED` Proposal; acceptance never creates a Contract automatically. Contract owns `ContractLineItem`, and immutable `ContractRevision` / `ContractRevisionLineItem` preserve superseded approved commercial state. A Proposal has at most one current Contract.

Subscription, Entitlement, Usage, Billing, Invoice, Payment, Receipt, Collection, Commission, accounting, tax, refunds, credit notes, revenue recognition, amendment, auto-renewal, signatures, documents/PDF and deployment are out of scope. `CONTRACT_ACTIVATION_DOWNSTREAM_SIDE_EFFECTS = NONE`.

## Aggregate, origin and snapshots

| Data                                              | Disposition                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `contract_id`, `tenant_id`, `version`, timestamps | Server-generated/controlled; tenant derives only from trusted context.                                             |
| `source_proposal_id`, source revision/code        | Exactly one same-tenant accepted Proposal; immutable commercial origin.                                            |
| Customer, Partner, Opportunity, owner             | Inherited from Proposal snapshot; Contract cannot silently substitute them. Owner defaults to the Proposal owner.  |
| Currency, totals, validity metadata               | Immutable authoritative snapshot at creation.                                                                      |
| Line items                                        | One or more immutable Proposal-derived Plan ID/name/description, quantity, unit price and line subtotal snapshots. |
| Revisions                                         | Append-only immutable snapshots; initial `revision_number = 1`.                                                    |

Creation resolves all source information server-side. It rejects a foreign, non-accepted, missing or already-contracted Proposal and client-supplied totals or relationship substitutions. Historical Contract data must not depend on later mutation of Proposal, Opportunity, Customer, Partner or Plan; unnecessary PII is excluded.

## Money and effective dates

The Proposal representation is preserved: `NUMERIC(19,4)`, ISO 4217 alpha-3 single currency, `HALF_UP` per line before aggregate summation, server-authoritative totals, no silent rounding, no FX, tax or discount engine.

`effective_from` is mandatory before `APPROVED → ACTIVE`; `effective_until` is optional, but when present must be later than `effective_from`. Time passage does not silently mutate lifecycle. Scheduling and auto-renewal are out of scope.

## Lifecycle and revision

| From                      | Allowed transition                              | Rule                                                                          |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `DRAFT`                   | `PENDING_APPROVAL`                              | Content may be edited only while DRAFT.                                       |
| `PENDING_APPROVAL`        | `DRAFT`, `APPROVED`                             | Return records audit evidence; approval requires a distinct creator/approver. |
| `APPROVED`                | `DRAFT` through `REVISE`, `ACTIVE`, `CANCELLED` | Generic PATCH cannot change approved commercial content.                      |
| `ACTIVE`                  | `TERMINATED`                                    | No in-place revision or amendment.                                            |
| `CANCELLED`, `TERMINATED` | none                                            | Terminal and immutable.                                                       |

All unlisted transitions are denied. `REVISE` snapshots approved Contract and lines atomically, increments the revision, clears approval evidence, returns current Contract to DRAFT and requires a fresh approval. Active agreements require a future amendment capability.

## Authorisation, tenant security and consistency

Required permissions are `commercial.contract.read`, `.create`, `.update`, `.assign`, `.approve`, `.revise`, `.activate`, `.cancel`, `.terminate` and `.admin`. Existing Proposal evidence establishes that submit uses `.update`; Contract introduces no `.submit` permission.

Creator identity is immutable. A creator cannot approve their own Contract; owner reassignment does not change that comparison. Assignment requires a same-tenant active membership and is allowed only in DRAFT/PENDING_APPROVAL. `admin` bypasses none of tenant isolation, RLS/FORCE RLS, lifecycle, SoD, expected version, idempotency, audit or terminal immutability.

The required path is OIDC → canonical identity → membership → AuthorizationPort → trusted transaction-bound context → least-privilege Contract role → PostgreSQL RLS/FORCE RLS. No client tenant authority, `SUPERUSER`, `BYPASSRLS`, cross-domain writes or broad CASCADE is allowed. Foreign references return established non-disclosing behaviour.

## Concurrency, idempotency and atomicity

Every mutable command carries `expected_version`; stale state is `409`, never last-write-wins. Creation and retriable lifecycle commands follow established idempotency: same tenant/key/payload replays canonically; divergent payload is `409`; keys cannot cross tenant boundaries.

Creation, line changes, submit, return, approve, revise, activate, cancel and terminate are transactional with aggregate state, revision snapshots where applicable, audit, outbox and idempotency evidence. Test-only failure injection must prove rollback has no partial authoritative state. Required race proofs include update/update, update/submit, return/approve, revise/activate, activate/cancel, activate/terminate, assign/update, competing source-Proposal creation, replay and revision races.

## Audit, events and outbox

Candidate audit vocabulary: `contract.created`, `.updated`, `.line_created`, `.line_updated`, `.line_removed`, `.assigned`, `.submitted`, `.approval_returned`, `.approved`, `.revised`, `.activated`, `.cancelled`, `.terminated`. Final implementation reconciles names with the established audit convention.

Candidate domain events are `commercial.contract.created`, `.approved`, `.revision_created`, `.activated`, `.cancelled` and `.terminated`; approval return may remain audit-only. Events are emitted only where a justified consumer exists, through the transactional outbox, and contain canonical envelope/version, tenant-safe aggregate/status/version/revision/origin identifiers only. They exclude full snapshots, detailed price lines, PII, credentials, tokens and secrets.

## Future API and UI

The API boundary, not implementation, is `/api/v1/commercial/contracts`: list, detail, explicit `POST` from an accepted Proposal, `PATCH` for DRAFT allowlisted fields, DRAFT-only line operations, and `POST` `submit`, `return-to-draft`, `approve`, `revise`, `activate`, `cancel`, `terminate` and `assign` commands.

Future real API-backed UI covers list, loading/empty/error states, creation from accepted Proposal, detail, legal DRAFT editing/line display, owner assignment, lifecycle/revision/effective-date presentation, server totals, terminal immutability, accessible controls and bounded 400/401/403/404/409/5xx handling with conflict reload. No mock production data.

## Acceptance matrix

### Positive

| ID          | Deterministic proof                                                            |
| ----------- | ------------------------------------------------------------------------------ |
| CTR-POS-001 | Create exactly one Contract from an accepted same-tenant Proposal.             |
| CTR-POS-002 | List and detail reveal only authorised tenant Contracts.                       |
| CTR-POS-003 | Creation preserves Proposal commercial and line snapshots with server totals.  |
| CTR-POS-004 | DRAFT allowlisted update and line management use expected version.             |
| CTR-POS-005 | Submit and approval return follow the frozen lifecycle.                        |
| CTR-POS-006 | Distinct creator and approver approve the Contract.                            |
| CTR-POS-007 | Approved revision atomically snapshots, increments and returns to DRAFT.       |
| CTR-POS-008 | Approved Contract activates only on/after valid effective date.                |
| CTR-POS-009 | Approved Contract cancels; active Contract terminates.                         |
| CTR-POS-010 | Authorised owner reassignment occurs only before approval.                     |
| CTR-POS-011 | Historical revision and source snapshots remain stable after upstream changes. |
| CTR-POS-012 | Same key/same payload Contract create is an idempotent replay.                 |

### Negative and security

| ID          | Deterministic proof                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| CTR-NEG-001 | Unauthenticated list/detail/create/mutation is denied.                                                                   |
| CTR-NEG-002 | Missing action-specific permission is denied.                                                                            |
| CTR-NEG-003 | Tenant/body authority, unknown fields, server fields and total tampering are denied.                                     |
| CTR-NEG-004 | Foreign, non-accepted, missing or already-contracted Proposal is denied.                                                 |
| CTR-NEG-005 | Foreign Customer/Partner/Opportunity/Plan substitution and BOLA/IDOR are denied without disclosure.                      |
| CTR-NEG-006 | Invalid currency, money scale/overflow or effective dates are rejected.                                                  |
| CTR-NEG-007 | Illegal transition, terminal mutation and ACTIVE revision are denied.                                                    |
| CTR-NEG-008 | Creator self-approval and unauthorised assign/approve/activate/cancel/terminate are denied.                              |
| CTR-NEG-009 | Stale expected version, divergent replay and cross-tenant idempotency are rejected.                                      |
| CTR-NEG-010 | RLS/FORCE RLS, no `SUPERUSER`/`BYPASSRLS`, and no root hard delete are proven.                                           |
| CTR-NEG-011 | Audit/event redaction excludes snapshots, PII, price lines and secrets.                                                  |
| CTR-NEG-012 | Concurrency races leave one authoritative result; failure injection rolls back aggregate/audit/outbox/idempotency.       |
| CTR-NEG-013 | Activation creates no subscription, entitlement, usage, billing, invoice, payment, accounting or commission consequence. |

## Classification and remaining governance

Identifiers are `INTERNAL`; Contract metadata and snapshots are `BUSINESS`; currency, prices, totals and effective dates are `CONFIDENTIAL_COMMERCIAL`; authorisation/audit are `SECURITY`. Retention, named owners/approvers, production `acr`/`amr` mapping, formal SLOs, QG-18–QG-22, baseline custody, ACS-REQ completeness and commit-signing enforcement remain pending. These do not authorise implementation or production use.

`CONTRACT_DOR_EXTRA_SCOPE = NONE`
