# ACS Testing Standard

Status: `IMPLEMENTATION_DEFINED`, pending controlled review

Source: `VOL-VIII-8.3`.

| Layer             | Purpose                             | Phase 0 location         |
| ----------------- | ----------------------------------- | ------------------------ |
| Unit              | Logic and fail-closed behavior      | package-local tests      |
| Integration       | Real adapters/infrastructure        | `tests/integration/`     |
| API               | Routes, schemas, errors, limits     | service-local tests      |
| Contract          | Producer/consumer compatibility     | `tests/contract/`        |
| SQL/RLS/isolation | Constraints and tenant escape       | `database/tests/`        |
| Security          | Abuse, authz, secrets, dependencies | `tests/security/` and CI |
| E2E               | Deployed user journeys              | `tests/e2e/`             |
| Performance       | Versioned workloads/thresholds      | `tests/performance/`     |
| Resilience        | Failure and recovery                | `tests/resilience/`      |

Tests are deterministic and isolated. Applicable tests run on pull requests. E2E, performance,
and resilience become mandatory when a slice defines a real journey, SLO, or dependency.
Skips need an owner, reason, expiry, and gate disposition. Evidence records command, versions,
environment, commit, result, and artifact.
