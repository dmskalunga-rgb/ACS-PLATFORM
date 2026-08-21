# ACS Phase 2 Lead Registry Evidence

Status: `VERIFIED_AND_INTEGRATED`

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

## Branch remote validation

The authorized Lead source SHA `0003c318666e40ab1c18dd14e6a58436300174d6` was published and
validated before PR creation. The following runs completed with `SUCCESS` on that exact source
SHA:

- Repository validation `32436891465`;
- Phase 2 Lead Registry validation `32436867520`;
- Phase 2 Customer Registry validation `32436867459`;
- Phase 1 platform multi-tenancy validation `32436867469`;
- Phase zero engineering validation `32436867470`.

## Pull request validation

PR [#9](https://github.com/dmskalunga-rgb/ACS-PLATFORM/pull/9) validated the same source SHA.
Its required PR runs completed with `SUCCESS`:

- Repository validation `32437108230`;
- Phase 1 platform multi-tenancy validation `32437108254`;
- Phase 2 Customer Registry validation `32437108314`;
- Phase 2 Lead Registry validation `32437108504`;
- Phase zero engineering validation `32437108325`.

## Integration and post-merge validation

PR #9 was integrated into `develop` with merge commit
`bcc19d27a724884b7451b2ca90118adb194c164d`. Its parents are the authorized pre-merge
`develop` SHA `7c867872d3a25a054909f6562a9d6755a5f109ea` and Lead source SHA
`0003c318666e40ab1c18dd14e6a58436300174d6`.

The post-merge `push` workflows all completed with `SUCCESS` on
`develop@bcc19d27a724884b7451b2ca90118adb194c164d`:

- Repository validation `32437469407`;
- Phase 2 Lead Registry validation `32437469411`;
- Phase 2 Customer Registry validation `32437469515`;
- Phase 1 platform multi-tenancy validation `32437469547`;
- Phase zero engineering validation `32437469514`.

## Remaining governance boundaries

ADR-0016 remains `PROPOSED`. Owners/approvers, retention periods, production broker and IdP/client
registration, acr/amr production mapping, SLO thresholds, QG-18–QG-22, baseline custody,
ECOM/EDIM/EDOLM completeness, individual ACS-REQ completeness and commit-signing enforcement
remain open. Customer Registry and Lead Registry are `VERIFIED_AND_INTEGRATED`; the commercial
domain disposition remains `INCOMPLETE`. A third Phase 2 vertical slice, production, release,
deployment and main integration remain `NOT_AUTHORIZED`.
