# ACS Phase 2 Tenant-Scoped Partner Registry Definition of Ready

Status: `PRE_IMPLEMENTATION_GOVERNANCE_PACKAGE`

## Authority, objective and boundary

The baseline explicitly lists `partners` in the Commercial canonical entities
(VOL-VI 6.4.2) and lists partners and commissions within Commercial Management
(VOL-V 5.48). The following boundary is a `HUMAN_GOVERNANCE_DECISION`, not an
inference from those high-level mentions: a tenant-scoped, non-financial
Commercial Partner Registry.

The future slice is independent Partner master data. It must not implement
commission, payout, settlement, billing, revenue, pricing, discounts, invoice,
payment, receipt, collection, subscription, Customer/Lead/Plan/Opportunity
assignment, contract execution, referral payout, or financial reconciliation.
`PARTNER_FINANCIAL_SCOPE = NONE`.

## Aggregate, lifecycle and canonical data

`Partner` is the sole aggregate root and belongs to exactly one tenant. Tenant
scope, `ACTIVE`/`INACTIVE` lifecycle, no hard delete, deferred taxonomy and
deferred contact data are `HUMAN_GOVERNANCE_DECISIONS`. No relationship column
or child aggregate is authorized in this slice.

| Attribute                                              | Exact future contract                                             | Basis / classification                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`, trusted `tenant_id`                              | UUID                                                              | `TECHNICAL_IMPLEMENTATION_DECISION`; `INTERNAL`                        |
| `partner_code`                                         | required trimmed text, 1–80; case-insensitively unique per tenant | Human-approved field/uniqueness; validation limit is technical         |
| `display_name`                                         | required trimmed text, 1–160                                      | Human-approved field; validation limit is technical; `BUSINESS`        |
| `status`                                               | `ACTIVE` or `INACTIVE`                                            | `HUMAN_GOVERNANCE_DECISION`; `BUSINESS`                                |
| `version`                                              | positive integer                                                  | technical optimistic-concurrency control; `INTERNAL`                   |
| `created_at`, `updated_at`, `created_by`, `updated_by` | timestamps and actor UUIDs                                        | baseline table pattern / technical audit evidence; metadata `SECURITY` |

`partner_type`, personal contact data, external financial identifiers, banking,
payment, commission, tax, Customer/Lead/Plan relations and arbitrary metadata
are excluded. Retention remains `PENDING_GOVERNANCE_APPROVAL`.

## Security, authorization and SoD

| Persona               | Canonical permission / authority                                     |
| --------------------- | -------------------------------------------------------------------- |
| Partner Reader        | `commercial.partner.read`                                            |
| Partner Editor        | reader plus `commercial.partner.create`, `commercial.partner.update` |
| Partner Administrator | editor plus `commercial.partner.admin`                               |
| Independent Auditor   | policy-permitted read-only audit access; no mutation                 |

The matrix is a `HUMAN_GOVERNANCE_DECISION`. It confers no Finance, Billing,
Commission, Security Administrator or Platform Administrator authority. Routine
create/read/update operations require normal authenticated OIDC, current
membership and `AuthorizationPort`; they have no new step-up requirement. A
future financial, security-override or sensitive administrative operation must
be separately governed and fail closed without required assurance.

Tenant authority must never come from JWT claims, client state, headers, query
or request body. The future implementation must reuse canonical identity,
active membership, `AuthorizationPort`, transaction-bound trusted context,
least privilege, PostgreSQL RLS and FORCE RLS.

## API and consistency contract

The human-approved DoR surface is limited to:

- `POST /api/v1/commercial/partners`
- `GET /api/v1/commercial/partners?limit=&cursor=`
- `GET /api/v1/commercial/partners/{partnerId}`
- `PATCH /api/v1/commercial/partners/{partnerId}`

There is no DELETE endpoint. The technical API decision is deterministic
ascending UUID cursor order, default limit `25`, maximum `100`, and opaque
scoped cursors. Create requires a tenant-scoped UUID `Idempotency-Key`; PATCH
requires it where replay risk applies and always requires `expected_version`.
PATCH permits only `partner_code`, `display_name`, `status` and
`expected_version`. Unknown fields, tenant values, taxonomy, relationship,
financial and contact fields are rejected. No silent last-write-wins update is
allowed. Inactive Partners remain readable to authorized actors; status
transition behavior is explicit, version-bound and auditable.

## Audit, events, UI and observability

Each permitted mutation must atomically preserve the authoritative Partner
change, operation/idempotency result where applicable, append-only audit and
transactional-outbox event. The human-approved event names are
`commercial.partner.created`, `commercial.partner.updated` and
`commercial.partner.status_changed`, using the canonical `1.0.0` envelope and
Event Foundation. Payloads are minimal `INTERNAL` data: tenant-safe IDs,
resulting version, status and allowlisted changed-field names only. They exclude
PII, credentials, grants and all financial/commission data.

The future accessible UI is limited to list, create, detail, edit,
ACTIVE/INACTIVE transition, loading, empty, unauthenticated, forbidden,
not-found, stale-conflict and generic-error states. It contains no commission,
revenue, payout, financial-total, pipeline, relationship-management or contract
screen. Each future interactive control must be semantic, labeled and keyboard
operable; errors must be associated with their fields, status changes must be
communicated accessibly, and focus must move predictably after successful or
failed submissions.

## Required implementation acceptance matrix

Implementation authorization must require real evidence for:

- migration, rollback/reapply, case-insensitive tenant-scoped uniqueness,
  permissions, indexes, RLS and FORCE RLS;
- OIDC → AuthorizationPort → trusted context → PostgreSQL API E2E;
- create/get/list/patch, cursor bounds, deterministic ordering and lifecycle
  transition;
- unauthenticated and permission denial; forged/body tenant, cross-tenant list,
  detail and update, IDOR/BOLA, RLS bypass and direct tenant-escape prevention;
- mass assignment, unknown fields, stale-version conflict, idempotent replay
  and divergent-payload conflict;
- redacted audit, event-leakage and atomic mutation/audit/outbox/idempotency
  rollback evidence;
- accessible UI states, Event Foundation integration, Customer/Lead/Plan and
  Phase 1/Phase 0 regression, plus security/SCA/SBOM/container/filesystem/IaC
  controls.

QG-01–QG-08, QG-10 and QG-11 apply. QG-09 is `NOT_APPLICABLE`; QG-12 is
pre-production only; QG-18–QG-22 remain `UNDEFINED_IN_BASELINE`.

## ECOM, EDIM, EDOLM and exclusions

The human-approved candidate owner is Commercial, with Platform, Security and
Audit contributors. Finance is not a functional owner for this initial slice.
Named owner, approver and steward remain `PENDING_GOVERNANCE_APPROVAL`.

The approved conceptual flow is Partner API → application service →
AuthorizationPort → trusted tenant context → tenant-scoped repository →
PostgreSQL RLS/FORCE RLS → audit → transactional outbox → Event Foundation.
No external integration, broker vendor, SLA or retention duration is introduced.

This DoR does not authorize implementation, ADR acceptance, production,
release, deployment, merge to `main`, or resolution of retention, named
ownership, production broker/IdP, SLO, baseline custody, ACS-REQ completeness,
commit signing or QG-18–QG-22.
