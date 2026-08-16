# ACS Phase 1 Production OIDC/JWT Evidence

Status: `VERIFIED_AND_INTEGRATED`

- Branch: `feat/phase-1-production-oidc`
- Base: `develop@2bb84b3ac65d5af0b2f8279d86a1297f947c810b`
- Authorization boundary: Phase 1 production authentication only
- ADR: ADR-0013 (`PROPOSED`; formal approver remains pending)
- Dependency: `jose@6.2.8`, exact catalog version, MIT license
- Secrets or bearer tokens recorded: `NO`

## Implemented controls

- Provider-neutral OIDC mode with explicit issuer, audience, HTTPS JWKS URI, algorithms,
  clock tolerance, timeout, cache, and cooldown configuration.
- Cryptographic JWT validation for signature, `iss`, `aud`, `exp`, `nbf`, `iat`, and `sub`.
- Stable internal external-subject key derived from the immutable pair `[iss, sub]`.
- Existing user and active tenant membership remain authoritative; no JIT provisioning occurs.
- JWKS trust is configuration-only. Token-supplied key URLs cannot redirect verification.
- Audit reasons and metric labels are bounded codes; raw tokens and subjects are not logged.
- The browser accepts a token only through an in-memory boundary and delegates provider logout.

## Validation evidence

| Gate                             | Result              | Evidence                                                       |
| -------------------------------- | ------------------- | -------------------------------------------------------------- |
| Phase 1 entry regression         | `VERIFIED`          | `CI=true pnpm check` on base: 25 tests and build passed        |
| API unit/config tests            | `VERIFIED`          | 22 tests; JWT/JWKS matrix and concurrency included             |
| Web integration tests            | `VERIFIED`          | 8 tests passed locally, including bearer/logout/storage states |
| Type checks                      | `VERIFIED`          | platform API and web type checks passed                        |
| Full local repository check      | `VERIFIED`          | format, lint, typecheck, 39 tests, and builds passed           |
| Database static validation       | `VERIFIED`          | migration, FORCE RLS, isolation, spoofing, permission, audit   |
| Signed JWT + PostgreSQL/RLS E2E  | `VERIFIED`          | 18/18 tests passed against disposable PostgreSQL               |
| CycloneDX SBOM                   | `VERIFIED`          | generated from the final lockfile                              |
| Container build/scans            | `BLOCKED_LOCAL_ENV` | Docker build stalled; Trivy unavailable                        |
| Local SCA audit                  | `BLOCKED_POLICY`    | registry metadata submission denied; assigned to remote CI     |
| Remote Phase 1 workflow          | `VERIFIED`          | Run `31595802447`, success on implementation HEAD `91b53c5`    |
| Remote Phase 0/security workflow | `VERIFIED`          | Run `31595802497`, success on implementation HEAD `91b53c5`    |
| Repository validation            | `VERIFIED`          | Run `31936812725`, success on integrated HEAD `8698fe4`        |
| Integrated Phase 1 validation    | `VERIFIED`          | Run `31936812713`, success on integrated HEAD `8698fe4`        |
| Integrated Phase 0 regression    | `VERIFIED`          | Run `31936812776`, success on integrated HEAD `8698fe4`        |

## Test matrix

Covered locally: valid/invalid signatures, malformed, expired and future-`nbf` tokens, wrong
issuer/audience, future `iat`, absent `sub`, `alg=none`, HMAC confusion, disallowed algorithm,
unknown key, valid rotation, malformed JWKS, cache/timeout, `acr`/`amr`, and 50 concurrent cached
validations with one JWKS fetch and completion below the test's two-second bound. This is a
baseline measurement, not an SLO claim.

The PostgreSQL E2E exercised real signed JWTs through identity mapping, active/inactive membership,
permission enforcement, AuthorizationPort, opaque tenant grants, FORCE RLS, response contract, and
durable audit. User A/Tenant A was allowed; all cross-tenant, missing-permission, unknown-identity,
and manipulated-tenant cases were denied. Cryptographic failures were durably classified without
storing the tested JWTs.

## Integrated-state closure

The production OIDC/JWT implementation was integrated before the final Phase 1 documentation
closure. The post-merge `push` run set `31936812725`, `31936812713`, and `31936812776` validated
the final integrated documentation-closure HEAD
`8698fe43ae7c4a1f2e3d2d86ae5f1e9dda60d7a2`. These runs cover Repository validation, the Phase 1
platform multi-tenancy suite, and the Phase 0 engineering/security regression respectively.

This promotion closes only the stale remote-CI status for the implemented Phase 1 slice. It does
not approve ADR-0013, authorize production deployment, or resolve the operational and governance
gaps below.

## Residual and governance gaps

- ADR-0013 and production IdP/security/platform/IAM/audit owners and approvers remain pending.
- Provider client registration, global logout, refresh/revocation, and MFA enforcement are outside
  this slice and require deployment-specific governance.
- QG-18–QG-22 remain `UNDEFINED_IN_BASELINE`; baseline custody, catalog completeness, and
  individual ACS-REQ identifiers remain open governance gaps.
