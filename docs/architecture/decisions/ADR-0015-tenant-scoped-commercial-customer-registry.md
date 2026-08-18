# ADR-0015: Tenant-scoped Commercial Customer Registry

- Status: `PROPOSED`
- Date: 2026-08-18
- Decision authority: independent Phase 2 Customer Registry authorization

## Context

Baseline v5.3 identifies `customers` as canonical Commercial Platform data. The integrated ACS
foundation already supplies trusted OIDC identity, current-state authorization, transaction-bound
tenant context, PostgreSQL FORCE RLS, durable audit, transactional outbox and broker-neutral event
delivery. The first Phase 2 slice must reuse those controls without introducing billing scope.

## Proposed decision

Implement Customer Registry as a module in the existing Platform API and Web application, backed
by tenant-owned PostgreSQL `commercial.customers`. Use UUID identity, `ACTIVE`/`INACTIVE`
lifecycle, optimistic integer versioning, tenant-scoped optional reference-code uniqueness and no
delete API. The Platform API derives tenant authority from the authenticated active membership,
checks canonical permissions through `AuthorizationPort`, activates the existing trusted database
grant, and relies on FORCE RLS for every data operation.

Customer mutations, allowed audit and canonical outbox event share one transaction. Retryable
mutations reuse the existing tenant-scoped administrative idempotency foundation rather than a
parallel mechanism. The UI calls only the documented `/api/v1/commercial/customers` API.

## Security and privacy consequences

- Tenant IDs supplied by clients are ignored/rejected as authority.
- Contact email is optional confidential PII and is excluded from logs, metrics, events and audit
  metadata.
- Update is allowlisted and version-bound; there is no mass assignment or hard deletion.
- Customer permissions do not imply Finance, Billing, Security or auditor mutation authority.
- Common operations do not invent an MFA requirement; future privileged operations fail closed
  until assurance policy mapping is approved.

## Operational consequences

Domain events remain durably pending if the transport is unavailable; the customer transaction
does not depend on synchronous broker availability. Production broker, SLO and retention-period
selection remain outside this ADR. This ADR does not authorize another Phase 2 capability.
