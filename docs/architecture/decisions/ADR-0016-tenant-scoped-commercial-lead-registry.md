# ADR-0016: Tenant-scoped Commercial Lead Registry

- Status: `PROPOSED`
- Date: 2026-08-21
- Decision authority: independent Phase 2 Lead Registry authorization

## Context

Baseline v5.3 VOL-VI 6.4.2 identifies `leads` as a canonical Commercial domain
entity. The integrated platform already proves OIDC identity, AuthorizationPort,
trusted transaction-bound tenant context, PostgreSQL FORCE RLS, audit,
transactional outbox and broker-neutral event delivery.

## Proposed decision

Implement `commercial.leads` as a minimal tenant-owned pre-opportunity registry.
Use UUID identity, `NEW`/`QUALIFIED`/`DISQUALIFIED` lifecycle, integer optimistic
versioning, no delete API and no Customer reference. Use only canonical
AuthorizationPort permissions and trusted context. Every allowed mutation shares
one transaction with its audit record and canonical outbox event.

## Consequences and exclusions

Lead contact name/email are optional `CONFIDENTIAL_PII`, excluded from events,
logs, metrics and audit metadata. The schema is intentionally narrow: no free
notes, phone, financial data or downstream-commercial fields. A lead never
creates or mutates Customer, opportunity, proposal or contract state. Production
broker selection, retention, SLOs and named ownership remain governance items.
