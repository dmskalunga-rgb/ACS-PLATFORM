# ACS Phase 2 — Subscription Threat Analysis

**Status:** `DOR_DEFINED_NOT_IMPLEMENTED`
**Scope:** Future Commercial Subscription aggregate only.
**Security baseline:** Existing signed OIDC, canonical identity, AuthorizationPort, trusted tenant context, least-privilege PostgreSQL roles, RLS/FORCE RLS, audit, and transactional outbox controls.

| Threat                                          | Required control                                                                                               | Required proof                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Tenant substitution or BOLA/IDOR                | Derive tenant only from trusted context; authorize every object reference; RLS/FORCE RLS with least DB role.   | SUB-NEG-004, 016, 017                       |
| Client authority over Customer, Plan, or origin | Create accepts only Contract origin; derive immutable Customer/Plan facts server-side; reject mass assignment. | SUB-POS-002; SUB-NEG-005, 018               |
| Contract-less or inactive origin                | Require one same-tenant `ACTIVE` Contract with authoritative Customer origin.                                  | SUB-NEG-003                                 |
| Duplicate current Subscription                  | Enforce one current Subscription per Contract with idempotency and concurrency protection.                     | SUB-POS-011; SUB-NEG-006, 015               |
| Unauthorized lifecycle or self-approval         | Separate least-privilege permissions; creator self-activation denial; valid-transition enforcement.            | SUB-POS-006–010; SUB-NEG-002, 008, 009, 022 |
| Owner abuse                                     | Require active same-tenant membership and assignment permission.                                               | SUB-POS-004; SUB-NEG-007                    |
| Date and renewal abuse                          | Server-validate effective dates and Contract authority; explicit-only non-financial renew.                     | SUB-POS-010; SUB-NEG-010, 021               |
| Capacity/entitlement escalation                 | Reject quantity-to-capacity, seats, quota, module, limit, entitlement, and usage semantics.                    | SUB-NEG-011, 013                            |
| Financial or Commission side effects            | No Billing, Invoice, Payment, Collection, accounting, Partner financial, or Commission behavior.               | SUB-NEG-013                                 |
| Lost update/replay corruption                   | Expected-version and idempotency conflict behavior is mandatory.                                               | SUB-POS-011; SUB-NEG-014, 015               |
| Partial audit/outbox/history writes             | One transaction; test-only failure injection proves rollback of all effects.                                   | SUB-POS-012; SUB-NEG-020                    |
| Sensitive event/log/audit leakage               | Emit only tenant-safe identifiers/status/version/origin references; redact prohibited data.                    | SUB-NEG-019                                 |

## Deferred security governance

Retention/cleanup policy, production broker and IdP/client registration, provider-specific `acr`/`amr` mapping, step-up enforcement timing, SLO thresholds, named owners/approvers, commit-signing enforcement, and baseline governance gaps remain pending. This threat analysis does not accept those risks or relax existing controls.
