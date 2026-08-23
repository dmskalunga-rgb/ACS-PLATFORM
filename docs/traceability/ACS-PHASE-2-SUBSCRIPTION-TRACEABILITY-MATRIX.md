# ACS Phase 2 — Subscription Traceability Matrix

**Status:** `DOR_DEFINED_NOT_IMPLEMENTED`
**ADR:** ADR-0022 (`PROPOSED`)
**Implementation / PR / merge:** `NOT_AUTHORIZED`

| Trace ID   | Baseline / governing source                                                   | Deterministic Subscription decision                                                                                      | Required future evidence              | Status          |
| ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | --------------- |
| SUB-TR-001 | Baseline §5.48 commercial management; §6.4.2 subscriptions                    | Tenant-scoped Subscription is a distinct aggregate, not Contract, Entitlement, Usage, Billing, or accounting.            | ADR-0022; aggregate model; RLS tests  | DOR_DEFINED     |
| SUB-TR-002 | Baseline §5.48 contracts, customers, plans, renewal, suspension, cancellation | Explicit origin from one `ACTIVE` Contract only; Customer and Plan origin server-derived and immutable.                  | Create E2E; origin snapshot tests     | DOR_DEFINED     |
| SUB-TR-003 | ADR-0021 Contract activation boundary                                         | Contract activation has no automatic downstream Subscription side effect; Contract-less create is denied.                | Negative E2E; outbox/audit proof      | DOR_DEFINED     |
| SUB-TR-004 | Baseline §5.48 plans/modules/limits/users/consumption                         | Contract quantity is not capacity, entitlement, quota, seat, module, limit, or usage authority.                          | Schema/API negative tests             | DOR_DEFINED     |
| SUB-TR-005 | Baseline §5.48 renewal/suspension/cancellation                                | Lifecycle is explicit, versioned, and terminal-state safe; renew is explicit-only and non-financial.                     | Lifecycle matrix SUB-POS/SUB-NEG      | DOR_DEFINED     |
| SUB-TR-006 | Existing ACS tenant isolation foundation                                      | Signed OIDC, membership, AuthorizationPort, trusted context, least DB role, RLS/FORCE RLS are mandatory.                 | Signed-OIDC/RLS cross-tenant E2E      | DOR_DEFINED     |
| SUB-TR-007 | Existing authorization and SoD governance                                     | Separate lifecycle permissions; creator self-activation denied; owner is active same-tenant membership.                  | Permission/SoD matrix                 | DOR_DEFINED     |
| SUB-TR-008 | Existing idempotency and expected-version standards                           | One current Subscription per Contract; replay stable, divergent replay conflicts, stale versions conflict.               | Concurrency/idempotency tests         | DOR_DEFINED     |
| SUB-TR-009 | Existing audit/event/outbox standards                                         | Lifecycle, immutable revision/history, audit, and outbox are atomic and tenant-safe.                                     | Transactional failure-injection tests | DOR_DEFINED     |
| SUB-TR-010 | Baseline §5.49 billing and collection                                         | No Billing, Invoice, Payment, Receipt, Collection, tax, currency, accounting, or ledger effect.                          | Downstream-side-effect negative proof | DOR_DEFINED     |
| SUB-TR-011 | Partner / Commission governance                                               | Partner remains non-financial; Commission is `OPTIONAL_FUTURE`.                                                          | Negative event/database tests         | DOR_DEFINED     |
| SUB-TR-012 | Phase 2 governance gaps                                                       | Retention, production broker/IdP, `acr`/`amr`, SLOs, owners, QG-18–QG-22, custody, catalog and ACS-REQ gaps remain open. | Governance disposition                | OPEN_GOVERNANCE |

## Acceptance mapping

The authoritative deterministic cases are defined in the DoR:

- `SUB-POS-001` through `SUB-POS-012`;
- `SUB-NEG-001` through `SUB-NEG-022`.

No case is implementation evidence until it is executed against the eventual Subscription implementation and recorded with the validated commit SHA.
