# ADR-XCF-006: Evidence custody and DecisionEvidence

Status: `APPROVED`

## Context

XCF decisions must remain reproducible and traceable without copying raw evidence.

## Decision

XCF references the canonical XCAP-005 evidence identity, integrity, provenance and custody
contracts. DecisionEvidence binds source versions, mapping versions, graph projection versions,
authorization/MPA decisions, policy versions and derived outputs. Raw evidence remains immutable.

## Consequences

Detached, tampered or unresolved evidence fails closed. A parallel evidence store is prohibited.
