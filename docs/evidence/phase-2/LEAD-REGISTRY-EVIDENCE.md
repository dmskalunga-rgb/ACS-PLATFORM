# ACS Phase 2 Lead Registry Evidence

Status: `IMPLEMENTED_LOCAL_VERIFIED`

## Scope

The tenant-scoped Commercial Lead Registry is a pre-opportunity capability only. It does not
implement lead conversion, customers, opportunities, pricing, contracts, subscriptions, billing,
payments, collections, or a CRM pipeline. ADR-0016 remains `PROPOSED`.

## Canonical OIDC fixture alignment

The signed OIDC E2E subject is the canonical `[issuer, subject]` identity. The Lead permissions
are assigned only to its active Tenant A membership. The historical `oidc|alice` fixture remains
independent and is not an authority shortcut for Lead tests.

## Local validation

| Gate                                                                               | Result                      |
| ---------------------------------------------------------------------------------- | --------------------------- |
| Database migration, rollback/reapply, FK cleanup, RLS/FORCE RLS                    | `SUCCESS`                   |
| Canonical OIDC create/read authorization; unknown/wrong tenant denial              | `SUCCESS`                   |
| Lead OIDC HTTP E2E: persistence, audit, outbox, replay, conflict, tenant isolation | `SUCCESS`                   |
| Phase 1 trusted-context regression                                                 | `SUCCESS` — 24/24           |
| Customer Registry regression                                                       | `SUCCESS`                   |
| Event Foundation E2E                                                               | `SUCCESS` — 5/5             |
| Web accessibility-oriented component tests                                         | `SUCCESS` — 16/16 web tests |
| Typecheck, production web build, formatting                                        | `SUCCESS`                   |

No remote run exists for this uncommitted local HEAD. Remote CI evidence must be collected only
after authorized publication.

## Remaining governance boundaries

ADR-0016 disposition, owners/approvers, retention periods, production broker and IdP/client
registration, SLO thresholds, QG-18–QG-22, baseline custody, and individual ACS-REQ completeness
remain open. Phase 2 scope remains limited to authorized vertical slices.
