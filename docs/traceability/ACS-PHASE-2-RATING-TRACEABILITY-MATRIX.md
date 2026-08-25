# ACS Phase 2 — Rating Traceability Matrix

Status: `LOCAL_PUBLICATION_READINESS_VERIFIED`

| ID         | Authority                  | Deterministic requirement                                                                                                                                                                          | Threat / acceptance target                                               | Future evidence target       |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| RAT-TR-001 | Governance §§2–7; ADR-0025 | Rating is distinct Commercial monetary valuation; Rate Plan is distinct from catalog Plan.                                                                                                         | Domain conflation; RAT-POS-001–002                                       | ADR, DoR, migration/API/E2E  |
| RAT-TR-002 | Governance §§12–14, 38–39  | Server resolves Tenant → Subscription → Entitlement → Usage and Rate Plan applicability by event-window time.                                                                                      | Substitution / wrong historical rate; RAT-POS-006, RAT-NEG-002, 008      | Repository, PostgreSQL E2E   |
| RAT-TR-003 | Governance §§6–8, 32, 34   | Effective Rate Plan versions and Rated Facts are immutable; no overlaps.                                                                                                                           | Version tampering / overlap; RAT-POS-010, RAT-NEG-005, 007               | Migration, repository, E2E   |
| RAT-TR-004 | Governance §§11–23         | One currency, decimal arithmetic, HALF_UP final rounding, exact units, and bounded models.                                                                                                         | Currency/rounding/tier manipulation; RAT-POS-003–005, RAT-NEG-006        | Contracts, service, E2E      |
| RAT-TR-005 | Governance §§25–31         | Late Usage/corrections use append-only rerating; adjustments are absent.                                                                                                                           | Rerating abuse / historic mutation; RAT-POS-008–009, RAT-NEG-008–009     | Repository, E2E, audit       |
| RAT-TR-006 | Governance §§8–10, 30, 38  | SoD, least privilege, signed OIDC, AuthorizationPort, trusted context, RLS/FORCE RLS and no machine Rating authority.                                                                              | Self-approval / privilege escalation; RAT-POS-002, RAT-NEG-001–003, 008  | OIDC/PostgreSQL E2E          |
| RAT-TR-007 | Governance §§33–36, 41–42  | Idempotency, serialization, append-only audit and transactional outbox are atomic; planned events are `commercial.rating.rate-plan.*`, `commercial.rating.rated`, and `commercial.rating.rerated`. | Duplicate rating / audit-outbox split; RAT-POS-007, RAT-NEG-004, 009–010 | Concurrency/failure E2E      |
| RAT-TR-008 | Governance §§37, 43        | Rating has no downstream financial consumer or side effect.                                                                                                                                        | Billing-boundary escalation; RAT-NEG-011                                 | Negative integration proof   |
| RAT-TR-009 | Governance §§45–50         | Retention, named owners, SLO, step-up and global catalogs remain explicit production/governance gates.                                                                                             | Premature production claim                                               | ECOM/EDIM/EDOLM and evidence |

## Reconciled local evidence

The backend matrix (`RAT-POS 10/10`, `RAT-NEG 11/11`), Rating Web/accessibility
matrix (11/11), clean-state shared PostgreSQL regression (397 PASS, 0 FAIL,
0 SKIP), database validator, shared event-envelope tests (3/3) and repeated
Event Foundation validation (5/5 twice) are recorded in
`docs/evidence/phase-2/RATING-EVIDENCE.md`. Format, lint, typecheck, test,
build and aggregate `pnpm check` also passed for this local checkpoint. EDIM
and EDOLM mappings above are implemented for the local slice; ECOM is unchanged
except for the explicit Rating boundary. ADR-0025 remains `PROPOSED`; retention,
named ownership, formal SLO, production step-up and production IdP/client
configuration remain open governance gates.
