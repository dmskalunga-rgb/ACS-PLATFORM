# ACS Phase 2 Lead Registry Traceability Matrix

Status: `IMPLEMENTED_VALIDATED_AND_INTEGRATED`

No individual ACS-REQ identifiers are invented; the baseline references remain authoritative.

| Authority          | Rule                               | Implementation                        | Verification                                                                  | State                     |
| ------------------ | ---------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------- |
| VOL-VI 6.1/6.3/6.5 | Tenant-scoped pre-opportunity Lead | ADR-0016; `commercial.leads`          | migration, rollback, RLS E2E; post-merge Lead run `32437469411`               | `VERIFIED_AND_INTEGRATED` |
| VOL-VII 7.3/7.4    | Governed versioned API             | `/api/v1/commercial/leads`            | signed OIDC HTTP E2E; post-merge Lead run `32437469411`                       | `VERIFIED_AND_INTEGRATED` |
| ADR-0007/0013      | Canonical OIDC identity            | `[issuer, subject]` membership        | canonical fixture ALLOW/DENY proof; post-merge Lead run `32437469411`         | `VERIFIED_AND_INTEGRATED` |
| ADR-0011/0014      | Least privilege                    | read/create/update/admin capabilities | missing permission and wrong tenant denial; post-merge Lead run `32437469411` | `VERIFIED_AND_INTEGRATED` |
| VOL-VII 7.7        | Atomic audit and event outbox      | Lead mutation transaction             | E2E audit/outbox assertions; post-merge Lead run `32437469411`                | `VERIFIED_AND_INTEGRATED` |
| VOL-VII 7.1        | Accessible real frontend           | Lead list/create/qualify states       | web component tests; post-merge Lead run `32437469411`                        | `VERIFIED_AND_INTEGRATED` |

The source SHA `0003c318666e40ab1c18dd14e6a58436300174d6` was validated in PR #9 and integrated
by merge commit `bcc19d27a724884b7451b2ca90118adb194c164d`. Post-merge runs `32437469407`,
`32437469411`, `32437469515`, `32437469547` and `32437469514` completed with `SUCCESS` on that
merge SHA. QG-18–QG-22 remain `UNDEFINED_IN_BASELINE`; this integration does not establish
approval, certification or production readiness.
