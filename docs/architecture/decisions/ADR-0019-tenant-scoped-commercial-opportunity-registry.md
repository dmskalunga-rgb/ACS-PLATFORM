# ADR-0019: Tenant-Scoped Commercial Opportunity Registry Boundary

- Status: `PROPOSED`

## Context and decision

Baseline v5.3 names opportunities in Commercial Management and in the Commercial canonical entity list, but does not define a pipeline model. Human governance therefore freezes the smallest useful independent boundary: a tenant-scoped non-financial Opportunity sales-pipeline registry.

The aggregate has required code, title, owner membership and stage; optional same-tenant Customer, Lead, Partner and Plan references; optional non-financial probability and close-date metadata; versioning; audit; and transactional outbox events. The lifecycle is `QUALIFICATION → DISCOVERY → PROPOSAL → NEGOTIATION → WON`, with `LOST` from any active stage. WON/LOST are terminal, hard delete is prohibited, and no backward/reopen transition exists.

It is mediated by AuthorizationPort, trusted tenant context, PostgreSQL RLS/FORCE RLS and least-privilege access. It does not grant owner-only authority, Finance, Billing, Commission, Security Administrator or Auditor mutation authority.

## Consequences and exclusions

No lead conversion, Customer creation, Proposal aggregate, Contract, Subscription, pricing, currency, monetary value, forecast, Commission, billing, payment, Usage, entitlement, contact PII or relationship side-effect is introduced. Retention, named owners/approvers, production broker/IdP, SLOs and global governance completeness remain pending. This ADR is not acceptance or implementation authorization.
