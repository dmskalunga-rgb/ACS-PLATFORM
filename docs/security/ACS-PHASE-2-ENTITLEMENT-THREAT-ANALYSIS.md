# ACS Phase 2 — Entitlement Threat Analysis

Status: `LOCAL_IMPLEMENTATION_EVIDENCED`; implementation remains pending independent publication and integration review.

| Threat                                   | Required control                                                                                                    | Required proof                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Tenant escape / BOLA / IDOR              | Signed OIDC, membership, AuthorizationPort, trusted context and RLS/FORCE RLS; server-side relationship checks.     | ENT-NEG-001–004, 013–014           |
| Subscription or origin substitution      | Client cannot supply tenant, Customer, Contract, Plan or Plan Feature authority.                                    | ENT-NEG-003–005                    |
| Entitlement amplification                | Unique current Subscription-origin assertion; no quantity/capacity/quota semantics.                                 | ENT-NEG-006–007, 017               |
| Privilege escalation / self-activation   | Explicit least-privilege permissions; creator cannot activate.                                                      | ENT-POS-006; ENT-NEG-002, 008, 018 |
| Replay, stale version and race           | Tenant-scoped idempotency, expected version and concurrency proof.                                                  | ENT-POS-010–011; ENT-NEG-011–012   |
| Trusted-context forgery / RLS bypass     | Opaque trusted context and least-privilege role; no admin runtime bypass.                                           | ENT-NEG-013–014, 018               |
| History, audit or outbox suppression     | Aggregate, immutable history, audit, outbox and idempotency are one transaction.                                    | ENT-POS-012; ENT-NEG-015           |
| Sensitive or mutable source disclosure   | Events/audit contain only tenant-safe identifiers and approved immutable references.                                | ENT-NEG-016                        |
| Unauthorized downstream financial effect | Explicit firewall forbids Usage, Billing, Invoice, Payment, Receipt, Collection, Accounting and Commission effects. | ENT-NEG-017                        |
