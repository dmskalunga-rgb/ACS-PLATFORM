# ACS Phase 2 — Opportunity Registry Evidence

Status: `LOCAL_VALIDATION_EVIDENCED`

## Scope and boundary

The Opportunity Registry is a tenant-scoped, non-financial commercial registry. It supports only
list, create, detail, explicit-field update, and the frozen lifecycle. It contains no financial
value, currency, forecast, pricing, proposal, contract, subscription, billing, conversion,
reopen, or many-to-many relationship capability.

## Local executable evidence

| Control                                                 | Local evidence                      | Result                                         |
| ------------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| Database migration, rollback/reapply, RLS and FORCE RLS | `pnpm db:validate`                  | `SUCCESS`; `opportunity_registry_rls=VERIFIED` |
| API acceptance                                          | `test:opportunity-registry:e2e`     | 58 pass; 0 fail; 89 filtered/skipped           |
| Mandatory negative security matrix                      | `OPP-NEG-001` through `OPP-NEG-035` | 35/35 pass                                     |
| Same-tenant Customer/Lead/Partner/Plan references       | Opportunity E2E relationship cases  | pass                                           |
| Optimistic concurrency, idempotency and atomicity       | Opportunity E2E                     | pass                                           |
| Audit and event redaction                               | Opportunity E2E                     | pass                                           |
| Web UI/accessibility                                    | `@acs/web` Vitest suite             | 52 pass; 0 fail                                |

The local disposable database authentication was recovered through the repository-defined
Compose environment and session-local test URLs. The initial `28P01` was an
`ENVIRONMENT_VARIABLE_NOT_LOADED` defect: no production configuration, database security
semantics, RLS policy or tracked credential was changed.

The web UI consumes only the real Opportunity API and uses canonical authorization/session
headers. It represents loading, empty, unauthenticated, forbidden, not-found, stale conflict,
and generic error states separately. The browser only exposes frozen legal stage transitions;
the API remains authoritative.

## CI definition and local limitation

`phase-two-opportunity-registry.yml` defines disposable PostgreSQL, database validation,
Opportunity E2E/security, Customer/Lead/Plan/Partner/Phase 1/Event regressions, plus quality,
contracts, web and build. Shared combined-E2E workflows receive the required
`ACS_OPPORTUNITY_DATABASE_URL` test-only variable. No remote CI run is claimed by this document.

## Performance

`BASELINE_MEASUREMENT_NOT_SLO`: the signed OIDC-to-PostgreSQL local path recorded Create +
audit/outbox `31.60 ms`, Detail `9.81 ms`, List `15.58 ms`, Update + audit/outbox `27.43 ms`,
Stage transition `54.84 ms`, and complete journey `141.08 ms`. No production SLO or threshold is
asserted; formal production SLO remains `PENDING_GOVERNANCE_APPROVAL`.

## Open governance

ADR-0017, ADR-0018 and ADR-0019 remain `PROPOSED`. Retention, broker selection, production IdP
registration, named owners/approvers, QG-18–QG-22, baseline custody and ACS-REQ completeness
remain open governance matters.
