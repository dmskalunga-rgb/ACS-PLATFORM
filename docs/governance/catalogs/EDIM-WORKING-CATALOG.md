# EDIM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-B.

| Producer               | Consumer               | Contract                                                             | Failure policy                                              | State                    |
| ---------------------- | ---------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------ |
| Web shell              | Platform API           | Technical health HTTP                                                | Explicit disconnected state                                 | `IMPLEMENTATION_DEFINED` |
| Platform API           | Telemetry backend      | OTLP/Prometheus/log                                                  | Fail safe                                                   | `IMPLEMENTATION_DEFINED` |
| Future domains         | AI Gateway             | Governed AI boundary                                                 | Fail closed; no direct models                               | `DERIVED_FROM_BASELINE`  |
| Future producers       | Event consumers        | Canonical event envelope                                             | Retry/DLQ/idempotency                                       | `IMPLEMENTATION_DEFINED` |
| Web tenant context     | Platform API           | `GET /api/v1/platform/context`                                       | Explicit unauthenticated, unauthorized, disconnected states | `IMPLEMENTATION_DEFINED` |
| Platform API           | Identity adapter       | Trusted external subject; development bearer only outside production | Fail closed; production `not_configured` without OIDC       | `IMPLEMENTATION_DEFINED` |
| Platform API           | AuthorizationPort      | Membership plus `platform.context.read` permission                   | Generic denial; no tenant existence disclosure              | `IMPLEMENTATION_DEFINED` |
| Context issuer         | PostgreSQL             | Opaque one-use grant bound to backend PID and transaction            | Expire/reject replay and fail closed                        | `IMPLEMENTATION_DEFINED` |
| Tenant context service | PostgreSQL             | Activated grant plus FORCE RLS                                       | Rollback and fail closed                                    | `IMPLEMENTATION_DEFINED` |
| Tenant context service | Audit store            | Append-only access and redacted denial records                       | Request fails if required audit write fails                 | `IMPLEMENTATION_DEFINED` |
| OIDC Provider          | Platform API           | OIDC bearer JWT; configured issuer/audience/JWKS; HTTPS; 2s timeout  | Cached keys, bounded refresh, fail closed, safe metrics     | `IMPLEMENTATION_DEFINED` |
| Domain transaction     | Transactional outbox   | Canonical versioned tenant event in the same transaction             | Atomic rollback; immutable envelope                         | `IMPLEMENTATION_DEFINED` |
| Outbox publisher       | EventTransportPort     | Broker-neutral at-least-once publish                                 | Lease recovery; bounded retry; DLQ; no global ordering      | `IMPLEMENTATION_DEFINED` |
| EventTransportPort     | Future broker adapter  | Transport-neutral event plus acceptance reference                    | Broker remains `NOT_SELECTED`; adapter-specific resilience  | `IMPLEMENTATION_DEFINED` |
| Event consumer         | Consumer receipt store | Tenant/event/consumer idempotency record                             | Atomic acquire/process/complete; duplicate safe result      | `IMPLEMENTATION_DEFINED` |
| Authorized operator    | Replay boundary        | Step-up marker, AuthorizationPort, tenant/event, reason, correlation | Fail closed; bounded replay; append-only audit              | `IMPLEMENTATION_DEFINED` |

OIDC owner, SLA, provider product and confidential endpoint values remain
`PENDING_GOVERNANCE_APPROVAL`. The API never follows token-supplied `jku` or issuer locations.

SLA/SLO, owners, products, and functional integrations need approval per slice.
