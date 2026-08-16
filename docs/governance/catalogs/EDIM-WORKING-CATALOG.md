# EDIM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-B.

| Producer               | Consumer               | Contract                                                             | Failure policy                                              | State                         |
| ---------------------- | ---------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| Web shell              | Platform API           | Technical health HTTP                                                | Explicit disconnected state                                 | `IMPLEMENTATION_DEFINED`      |
| Platform API           | Telemetry backend      | OTLP/Prometheus/log                                                  | Fail safe                                                   | `IMPLEMENTATION_DEFINED`      |
| Future domains         | AI Gateway             | Governed AI boundary                                                 | Fail closed; no direct models                               | `DERIVED_FROM_BASELINE`       |
| Future producers       | Event consumers        | Canonical event envelope                                             | Retry/DLQ/idempotency                                       | `IMPLEMENTATION_DEFINED`      |
| Web tenant context     | Platform API           | `GET /api/v1/platform/context`                                       | Explicit unauthenticated, unauthorized, disconnected states | `IMPLEMENTATION_DEFINED`      |
| Platform API           | Identity adapter       | Trusted external subject; development bearer only outside production | Fail closed; production `not_configured` without OIDC       | `IMPLEMENTATION_DEFINED`      |
| Platform API           | AuthorizationPort      | Membership plus `platform.context.read` permission                   | Generic denial; no tenant existence disclosure              | `IMPLEMENTATION_DEFINED`      |
| Context issuer         | PostgreSQL             | Opaque one-use grant bound to backend PID and transaction            | Expire/reject replay and fail closed                        | `IMPLEMENTATION_DEFINED`      |
| Tenant context service | PostgreSQL             | Activated grant plus FORCE RLS                                       | Rollback and fail closed                                    | `IMPLEMENTATION_DEFINED`      |
| Tenant context service | Audit store            | Append-only access and redacted denial records                       | Request fails if required audit write fails                 | `IMPLEMENTATION_DEFINED`      |
| OIDC Provider          | Platform API           | OIDC bearer JWT; configured issuer/audience/JWKS; HTTPS; 2s timeout  | Cached keys, bounded refresh, fail closed, safe metrics     | `IMPLEMENTATION_DEFINED`      |
| Tenant Administration  | Transactional outbox   | Canonical tenant-scoped event in the same database transaction       | Rollback together; append-only; unpublished rows observable | `IMPLEMENTATION_DEFINED`      |
| Future Commercial API  | AuthorizationPort      | Explicit permission and required assurance for each operation        | Fail closed; ignore client role/permission claims           | `PENDING_GOVERNANCE_APPROVAL` |
| Future Commercial API  | PostgreSQL             | Tenant-scoped relational transaction with RLS and audit              | Rollback and fail closed; retention pending                 | `PENDING_GOVERNANCE_APPROVAL` |
| Future Commercial API  | Transactional outbox   | Versioned event derived from trusted tenant and transaction          | Atomic commit; publication requires separate implementation | `PENDING_GOVERNANCE_APPROVAL` |
| Event publisher        | Future event consumers | Canonical envelope; at-least-once delivery                           | Bounded retry, DLQ, replay authorization, idempotency       | `PENDING_GOVERNANCE_APPROVAL` |

OIDC owner, SLA, provider product and confidential endpoint values remain
`PENDING_GOVERNANCE_APPROVAL`. The API never follows token-supplied `jku` or issuer locations.

The future Commercial and publisher entries are non-normative design candidates. No publisher,
broker, consumer, Phase 2 API, or commercial integration exists. SLA/SLO, owners, products,
contracts, retention, and functional integrations need approval per slice.
