# ACS Phase 2 Tenant-Scoped Commercial Lead Registry Definition of Ready

Status: `APPROVED_FOR_AUTHORIZED_IMPLEMENTATION`

## Objective and boundary

Implement only a tenant-scoped registry of commercial leads: a pre-opportunity
commercial record owned by a platform tenant. A lead is not a tenant, Customer,
opportunity, proposal, contract, plan, subscription or financial record.

This slice supports create, get, bounded cursor list and explicit-field update.
It does not implement lead-to-customer conversion, an opportunity pipeline, a
board, hard delete, billing, pricing, contracts or any downstream commercial
workflow.

## Baseline and architecture

- Baseline: VOL-VI 6.1, 6.3, 6.4.2 and 6.5; VOL-VII 7.1, 7.3, 7.4, 7.7 and
  7.10; VOL-VIII 8.1–8.6.
- Phase: Phase 2 — Plataforma Comercial.
- Vertical path: OIDC/JWT → AuthorizationPort → trusted tenant context →
  PostgreSQL FORCE RLS → audit → transactional outbox → Event Foundation.
- The implementation reuses the proven Customer Registry and Event Foundation
  boundaries; it introduces no authentication, authorization, audit, event or
  broker subsystem.

## Lifecycle, data and privacy

The minimal lifecycle is `NEW`, `QUALIFIED` and `DISQUALIFIED`. `CONVERTED` is
deliberately absent because it would imply a Customer or opportunity workflow
outside this authorization. There is no delete operation; normative retention is
`PENDING_GOVERNANCE_APPROVAL`.

| Attribute                                | Purpose                             | Classification     |
| ---------------------------------------- | ----------------------------------- | ------------------ |
| `id`, `tenant_id`, `version`, timestamps | identity, isolation and concurrency | `INTERNAL`         |
| `display_name`, `source`, `status`       | minimal commercial registry         | `BUSINESS`         |
| optional `contact_name`, `contact_email` | limited operational contact         | `CONFIDENTIAL_PII` |
| actor and audit metadata                 | security evidence                   | `SECURITY`         |

No phone, free-text notes, identity documents, credentials, payment data,
revenue, probability, pricing or contract fields are stored. Contact PII is
excluded from events, logs, metrics and audit metadata.

## Personas, authorization and SoD

| Persona                       | Permissions                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| Commercial Lead Reader        | `commercial.lead.read`                                         |
| Commercial Lead Editor        | reader plus `commercial.lead.create`, `commercial.lead.update` |
| Commercial Lead Administrator | editor plus `commercial.lead.admin`                            |

Permission truth is current PostgreSQL state via `AuthorizationPort`; JWT and
frontend state are authentication/presentation only. These permissions do not
inherit Customer Administrator, Finance, Billing, Security Administrator or
auditor-mutation authority. Routine operations do not require step-up; future
privileged operations retain the existing fail-closed policy pending governance.

## API, events, audit and observability

- `POST /api/v1/commercial/leads`
- `GET /api/v1/commercial/leads/{leadId}`
- `GET /api/v1/commercial/leads?limit=&cursor=`
- `PATCH /api/v1/commercial/leads/{leadId}`

Tenant authority comes only from the authenticated membership and trusted
context; request payloads never select a tenant. Mutations are allowlisted,
idempotent per tenant and version-bound. Events use the canonical `1.0.0`
envelope: `commercial.lead.created`, `commercial.lead.updated` and
`commercial.lead.status_changed`. Their payload contains only lead ID, version,
status and safe changed-field metadata. Allowed and denied actions are auditable
without raw bearer tokens or contact PII. Request/correlation IDs, redacted
structured logs and low-cardinality telemetry are reused.

## Frontend, tests and quality gates

The real Web UI provides list, create, view and edit with loading, empty,
success, validation-error, generic-error, unauthorized, forbidden, not-found
and stale-conflict states. It uses semantic labels, keyboard navigation, focus
and responsive controls.

Acceptance requires migration/rollback/reapply, FORCE RLS, signed OIDC API to
PostgreSQL E2E, isolation and negative-security matrix, concurrency and
idempotency tests, durable audit/outbox, Event Foundation outage recovery,
Customer Registry regression, frontend/build checks, evidence and traceability.
QG-01–QG-08, QG-10 and QG-11 apply; QG-09 is `NOT_APPLICABLE`; QG-12 is not a
production claim; QG-18–QG-22 are `UNDEFINED_IN_BASELINE`.

## Explicit exclusions

Opportunities, conversion, proposals, quotes, contracts, plans, pricing,
subscriptions, usage, entitlements, licensing, invoices, payments, collections,
tax, revenue, checkout, commissions, partners, ledger and any CRM pipeline
beyond Lead Registry remain `NOT_AUTHORIZED`.
