# EDIM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-B.

| Producer               | Consumer          | Contract                                                             | Failure policy                                              | State                    |
| ---------------------- | ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------ |
| Web shell              | Platform API      | Technical health HTTP                                                | Explicit disconnected state                                 | `IMPLEMENTATION_DEFINED` |
| Platform API           | Telemetry backend | OTLP/Prometheus/log                                                  | Fail safe                                                   | `IMPLEMENTATION_DEFINED` |
| Future domains         | AI Gateway        | Governed AI boundary                                                 | Fail closed; no direct models                               | `DERIVED_FROM_BASELINE`  |
| Future producers       | Event consumers   | Canonical event envelope                                             | Retry/DLQ/idempotency                                       | `IMPLEMENTATION_DEFINED` |
| Web tenant context     | Platform API      | `GET /api/v1/platform/context`                                       | Explicit unauthenticated, unauthorized, disconnected states | `IMPLEMENTATION_DEFINED` |
| Platform API           | Identity adapter  | Trusted external subject; development bearer only outside production | Fail closed; production `not_configured` without OIDC       | `IMPLEMENTATION_DEFINED` |
| Platform API           | AuthorizationPort | Membership plus `platform.context.read` permission                   | Generic denial; no tenant existence disclosure              | `IMPLEMENTATION_DEFINED` |
| Context issuer         | PostgreSQL        | Opaque one-use grant bound to backend PID and transaction            | Expire/reject replay and fail closed                        | `IMPLEMENTATION_DEFINED` |
| Tenant context service | PostgreSQL        | Activated grant plus FORCE RLS                                       | Rollback and fail closed                                    | `IMPLEMENTATION_DEFINED` |
| Tenant context service | Audit store       | Append-only access and redacted denial records                       | Request fails if required audit write fails                 | `IMPLEMENTATION_DEFINED` |

SLA/SLO, owners, products, and functional integrations need approval per slice.
