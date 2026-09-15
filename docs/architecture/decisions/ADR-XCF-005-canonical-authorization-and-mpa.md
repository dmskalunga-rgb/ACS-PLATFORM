# ADR-XCF-005: Canonical AuthorizationPort and MPA reuse

Status: `APPROVED`

## Context

XCF includes sensitive source activation, mapping governance, export and response boundaries.

## Decision

All authorization uses the existing server-side AuthorizationPort. Sensitive operations use the
canonical platform MPA runtime where their policy requires independent approval. XCF must not
implement a parallel permission or approval engine.

## Consequences

Confidence, AI output, tenant input and framework mappings never grant authority.
