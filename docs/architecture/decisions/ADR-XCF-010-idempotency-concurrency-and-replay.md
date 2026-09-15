# ADR-XCF-010: Idempotency, concurrency and replay

Status: `APPROVED`

## Context

Imports, mapping changes and downstream commands are retryable and may execute concurrently.

## Decision

Idempotency is scoped by authority, tenant where applicable, operation and canonical input hash.
Exact replay returns the same bounded outcome; divergent reuse conflicts. Expected-version and
transactional locking protect activation, mapping and projection changes.

## Consequences

Duplicate side effects, last-writer-wins authority and cross-tenant keys are prohibited.
