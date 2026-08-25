# ACS Phase 2 — Rating Evidence

Status: `LOCAL_PUBLICATION_READINESS_VERIFIED`

## Governance and boundary

Rating remains governed by ADR-0025 (`PROPOSED`). It is a tenant-scoped monetary
valuation capability, not Billing, Invoice, Payment, Receipt, Collection,
Accounting or Commission. Tax, discount, proration, FX and manual monetary
adjustment remain absent.

## Backend evidence

The signed-OIDC/PostgreSQL acceptance matrix recorded `RAT-POS 10/10`,
`RAT-NEG 11/11` and three supplementary proofs passing. It verifies Rate Plan
lifecycle and SoD, authoritative applicability and historical selection, FLAT,
PER_UNIT and TIERED_GRADUATED calculation, final HALF_UP rounding, immutable
Rated Facts, append-only rerating, idempotency/concurrency, transactional
audit/outbox and the financial firewall.

The final canonical `pnpm db:validate` completed successfully and recorded
`rating_rls=VERIFIED`, `rating_immutability=VERIFIED`, trusted human and machine
contexts, rollback/reapply, and tenant isolation. This was run through the
repository validator; no manual PostgreSQL cleanup was used.

## Shared event contract

The event-envelope validator accepts a bounded hyphenated segment such as
`rate-plan`, preserving lower-case dotted names and rejecting leading, trailing
and repeated hyphens. Event-envelope tests passed 3/3 and Event Foundation
passed twice after the change. This does not loosen tenant, payload, outbox or
event-delivery controls.

## Web evidence

`RatingRegistryPanel` consumes authoritative Rate Plan and Rated Fact APIs. It
supports DRAFT creation/edit, lifecycle commands, Rate Plan-version visibility,
ACTIVE Subscription applicability assignment, immutable Rated Fact display and
append-only manual rerating. It performs no monetary recomputation and exposes
no downstream financial controls. The focused Web matrix records 11/11 PASS,
including bounded HTTP errors and accessibility semantics.

## Final local validation

- Rating signed-OIDC/PostgreSQL E2E: 25 PASS, 0 FAIL (`RAT-POS 10/10`,
  `RAT-NEG 11/11`).
- Clean-state shared PostgreSQL regression: 397 PASS, 0 FAIL, 0 SKIP. The prior
  342 PASS / 55 FAIL result is classified as
  `SHARED_DATABASE_SUITE_STATE_CONTAMINATION=CONFIRMED`.
- Full Web: 12 files PASS, 147 tests PASS, 0 FAIL, 0 SKIP; the focused Rating
  Web/accessibility matrix is 11/11 PASS.
- Event Foundation: 5/5 PASS twice; repeatability is verified. Event-envelope
  validation: 3/3 PASS.
- Quality gates: format, lint, typecheck, test, build and aggregate
  `pnpm check` all PASS.

The recorded local baseline measures the authoritative Rating journey only; it
is observational and not a production SLO.

## CI and operational evidence

`phase-two-rating.yml` validates quality/Web gates and disposable PostgreSQL
validation, the complete shared commercial harness, and Event Foundation twice.
All database URLs are TEST_ONLY workflow configuration; no production
configuration was introduced. Remote publication and CI dispatch remain outside
this local-readiness checkpoint.

## Performance methodology

Performance remains a local disposable-test baseline only. It must retain
signed OIDC, AuthorizationPort, trusted context, least-privilege Rating role,
RLS/FORCE RLS, audit/outbox, idempotency and SoD. It is not an SLO. Formal
thresholds remain `PENDING_GOVERNANCE_APPROVAL`.

## Open governance gates

- ADR-0025: `PROPOSED`
- Rate Plan, Rated Fact, Rating audit and Usage retention:
  `PENDING_GOVERNANCE_APPROVAL`
- Named owners/approvers: `PENDING_GOVERNANCE_ASSIGNMENT`
- Formal Rating SLO and production step-up: `PENDING_GOVERNANCE_APPROVAL`
- Production IdP/client configuration and commit signing: pending
