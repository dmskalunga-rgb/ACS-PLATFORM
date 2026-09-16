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

The canonical XCF permission keys, role profiles, authority classes, policy identifiers,
cardinality, SoD and physical-human constraints are frozen in
`docs/governance/xcf/ACS-XCF-M1-AUTHORITY-SCOPE-AND-MPA-CATALOG-v1.0.md`. They must be implemented
through the existing `AuthorizationPort` and MPA runtime; they are not permission or approval
engines owned by XCF.
