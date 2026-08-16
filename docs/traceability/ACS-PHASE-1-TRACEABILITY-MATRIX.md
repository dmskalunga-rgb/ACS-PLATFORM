# ACS Phase 1 Traceability Matrix

Status: `SELECTIVE_ADOPTION_VERIFIED_ON_E3F8D09`

No row creates a normative `ACS-REQ` identifier.

| Baseline         | Requirement                                   | Architecture/ADR   | Data                            | API/implementation                | Test/security validation         | Evidence                                         | Status     |
| ---------------- | --------------------------------------------- | ------------------ | ------------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------------ | ---------- |
| VOL-I-1.4/1.6    | Complete multi-tenant security path           | ADR-0007, ADR-0011 | tenants/users/memberships/audit | current context slice             | unit, API, DB, E2E, cross-tenant | `docs/evidence/phase-1/`                         | `VERIFIED` |
| VOL-II-2.3/2.7   | Canonical tenant and transverse boundaries    | ADR-0011           | tenant UUID and membership      | service ports and adapters        | identity/authorization negatives | Phase 1 evidence                                 | `VERIFIED` |
| VOL-VI-6.1-6.5   | Migration, constraints, RLS, least privilege  | ADR-0004, ADR-0011 | `platform` schema               | PostgreSQL repository             | migration/RLS/role tests         | DB validation record                             | `VERIFIED` |
| VOL-VII-7.3/7.4  | Validated `/api/v1` vertical slice            | ADR-0003, ADR-0005 | authorized context read         | `GET /api/v1/platform/context`    | contract, authn/z, error tests   | OpenAPI and CI                                   | `VERIFIED` |
| VOL-VII-7.7      | Governed events only for state changes        | ADR-0006, ADR-0011 | no mutation                     | no event in read slice            | no-event assertion               | Explicit N/A evidence                            | `DESIGNED` |
| VOL-VII-7.10     | Correlation, audit, safe tenant observability | ADR-0009, ADR-0011 | audit_logs                      | structured logs and audit adapter | redaction/correlation tests      | Observability evidence                           | `VERIFIED` |
| VOL-VIII-8.3/8.4 | DoD and applicable quality gates              | ADR-0010           | migration/RLS artifacts         | full slice                        | QG-01–QG-08 as applicable        | Runs `31584126240`, `31584126302`, `31586095633` | `VERIFIED` |

QG-18 through QG-22 remain `UNDEFINED_IN_BASELINE` and are not used as invented Phase 1
acceptance criteria.

## Production OIDC/JWT vertical slice

| Baseline         | Requirement                               | Architecture       | Implementation                                                     | Validation                                 | Evidence                          | Status                   |
| ---------------- | ----------------------------------------- | ------------------ | ------------------------------------------------------------------ | ------------------------------------------ | --------------------------------- | ------------------------ |
| VOL-I-1.4/1.6    | Production authentication boundary        | ADR-0007, ADR-0013 | OIDC JWT adapter; immutable issuer + subject mapping               | Crypto/JWKS matrix and signed-token DB E2E | `PRODUCTION-OIDC-JWT-EVIDENCE.md` | `IMPLEMENTED_PENDING_CI` |
| VOL-VII-7.4/7.10 | Safe API and authentication observability | ADR-0009, ADR-0013 | Bearer OpenAPI, safe audit/metrics, in-memory web session boundary | API/UI/redaction tests                     | Production OIDC/JWT evidence      | `IMPLEMENTED_PENDING_CI` |

## Tenant administration and authorization lifecycle

| Baseline                       | Requirement                                     | Architecture                           | Data/API                                                               | Runtime validation                                                 | Evidence                            | Status                          |
| ------------------------------ | ----------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------- | ------------------------------- |
| VOL-II-2.3/2.7; VOL-VI-6.1–6.5 | Canonical tenant authorization lifecycle        | ADR-0007, ADR-0011, ADR-0012, ADR-0014 | roles, role_permissions, membership_roles, versioned memberships       | PostgreSQL migration, roles, FORCE RLS and direct cross-tenant SQL | `TENANT-ADMINISTRATION-EVIDENCE.md` | `VERIFIED_AND_INTEGRATED` |
| VOL-VII-7.3/7.4                | Governed `/api/v1` administrative mutations     | ADR-0003, ADR-0005, ADR-0014           | AuthorizationPort, trusted grants, idempotency, optimistic concurrency | signed OIDC/API/PostgreSQL E2E 22/22                               | Tenant administration evidence      | `VERIFIED_AND_INTEGRATED` |
| VOL-VII-7.7/7.10               | Durable audit and justified state-change events | ADR-0006, ADR-0009, ADR-0014           | transactional audit and append-only outbox                             | atomic success/failure and tamper tests                            | Tenant administration evidence      | `VERIFIED_AND_INTEGRATED` |

These rows do not create normative `ACS-REQ` identifiers or assert undefined quality gates.
Their integrated-state evidence is the post-merge run set `31935367613`, `31935367596`, and
`31935367655` on `develop@8b2eb5b705088427479b85cecdca8ee161ce883b`.
