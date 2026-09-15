# ADR-XCF-004: PostgreSQL-first graph projection

Status: `APPROVED_WITH_REFINEMENT`

## Context

XCF needs versioned relationships and bounded traversal, but current evidence does not justify a
new graph database.

## Decision

Initial graph projections use relational PostgreSQL structures with explicit node/edge types,
provenance, versions, tenant scope, RLS/FORCE RLS and bounded recursive queries. XCF does not own
producer-domain truth.

## Refinement

A different graph technology requires a separate ADR with measured capacity, tenant-isolation,
backup/restore, security, operational ownership and migration evidence.
