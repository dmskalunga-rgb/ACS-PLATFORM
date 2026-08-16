# Tenant Administration & Authorization Lifecycle Evidence

Date: 2026-08-16

Starting point: `develop@f169665e068af3d842f26a21db971f116bf8c48a`

Branch: `feat/phase-1-tenant-administration`

## Implemented scope

- Canonical tenant roles, role-permission and membership-role assignments.
- Active/inactive, versioned membership lifecycle.
- Current-state authorization through the existing `AuthorizationPort`.
- Distinct least-privilege PostgreSQL administration role and permission-bound one-use grants.
- FORCE RLS on every new tenant-owned relation.
- Governed status and role assignment/removal APIs under `/api/v1`.
- Tenant-scoped idempotency, request-hash conflict detection, row locking, and stale-version denial.
- Atomic durable allowed audit and justified append-only domain events.
- Existing redacted security denial audit for failed authorization/authentication.
- Minimal real administrative UI with loading, success, empty, error, unauthenticated, forbidden,
  and stale-refresh states.

## Validation evidence

| Gate                                                     | Result                                 |
| -------------------------------------------------------- | -------------------------------------- |
| Starting and final `pnpm check`                          | `VERIFIED`                             |
| Formatting, lint, typecheck, unit/component tests, build | `VERIFIED`                             |
| PostgreSQL fresh/upgrade/rollback and RLS                | `VERIFIED` on disposable PostgreSQL 17 |
| Signed OIDC/API/PostgreSQL E2E                           | `VERIFIED` — 22/22 tests passed        |
| Repository validation / Phase 1 / Phase 0 security CI    | `VERIFIED` on integrated merge SHA     |

## Integration closure

PR #4 was integrated into `develop` by merge commit
`8b2eb5b705088427479b85cecdca8ee161ce883b`, with target parent
`f169665e068af3d842f26a21db971f116bf8c48a` and source parent
`020401258ffc2b80e1f55d50a40678ce0bf7376b`. The source lineage is preserved.

The following post-merge `push` runs validated that exact integrated SHA:

| Workflow                                  | Run           | Jobs                                                                                     | Result     |
| ----------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- | ---------- |
| Repository validation                     | `31935367613` | `95136279005`                                                                            | `VERIFIED` |
| Phase 1 platform multi-tenancy validation | `31935367596` | `95136279003`, `95136279012`, `95136279023`                                              | `VERIFIED` |
| Phase zero engineering validation         | `31935367655` | `95136279072`, `95136279103`, `95136279114`, `95136279124`, `95136279154`, `95136293047` | `VERIFIED` |

These post-merge runs supersede the PR runs only as evidence of the integrated state. The PR runs
remain historical evidence. No release, deployment, `main` promotion, or Phase 2 work occurred.

Runtime validation recreated the integrated schema, applied the additive migration, executed the
rollback/recovery path, and reapplied it successfully. Database validation proved the existing
trusted-context replay/cross-connection/spoofing controls and direct tenant-administration RLS:
Tenant A context could see Tenant A roles while known Tenant B role and membership UUIDs remained
invisible, and a direct cross-tenant insert by `acs_phase1_tenant_admin` was rejected.

The 22-test E2E matrix covers signed OIDC through real PostgreSQL, same-tenant allow, cross-tenant
deny, self-administration denial, limited-administrator denial, foreign/unknown/inactive roles,
membership deactivate/reactivate, inactive-target denial, role assign/remove, duplicate removal,
permission and role revocation, divergent idempotency reuse, real concurrent winner/loser updates,
stale versions, durable audit/outbox, append-only events, invalid JWT, trusted-context replay, and
cross-connection reuse. A signed token containing fabricated tenant/role/permission claims remained
denied because authorization is resolved server-side.

Three runtime defects were remediated without scope expansion: PostgreSQL function parameter-name
compatibility, RBAC-aware trusted-grant issuance/RLS version-lock permission, and explicit JSONB
parameter typing. The rollback now removes dependent ephemeral grants before slice permissions.

## Excluded scope

No commercial customer, plan, subscription, billing, pricing, licensing, metering, invoice,
payment, CRM, contract, Phase 2+ domain, JIT provisioning, release, deployment, or merge is present.

## Open risks and governance

- Event publishing/retention and idempotency retention are operational follow-up items.
- Global MFA/step-up policy, named owners/approvers, QG-18–QG-22, baseline custody, ECOM/EDIM/EDOLM
  completeness, and missing normative ACS-REQ identifiers remain open.
- Complete organizational separation of duties remains `GOVERNANCE_PENDING`.
- ADR-0014 remains `PROPOSED`.
