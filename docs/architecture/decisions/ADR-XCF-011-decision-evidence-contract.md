# ADR-XCF-011: DecisionEvidence contract

Status: `APPROVED_WITH_REFINEMENT`

## Context

Operational consumers require a stable proof package for XCF-derived decisions.

## Decision

DecisionEvidence is an XCAP-005-governed evidence projection, not a new custody authority. It
contains opaque references and hashes for inputs, source/mapping/graph versions, policy,
authorization, MPA, model/provider where applicable, outcome and timestamps.

## Refinement

The exact versioned schema and classification/retention binding must be frozen before the first
milestone that persists DecisionEvidence.
