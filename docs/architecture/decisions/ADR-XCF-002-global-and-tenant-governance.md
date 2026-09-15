# ADR-XCF-002: Global and tenant-scoped governance

Status: `APPROVED_WITH_REFINEMENT`

## Context

Framework sources may be globally reusable while tenant overlays, risk interpretations and private
relationships remain tenant-owned.

## Decision

Global records require platform governance authority and never derive from a tenant write.
Tenant-scoped records require server-issued trusted tenant context, AuthorizationPort enforcement,
RLS and FORCE RLS. A tenant may reference an approved global version but cannot mutate or promote it.

## Refinement

Exact global custodian roles and tenant-overlay permissions must be frozen before M1 implementation.
