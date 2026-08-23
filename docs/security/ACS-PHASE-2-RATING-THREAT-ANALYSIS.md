# ACS Phase 2 — Rating Threat Analysis

Status: `DOR_READY_FOR_PUBLICATION_REVIEW`; this is a control target, not implementation evidence.

| Threat                                                                   | Required control                                                                                                     | Acceptance target                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Cross-tenant Rate Plan, Usage, Subscription, or Entitlement substitution | Server-resolved lineage, applicability assignment, AuthorizationPort, trusted context, RLS/FORCE RLS.                | RAT-NEG-002                      |
| Rate version, effective-date, or stale-version tampering                 | Immutable effective versions, expected-version concurrency, non-overlap constraint, and event-window selection.      | RAT-NEG-004–005, 007–008         |
| Currency, rounding, unit, or tier manipulation                           | Exact USD/2-decimal rule, decimal arithmetic, HALF_UP final rounding, exact unit match, validated half-open tiers.   | RAT-POS-004–005; RAT-NEG-006     |
| Creator self-approval or self-activation                                 | Separate creator/approver/activator checks in the server transaction.                                                | RAT-POS-002; RAT-NEG-003         |
| Duplicate rating, replay, or race                                        | Tenant idempotency, expected version, transactional serialization and uniqueness.                                    | RAT-POS-007; RAT-NEG-004, 009    |
| Late Usage/correction used to rewrite history                            | Append-only rerating reference chain; immutable old and new Rated Facts.                                             | RAT-POS-008–009; RAT-NEG-007–008 |
| Privileged rerating abuse                                                | Separate permission, signed OIDC, high-risk audit; production step-up gate.                                          | RAT-POS-009; RAT-NEG-001, 008    |
| Machine-principal privilege escalation                                   | Measurement Sources receive no Rating authority; server-controlled execution only.                                   | RAT-NEG-008                      |
| Audit/outbox desynchronization                                           | Same transaction for aggregate/history, audit, outbox and idempotency; TEST_ONLY rollback proof.                     | RAT-NEG-009–010                  |
| Billing or financial-domain escalation                                   | Explicit downstream firewall; no Billing, Invoice, Payment, Receipt, Collection, Accounting, or Commission consumer. | RAT-NEG-011                      |
