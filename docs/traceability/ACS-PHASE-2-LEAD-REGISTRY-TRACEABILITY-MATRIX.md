# ACS Phase 2 Lead Registry Traceability Matrix

Status: `IMPLEMENTED_LOCAL_VERIFIED`

No individual ACS-REQ identifiers are invented; the baseline references remain authoritative.

| Authority          | Rule                               | Implementation                        | Verification                               | State            |
| ------------------ | ---------------------------------- | ------------------------------------- | ------------------------------------------ | ---------------- |
| VOL-VI 6.1/6.3/6.5 | Tenant-scoped pre-opportunity Lead | ADR-0016; `commercial.leads`          | migration, rollback, RLS E2E               | `VERIFIED_LOCAL` |
| VOL-VII 7.3/7.4    | Governed versioned API             | `/api/v1/commercial/leads`            | signed OIDC HTTP E2E                       | `VERIFIED_LOCAL` |
| ADR-0007/0013      | Canonical OIDC identity            | `[issuer, subject]` membership        | canonical fixture ALLOW/DENY proof         | `VERIFIED_LOCAL` |
| ADR-0011/0014      | Least privilege                    | read/create/update/admin capabilities | missing permission and wrong tenant denial | `VERIFIED_LOCAL` |
| VOL-VII 7.7        | Atomic audit and event outbox      | Lead mutation transaction             | E2E audit/outbox assertions                | `VERIFIED_LOCAL` |
| VOL-VII 7.1        | Accessible real frontend           | Lead list/create/qualify states       | web component tests                        | `VERIFIED_LOCAL` |

QG-18–QG-22 remain `UNDEFINED_IN_BASELINE`; remote verification is pending authorized publication.
