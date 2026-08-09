# ACS Phase 1 Traceability Matrix

Status: `IN_PROGRESS`

No row creates a normative `ACS-REQ` identifier.

| Baseline         | Requirement                                   | Architecture/ADR   | Data                            | API/implementation                | Test/security validation         | Evidence                 | Status        |
| ---------------- | --------------------------------------------- | ------------------ | ------------------------------- | --------------------------------- | -------------------------------- | ------------------------ | ------------- |
| VOL-I-1.4/1.6    | Complete multi-tenant security path           | ADR-0007, ADR-0011 | tenants/users/memberships/audit | current context slice             | unit, API, DB, E2E, cross-tenant | `docs/evidence/phase-1/` | `DESIGNED`    |
| VOL-II-2.3/2.7   | Canonical tenant and transverse boundaries    | ADR-0011           | tenant UUID and membership      | service ports and adapters        | identity/authorization negatives | Phase 1 evidence         | `DESIGNED`    |
| VOL-VI-6.1-6.5   | Migration, constraints, RLS, least privilege  | ADR-0004, ADR-0011 | `platform` schema               | PostgreSQL repository             | migration/RLS/role tests         | DB validation record     | `DESIGNED`    |
| VOL-VII-7.3/7.4  | Validated `/api/v1` vertical slice            | ADR-0003, ADR-0005 | authorized context read         | `GET /api/v1/platform/context`    | contract, authn/z, error tests   | OpenAPI and CI           | `DESIGNED`    |
| VOL-VII-7.7      | Governed events only for state changes        | ADR-0006, ADR-0011 | no mutation                     | no event in read slice            | no-event assertion               | Explicit N/A evidence    | `DESIGNED`    |
| VOL-VII-7.10     | Correlation, audit, safe tenant observability | ADR-0009, ADR-0011 | audit_logs                      | structured logs and audit adapter | redaction/correlation tests      | Observability evidence   | `DESIGNED`    |
| VOL-VIII-8.3/8.4 | DoD and applicable quality gates              | ADR-0010           | migration/RLS artifacts         | full slice                        | QG-01–QG-08 as applicable        | CI/SBOM/scans            | `IN_PROGRESS` |

QG-18 through QG-22 remain `UNDEFINED_IN_BASELINE` and are not used as invented Phase 1
acceptance criteria.
