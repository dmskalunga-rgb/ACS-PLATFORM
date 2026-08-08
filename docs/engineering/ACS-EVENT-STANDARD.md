# ACS Event Standard

Status: `IMPLEMENTATION_DEFINED`, pending controlled review

Source: `VOL-VII-7.7`, ADR-0006.

The envelope contains `event_id`, `event_type`, `schema_version`, `tenant_id`, `timestamp`,
`correlation_id`, `causation_id`, `producer`, `classification`, and `payload`. IDs are UUIDs,
timestamps UTC RFC 3339, types stable, schemas versioned, payloads minimized.

Delivery is at-least-once. Consumers deduplicate; retries use bounded exponential backoff with
jitter; exhaustion enters a classified DLQ with alerting. Replay requires authorization,
tenant scope, rate limit, compatibility, and audit. Each event needs ECOM ownership, EDIM
entries, compatibility tests, retention, failure policy, observability, and evidence.
