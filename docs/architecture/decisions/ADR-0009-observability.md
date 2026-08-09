# ADR-0009: Observability architecture

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-I-1.4`, `VOL-VII-7.10`, `VOL-VIII-8.3`

## Context and alternatives

Vendor-native telemetry can be operationally convenient but increases lock-in. OpenTelemetry
provides vendor-neutral signals; structured logs and Prometheus metrics remain widely portable.

## Decision

Use OpenTelemetry-compatible traces, Prometheus metrics, and structured JSON logs. Every
operation can carry `request_id`, `correlation_id`, `tenant_id`, `user_id`, `service_name`, and
`operation_name`, subject to classification and minimization. Secrets, tokens, payloads, and
sensitive personal data are redacted by default. Health, liveness, readiness, and metrics are
separate technical endpoints.

## Consequences, risks, and validation

High-cardinality tenant/user labels are prohibited in metrics; tenant context may be included
in controlled logs/traces. Tests verify redaction and correlation. Export remains disabled
without an explicit endpoint, preventing accidental data disclosure.
