# EDIM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-B.

| Producer         | Consumer          | Contract                 | Failure policy                | State                    |
| ---------------- | ----------------- | ------------------------ | ----------------------------- | ------------------------ |
| Web shell        | Platform API      | Technical health HTTP    | Explicit disconnected state   | `IMPLEMENTATION_DEFINED` |
| Platform API     | Telemetry backend | OTLP/Prometheus/log      | Fail safe                     | `IMPLEMENTATION_DEFINED` |
| Future domains   | AI Gateway        | Governed AI boundary     | Fail closed; no direct models | `DERIVED_FROM_BASELINE`  |
| Future producers | Event consumers   | Canonical event envelope | Retry/DLQ/idempotency         | `IMPLEMENTATION_DEFINED` |

SLA/SLO, owners, products, and functional integrations need approval per slice.
