# ADR-XCF-001: Canonical cross-framework control plane

Status: `APPROVED`

## Context

ACS requires one governed interpretation layer across external security frameworks without creating
new identity, tenant, authorization, evidence, event, audit or AI authorities.

## Decision

`ACS-XCF-CP-001` is the canonical governance boundary for cross-framework source registration,
versioning, mappings, graph projections and derived decision support. Domain systems retain source
truth. XCF outputs are derived and non-authoritative until consumed by an independently authorized
domain operation.

## Consequences

Parallel control planes are prohibited. Runtime work requires a separate milestone authorization
and the acceptance gates in the XCF governance package.
