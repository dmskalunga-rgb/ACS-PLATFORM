# ACS Observability Standard

Status: `IMPLEMENTATION_DEFINED`, pending controlled review

Source: `VOL-VII-7.10`, ADR-0009.

Services emit JSON logs, Prometheus metrics, and OpenTelemetry traces. Context supports
`request_id`, `correlation_id`, controlled `tenant_id`/`user_id`, `service_name`, and
`operation_name` across synchronous and event boundaries.

Secrets, tokens, bodies, sensitive personal data, and classified payloads are redacted.
Metrics never label by tenant/user/request. Health, liveness, and readiness have distinct
semantics; readiness checks dependencies without disclosure. Metrics require network controls
outside local development. Slices define SLIs/SLOs, alerts, dashboards, and runbooks before
production. Tests verify redaction, correlation, probes, and exporter failure safety.
