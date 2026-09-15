# ADR-XCF-007: Event, audit and transaction boundary

Status: `APPROVED`

## Context

Governed mutations must not leave split data, audit or integration state.

## Decision

XCF uses the existing Event Foundation and transactional outbox. Canonical audit is distinct from
custody and is written transactionally with governed mutations. Events carry tenant-safe metadata
and opaque references, never raw sensitive evidence by default.

## Consequences

Parallel event/audit systems and success events before commit are prohibited.
