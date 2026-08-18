# ACS Phase 2 Customer Registry Traceability Matrix

Status: `IMPLEMENTED_REMOTE_CI_VERIFIED`

No individual ACS-REQ identifiers are invented. Baseline section references remain authoritative.

| Baseline / authority                    | Capability / rule                        | Architecture         | Data / API / UI                                     | Verification                                                                                          | Evidence                    | State             |
| --------------------------------------- | ---------------------------------------- | -------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------- | ----------------- |
| VOL-VIII 8.1; independent authorization | First Phase 2 vertical slice only        | DoR; ADR-0015        | Customer Registry only                              | Diff/scope inspection                                                                                 | Customer evidence           | `IMPLEMENTED`     |
| VOL-VI 6.4.2                            | Canonical tenant-owned customer          | ADR-0015             | `commercial.customers`                              | Migration/rollback                                                                                    | Customer evidence           | `VERIFIED_LOCAL`  |
| VOL-I 1.4; VOL-VI 6.1/6.3/6.5           | Tenant isolation, source and lineage     | Phase 1 architecture | tenant ID, FORCE RLS, EDOLM                         | SQL and signed OIDC E2E                                                                               | Customer evidence           | `VERIFIED_LOCAL`  |
| VOL-VII 7.3/7.4                         | Governed versioned API                   | ADR-0005; ADR-0015   | `/api/v1/commercial/customers`; OpenAPI             | schemas, auth, pagination, conflict tests                                                             | Customer evidence           | `VERIFIED_LOCAL`  |
| ADR-0007/0013                           | Production authentication boundary       | OIDC adapter         | signed JWT → internal subject                       | crypto/JWKS and Customer E2E                                                                          | Phase 1 + Customer evidence | `VERIFIED_LOCAL`  |
| ADR-0011/0014; human SoD policy         | Current-state permissions and separation | AuthorizationPort    | read/create/update/admin permissions                | missing permission and role-boundary review                                                           | Customer evidence           | `VERIFIED_LOCAL`  |
| VOL-VII 7.7; ADR-0006                   | Atomic versioned event                   | Event Foundation     | domain event/outbox                                 | delivery, retry, DLQ, replay, PII exclusion                                                           | Customer + Event evidence   | `VERIFIED_LOCAL`  |
| VOL-VII 7.3/7.10                        | Audit and observability                  | ADR-0009/0015        | allowed audit, redacted denial, request/correlation | audit/event queries and log constraints                                                               | Customer evidence           | `VERIFIED_LOCAL`  |
| VOL-VII 7.1; QG-07                      | Real accessible frontend                 | ADR-0002             | list/create/view data/edit states                   | component/accessibility-oriented tests                                                                | Customer evidence           | `VERIFIED_LOCAL`  |
| VOL-VIII 8.2–8.4                        | Complete test/evidence/DoD chain         | DoR                  | migration → service → API → UI → event              | local check, PostgreSQL and remote CI runs `32149619296`, `32149574314`, `32149574185`, `32149574070` | This matrix                 | `VERIFIED_REMOTE` |

QG-01–QG-08, QG-10 and QG-11 are applicable. QG-09 is `NOT_APPLICABLE`. QG-12 remains a
production gate. QG-18–QG-22 remain `UNDEFINED_IN_BASELINE`.
