# ACS Phase 2 Customer Registry Definition of Ready

Status: `IMPLEMENTED_PENDING_REMOTE_CI`

## Entry checkpoint

- Authorized base: `develop@45a67b5ec7e513b5407f56bbb68226278bdcfe7e`.
- Capability: tenant-scoped Commercial Customer Registry only.
- Canonical entity: `customers`, explicitly listed by Baseline v5.3 VOL-VI 6.4.2.
- Roadmap: Phase 2 — Plataforma Comercial, VOL-VIII 8.1.
- Delivery rules: VOL-VI 6.1/6.3/6.5, VOL-VII 7.1/7.3/7.4/7.7/7.10 and VOL-VIII
  8.2–8.4.
- Customer is commercial data owned by a tenant; it is not the platform tenant boundary.
- No customer entity existed at the authorized base.

## Authorized capability and lifecycle

The slice supports create, get, paginated list and explicit-field update. The minimum lifecycle is
`ACTIVE` and `INACTIVE`. There is no delete operation. Inactivation preserves the customer,
history, audit and event evidence. Final regulatory retention remains
`PENDING_GOVERNANCE_APPROVAL`.

## Canonical data

| Attribute                                           | Purpose                                      | Classification     |
| --------------------------------------------------- | -------------------------------------------- | ------------------ |
| `id`, `tenant_id`, `version`                        | Internal identity, isolation and concurrency | `INTERNAL`         |
| `display_name`, optional `reference_code`, `status` | Minimum commercial registry data             | `BUSINESS`         |
| optional `contact_email`                            | Operational contact only                     | `CONFIDENTIAL_PII` |
| created/updated timestamps and actor IDs            | Audit metadata                               | `SECURITY`         |

No fiscal, banking, payment, identity-document, credential, billing or secret data is permitted.
Contact email is optional, returned only to authorized readers, excluded from events, logs and
metrics, and redacted from audit metadata.

## Personas, permissions and SoD

| Abstract persona                  | Canonical permissions                                            |
| --------------------------------- | ---------------------------------------------------------------- |
| Commercial Customer Reader        | `commercial.customer.read`                                       |
| Commercial Customer Editor        | read, `commercial.customer.create`, `commercial.customer.update` |
| Commercial Customer Administrator | editor permissions, `commercial.customer.admin`                  |

Permissions are resolved from current PostgreSQL membership/role state through
`AuthorizationPort`; JWT claims and frontend guards are never permission sources. These roles do
not inherit Finance, Billing, Security Administrator or audit-mutation authority. Routine
create/read/update does not require step-up. Future privileged operations must fail closed until
an approved provider-specific assurance mapping exists.

## Contracts

- `POST /api/v1/commercial/customers`
- `GET /api/v1/commercial/customers/{customerId}`
- `GET /api/v1/commercial/customers?limit=&cursor=`
- `PATCH /api/v1/commercial/customers/{customerId}`

The authenticated membership supplies tenant authority. Body and query values cannot select a
tenant. Mutations require tenant-scoped idempotency keys and optimistic version checks. Update
accepts only `displayName`, `referenceCode`, `contactEmail`, `status` and `version`.

## Events

The slice approves these version-one event types:

- `commercial.customer.created` after successful creation;
- `commercial.customer.updated` after a material non-status update;
- `commercial.customer.status_changed` after an `ACTIVE`/`INACTIVE` transition.

Version `1.0.0` is carried by the canonical envelope rather than encoded into `event_type`. Events
are inserted into `platform.domain_events` atomically with
the customer and audit mutation. Payloads contain customer ID, resulting version and permitted
changed-field/status metadata only; contact PII is excluded. There are no invented commercial
consumers. Publishing is proven through the broker-neutral Event Foundation contract harness.

## Acceptance and evidence

The slice requires migration/rollback, constraints, tenant-scoped uniqueness, indexes, RLS and
FORCE RLS; signed OIDC-to-PostgreSQL E2E; cross-tenant and IDOR denial; permission and SoD
negatives; idempotent retries and divergent-key conflict; optimistic concurrency; durable audit;
atomic outbox; transport outage/recovery; real API-driven accessible UI; bounded baseline
measurements; OpenAPI; evidence and traceability.

QG-01–QG-08, QG-10 and QG-11 apply. QG-09 is `NOT_APPLICABLE`. QG-12 does not establish
production readiness. QG-18–QG-22 remain `UNDEFINED_IN_BASELINE`.

## Explicit exclusions

Plans, subscriptions, pricing, proposals, contracts, entitlements, invoices, payments, receipts,
collections, tax, revenue, checkout, licensing, financial ledger, opportunity pipeline and billing
lifecycle are prohibited. Production broker selection, production IdP registration, normative
retention periods and production SLOs remain separate governance gates.
