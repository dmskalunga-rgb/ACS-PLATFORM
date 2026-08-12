# ACS Phase 1 Selective Adoption Remediation Report

Status: `REMOTE_CI_PENDING`

## Authorized lineage

- Base: `develop` at `c5bea416dbc71f83c485fa92817e5850d4de88f3`.
- Original commits preserved without rewrite: `043619e3712f15f1dd0e2b38085c63fcb5a48035`,
  `ac13953715134c1e37f862a1af9b5205f58083a7`, and
  `683bccbaf09ea10a89399691449475e9916dfc79`.
- Remediation is additive on `feat/phase-1-platform-multitenancy`.
- No PR, merge, rebase, reset, squash, force push, release, or production tag was performed.

## Local verification

| Control                    | Evidence                                                            | Result               |
| -------------------------- | ------------------------------------------------------------------- | -------------------- |
| Quality                    | `CI=true pnpm check`                                                | `VERIFIED`           |
| PostgreSQL roles/migration | Disposable PostgreSQL 18.3 pinned by digest                         | `VERIFIED`           |
| RLS/tenant isolation       | trusted context, spoofing, permissions, durable audit, append-only  | `VERIFIED`           |
| API/PostgreSQL E2E         | 11 tests including cross-tenant, replay, expiry and malformed token | `VERIFIED`           |
| SBOM                       | CycloneDX generated from the frozen lockfile                        | `VERIFIED`           |
| SCA                        | Local registry request prohibited; assigned to authorized remote CI | `NOT_EXECUTED_LOCAL` |

## Remediation outcome

The selectively adopted slice now uses explicit membership permissions, a Phase 0
`AuthorizationPort`, privileged context issuance, opaque one-use grants, transaction-bound RLS,
durable redacted denial audit, shared API contracts, and production exclusion of development
identity configuration. Runtime validation also corrected a PL/pgSQL output-column ambiguity and
removed a false E2E lock wait while retaining replay and cross-connection assertions.

## Open items

- Remote Phase 0, Phase 1, repository validation, SCA/SBOM, CodeQL, secret, container and IaC
  results must be captured for the final decision.
- ADR-0011 and ADR-0012 remain proposed until the designated architecture authority acts.
- Production OIDC/JWT verification remains outside this selectively adopted development slice.
- ECOM, EDIM and EDOLM remain working catalogs pending owners and governance approval.
- QG-18 through QG-22 remain `UNDEFINED_IN_BASELINE`; no substitute gate was invented.
- Vite's successful production build reports browser externalization of `node:crypto`; separate
  browser-safe contract exports before a web path executes cryptographic helpers.

This report does not authorize Phase 2, a PR, a merge, or production deployment.
