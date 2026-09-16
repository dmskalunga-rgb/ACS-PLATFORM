# ADR-XCF-002: Global and tenant-scoped governance

Status: `APPROVED`

## Context

Framework sources may be globally reusable while tenant overlays, risk interpretations and private
relationships remain tenant-owned.

## Decision

Global records require platform governance authority and never derive from a tenant write.
Tenant-scoped records require server-issued trusted tenant context, AuthorizationPort enforcement,
RLS and FORCE RLS. A tenant may reference an approved global version but cannot mutate or promote it.

## Refinement closure

The exact global custodian roles, tenant-overlay permissions, platform-governance context and MPA
policies are frozen in
`docs/governance/xcf/ACS-XCF-M1-AUTHORITY-SCOPE-AND-MPA-CATALOG-v1.0.md`.

Tenant-overlay runtime belongs to M2. Freezing its catalog before M1 prevents M1 identifiers and
authority boundaries from being incompatible with the later overlay without authorizing M2.
