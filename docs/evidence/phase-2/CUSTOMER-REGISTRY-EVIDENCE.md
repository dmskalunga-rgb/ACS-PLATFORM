# ACS Phase 2 Customer Registry Evidence

Status: `IMPLEMENTED_PENDING_REMOTE_CI`

## Scope and baseline

- Authorized base: `develop@45a67b5ec7e513b5407f56bbb68226278bdcfe7e`.
- Slice: tenant-scoped Commercial Customer Registry only.
- Baseline: VOL-VI 6.1/6.3/6.4.2/6.5, VOL-VII 7.1/7.3/7.4/7.7/7.10 and VOL-VIII
  8.1–8.4.
- DoR: `docs/architecture/ACS-PHASE-2-CUSTOMER-REGISTRY-DOR.md`.
- Architecture: ADR-0015 remains `PROPOSED`; it has not been auto-approved.

## Implemented vertical path

`OIDC/JWT → /api/v1/commercial/customers → AuthorizationPort → one-use tenant grant →
commercial.customers FORCE RLS → audit → platform.domain_events → event delivery state → response`

The Web interface uses these real APIs for list, create and edit. Customer never becomes a tenant
selector. There is no delete endpoint and no billing, subscription, finance or CRM pipeline data.

## Data and security evidence

- Migration: `20260818010000_phase2_customer_registry.sql`.
- Disposable rollback evidence: matching rollback script, executed and reapplied by `db:validate`.
- Least-privilege NOLOGIN role: `acs_phase2_customer_registry`.
- RLS and FORCE RLS: enabled for customers and tenant-scoped idempotency operations.
- Tenant-scoped optional reference uniqueness and deterministic UUID pagination.
- Optimistic versioning prevents lost updates.
- Optional contact email is `CONFIDENTIAL_PII`; it is excluded from event payloads, logs, metrics
  and audit metadata.
- No hard delete, financial, banking, payment, identity-document, credential or secret fields.

## Authorization, SoD and MFA

Canonical permissions are `commercial.customer.read`, `.create`, `.update` and `.admin`.
Authentication is OIDC/JWT; permission truth is current PostgreSQL state through
`AuthorizationPort`. Abstract Reader, Editor and Administrator personas compose only customer
permissions and imply no Finance, Billing, Security Administrator or auditor mutation authority.
Routine operations do not invent a step-up requirement. Future privileged behavior remains
fail-closed pending approved assurance mapping.

## API, events and audit

- Create, get, bounded cursor list and allowlisted patch contracts exist below `/api/v1` and are
  published by the generated OpenAPI document.
- Mutations use tenant-scoped UUID idempotency keys. Identical retries reuse the result; divergent
  payload reuse conflicts.
- Events are `commercial.customer.created`, `.updated` and `.status_changed`, envelope version
  `1.0.0`, classification `CONFIDENTIAL`.
- Customer mutation, allowed audit and immutable outbox insert are one PostgreSQL transaction.
- Denied authentication, permission, stale-version and idempotency/reference conflicts are written
  through the durable redacted security-audit boundary.

## Local validation

| Gate                                    | Result                                         |
| --------------------------------------- | ---------------------------------------------- |
| Format, lint, typecheck                 | `SUCCESS`                                      |
| Unit/component tests                    | `SUCCESS` — contracts/API/UI/foundation suites |
| Production build                        | `SUCCESS`                                      |
| Migration + rollback/reapply            | `SUCCESS`                                      |
| PostgreSQL RLS isolation                | `SUCCESS`                                      |
| Signed OIDC/API/PostgreSQL Customer E2E | `SUCCESS`                                      |
| Phase 1 regression E2E                  | `SUCCESS` — 23/23                              |
| Event Foundation E2E                    | `SUCCESS` — 5/5                                |
| Event PII exclusion                     | `SUCCESS`                                      |
| Idempotent replay/divergent payload     | `SUCCESS`                                      |
| Stale and simultaneous updates          | `SUCCESS` — one winner, one conflict           |

Performance output is explicitly `baseline_only_not_slo` and records create-with-outbox, single
read, paginated list, update-with-outbox and complete journey timing in the PostgreSQL E2E log.
Production SLOs are not inferred.

## Remote evidence

Repository validation, Phase 2 Customer Registry validation, Phase 1 regression and Phase 0
regression/security must all validate the final published SHA. Run IDs and conclusions remain
`PENDING_REMOTE_CI` until the branch is published.

## Remaining boundaries

Named owners, normative customer/event retention periods, production broker, production IdP
registration, SLOs, ADR-0015 human disposition, QG-18–QG-22 and baseline custody remain governance
or pre-production gaps. QG-09 is `NOT_APPLICABLE`; QG-12 does not establish production readiness.
