# ACS Phase 2 Tenant-Scoped Plan Catalog Definition of Ready

Status: `PRE_IMPLEMENTATION_GOVERNANCE_PACKAGE`

## Authority, objective and boundary

This Definition of Ready is a governed preparation artifact for a future
tenant-scoped Commercial Plan Catalog slice. It is not implementation
authorization. The baseline canonical-entity reference is VOL-VI 6.4.2
(`plans`, `plan_features`); the governing human disposition selected this
domain as the third commercial candidate.

The future slice will provide authoritative, tenant-isolated master data for a
`Plan` aggregate and its managed `Plan Feature` children. It can later be
referenced by separately authorized domains. It must not calculate, store or
enforce price, currency, tax, billing, subscription, entitlement, licensing,
usage, quota, metering, checkout, invoice, payment, collection, contract,
customer, lead or opportunity state.

## Aggregate, lifecycle and canonical data

`Plan` is the aggregate root. `Plan Feature` belongs to exactly one Plan and
cannot be reused across plans or tenants. A feature has no independent
lifecycle (`PLAN_FEATURE_INDEPENDENT_LIFECYCLE = NO`) but has its own
optimistic version to prevent lost updates to the managed child.

Plan lifecycle is only `ACTIVE` and `INACTIVE`. Hard delete is prohibited.
`ACTIVE` to `INACTIVE` and reactivation to `ACTIVE` are explicit,
version-bound administrator operations; reactivation preserves the aggregate,
audit trail and event history. Retention duration remains
`PENDING_GOVERNANCE_APPROVAL`.

| Entity       | Exact logical attributes                                                                                                                                                                                                            | Classification                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Plan         | `id` UUID, trusted `tenant_id` UUID, `plan_code` text (1–80), `name` text (1–160), nullable `description` text (1–2,000), `status` (`ACTIVE`/`INACTIVE`), integer `version`, `created_at`, `updated_at`, `created_by`, `updated_by` | IDs/timestamps `INTERNAL`; code/name/description/status `BUSINESS`; actors/audit metadata `SECURITY` |
| Plan Feature | `id` UUID, `plan_id` UUID, `feature_code` text (1–80), `name` text (1–160), nullable `description` text (1–2,000), integer `version`, `created_at`, `updated_at`, `created_by`, `updated_by`                                        | IDs/timestamps `INTERNAL`; code/name/description `BUSINESS`; actors/audit metadata `SECURITY`        |

Codes are trimmed and compared case-insensitively. The future schema must
enforce unique Plan code per tenant and unique feature code per Plan. The
feature constraint decision is `NO_FEATURE_CONSTRAINT_METADATA`: no JSON bag,
limits, quantities, metering or entitlement semantics are permitted. PII,
secrets, financial values and free-form operational notes are excluded.

## Security, authorization and segregation of duties

| Persona                       | Canonical permissions                                          |
| ----------------------------- | -------------------------------------------------------------- |
| Commercial Plan Reader        | `commercial.plan.read`                                         |
| Commercial Plan Editor        | reader plus `commercial.plan.create`, `commercial.plan.update` |
| Commercial Plan Administrator | editor plus `commercial.plan.admin`                            |
| Auditor                       | independent read-only audit access; no Plan mutation authority |

`Plan Feature` inherits the parent Plan permission boundary; no separate
feature permission is approved. Tenant authority is derived only from the
authenticated membership, `AuthorizationPort` and transaction-bound trusted
context. JWT claims, client state, body/query tenant values and Plan IDs never
confer authority. Routine create/read/update/status work has no new step-up
requirement; any future privileged operation follows the existing fail-closed
step-up governance. No Commercial Plan role inherits Finance, Billing, Security
Administrator or Auditor mutation authority.

Future storage must use PostgreSQL RLS and FORCE RLS for both aggregate and
child, tenant-bound policies, least-privilege grants and no application bypass.
Cross-tenant parent/child access, IDOR/BOLA, mass assignment, denied
permission, stale version and divergent idempotency replay must fail closed and
produce redacted security/audit evidence.

## API and consistency contract

The future REST contract is limited to:

- `POST /api/v1/commercial/plans`
- `GET /api/v1/commercial/plans?limit=&cursor=`
- `GET /api/v1/commercial/plans/{planId}`
- `PATCH /api/v1/commercial/plans/{planId}`
- `POST /api/v1/commercial/plans/{planId}/features`
- `GET /api/v1/commercial/plans/{planId}/features?limit=&cursor=`
- `GET /api/v1/commercial/plans/{planId}/features/{featureId}`
- `PATCH /api/v1/commercial/plans/{planId}/features/{featureId}`

Lists use deterministic ascending UUID cursor ordering, default limit `25` and
maximum `100`; cursors are opaque UUID identities for the relevant scoped list.
Every mutation requires a tenant-scoped UUID `Idempotency-Key`, one atomic
operation record and an `expected_version`. Plan patch allows only
`plan_code`, `name`, `description`, `status`, `expected_version`; Feature patch
allows only `feature_code`, `name`, `description`, `expected_version`.
Unknown fields, tenant IDs, price/currency/tax, limits, product/module links,
subscriptions and other non-allowlisted fields are rejected.

`INACTIVE` Plans remain readable to authorized actors and cannot accept new
feature creation or feature update. Feature mutation is rejected when its
parent is inactive. The future implementation must decide whether a Plan
version increments for a child mutation and document it in the OpenAPI
contract; the child `expected_version` remains mandatory either way.

## Audit, events and observability

Each permitted mutation is one transaction containing authoritative change,
append-only audit record and canonical transactional-outbox event. Required
event types and envelope version are:

- `commercial.plan.created`, `commercial.plan.updated`,
  `commercial.plan.status_changed`;
- `commercial.plan_feature.created`, `commercial.plan_feature.updated`;
- canonical envelope `schema_version: 1.0.0`, classification `INTERNAL`.

Payloads contain only tenant-safe IDs, resulting versions, status where
applicable and allowlisted changed-field names; descriptions, actor identity,
credentials, tenant grants and any future financial data are excluded. No
consumer, broker vendor, retention duration or replay policy is introduced by
this slice. Request/correlation IDs, redacted structured logs and
low-cardinality metrics follow existing platform conventions.

Audit must record allowed create/update/status and feature mutations, plus
denied tenant escape, permission, parent-child mismatch, mass-assignment,
stale-version and idempotency-conflict attempts without raw token or sensitive
content.

## Required implementation acceptance matrix

Future implementation authorization must require all of the following real
evidence, not documentary assertion:

- migration, rollback and reapply; constraints, case-insensitive uniqueness,
  indexes, permissions, RLS and FORCE RLS;
- OIDC → AuthorizationPort → trusted context → PostgreSQL API E2E;
- Plan and Plan Feature create/get/list/update, cursor bounds and deterministic
  ordering; lifecycle inactivation/reactivation and inactive-parent denial;
- cross-tenant, parent-child mismatch, IDOR/BOLA, forged tenant, JWT-only
  authority, mass-assignment, denied permission and no-bypass negatives;
- stale Plan and Feature version conflicts; idempotency replay and divergent
  payload conflict; durable audit and atomic outbox/event evidence;
- real accessible Web UI with loading, empty, validation, generic-error,
  unauthenticated, forbidden, not-found and stale-conflict states;
- Event Foundation integration/recovery and Customer/Lead/Phase 1/Phase 0
  regressions; security, SCA/SBOM, container/filesystem and IaC controls.

QG-01–QG-08, QG-10 and QG-11 apply; QG-09 is `NOT_APPLICABLE`; QG-12 is a
pre-production concern only. QG-18–QG-22 remain `UNDEFINED_IN_BASELINE`.

## Explicit exclusions and open governance

No future Plan Catalog implementation may infer approval of ADR-0017,
retention, production broker, production IdP/client registration, acr/amr
mapping, SLO/performance thresholds, named owners/approvers, baseline custody,
global ECOM/EDIM/EDOLM completeness, ACS-REQ completeness or commit-signing
enforcement. All remain separately governed. Phase 2 implementation, release,
deployment and a merge to `main` are not authorized by this document.
