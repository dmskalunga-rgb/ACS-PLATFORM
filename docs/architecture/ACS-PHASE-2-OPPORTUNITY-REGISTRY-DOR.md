# ACS Phase 2 — Opportunity Registry Definition of Ready

Status: `PRE_IMPLEMENTATION_GOVERNANCE_PACKAGE`

## Boundary

Implement only a tenant-scoped, non-financial sales-pipeline Opportunity registry. It is an independent Commercial aggregate and is not a Proposal, Contract, Subscription, Invoice, Payment, Receipt, Collection, Commission, Pricing, Billing, Usage or Entitlement capability. `OPPORTUNITY_EXTRA_SCOPE = NONE`.

## Aggregate and relationships

Each Opportunity has trusted `tenant_id`, UUID identity, required tenant-scoped case-insensitively unique `opportunity_code`, required trimmed bounded `title`, required `stage`, required same-tenant eligible `owner_membership_id`, nullable same-tenant `customer_id`, `lead_id`, `partner_id`, and `plan_id`, nullable `expected_close_date`, nullable `probability_percent` (0–100), integer `version`, and timestamps. Tenant authority is never client supplied. Relationships are each `0..1`; no many-to-many relation, conversion, or downstream behaviour is allowed.

## Lifecycle

| From            | Permitted transitions |
| --------------- | --------------------- |
| `QUALIFICATION` | `DISCOVERY`, `LOST`   |
| `DISCOVERY`     | `PROPOSAL`, `LOST`    |
| `PROPOSAL`      | `NEGOTIATION`, `LOST` |
| `NEGOTIATION`   | `WON`, `LOST`         |
| `WON`           | none                  |
| `LOST`          | none                  |

`WON` and `LOST` are terminal. Reopen and backward transitions are deferred. `PROPOSAL` is a pipeline label only. Hard delete is prohibited.

## Financial firewall and ownership

No amount, expected value, currency, ARR, MRR, ACV, TCV, revenue, margin, price, discount, forecast, contract or commission data is allowed. Probability is non-financial confidence metadata only. Ownership is business metadata; canonical permission authorization remains mandatory and owner-only access is not assumed. Routine operations require no new step-up. Financial SoD is not required for this non-financial slice; least privilege remains mandatory.

## Security, API and consistency

The required path is OIDC → canonical identity → membership → AuthorizationPort → trusted context → repository → PostgreSQL RLS/FORCE RLS → audit → transactional outbox. Permissions are exactly `commercial.opportunity.read`, `.create`, `.update`, `.admin`.

Expected endpoints are POST/GET `/api/v1/commercial/opportunities`, GET/PATCH `/api/v1/commercial/opportunities/:opportunityId`; no DELETE or conversion/outcome special endpoints. Create allowlists only the frozen business fields; tenant, identifiers, version and timestamps are server-owned/read-only; unknown fields fail closed. POST is idempotent, PATCH follows the canonical registry convention, divergent replay is `409`, and stale version is `409`.

Every mutation must atomically persist the Opportunity, durable audit, outbox event, and idempotency result when applicable; failure rolls back all effects. Required events are `commercial.opportunity.created`, `.updated`, and `.stage_changed`, using the Event Foundation and minimal redacted payloads.

## Acceptance and implementation expectations

Positive coverage must include create/list/detail/update, legal transitions, optional same-tenant references, probability bounds, close date, replay, concurrency, audit and outbox. Negative coverage must include authentication/permission denial, tenant injection, unknown fields, mass assignment, cross-tenant/BOLA, all foreign references and owner membership, invalid/illegal/terminal transitions, uniqueness, replay conflict, no DELETE, direct DB escape, FORCE RLS/runtime-role proof, and audit/event leakage.

Future storage requires migration/rollback/reapply, least-privilege runtime role, ENABLE/FORCE RLS, no SUPERUSER/BYPASSRLS, same-tenant reference validation and no broad-CASCADE rollback. Fixtures are deterministic TEST_ONLY Tenant A/Tenant B data. Future CI must cover quality, disposable PostgreSQL, db validation, Opportunity E2E/security, Customer/Lead/Plan/Partner/Event/Phase 1 regressions and UI/build. Performance evidence is `BASELINE_MEASUREMENT_NOT_SLO` for create, detail, list, update, stage transition and complete journey.

## UI, data and governance

UI scope is list/create/detail/edit/stage change with loading, empty, unauthenticated, forbidden, not-found, conflict and generic-error states. Technical identifiers are `INTERNAL`, pipeline fields `BUSINESS`, audit/authorization `SECURITY`; PII is not intentionally collected and financial data is out of scope. Retention is `PENDING_GOVERNANCE_APPROVAL`, while durable no-delete records are required.

Functional owner: COMMERCIAL; contributors: PLATFORM, SECURITY, AUDIT; Finance and Legal are not initial functional owners; named owner remains pending. QG-01–08, 10 and 11 apply; QG-09 is not applicable, QG-12 pre-production, QG-18–22 undefined.

## Explicit exclusions

Lead/customer conversion; Proposal, Contract, Subscription, Commission, Pricing, Discount, Billing, Invoice, Payment, Receipt, Collection, Settlement, Usage, Entitlement, financial values/currency/forecasting, AI, lost-reason taxonomy, reopening, and many-to-many relationships.
