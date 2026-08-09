# ADR-0007: Authentication and authorization boundary

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-I-1.4`, `VOL-II-2.7`, `VOL-III-3.2`, `VOL-V-5.36`, `VOL-VII-7.5`

## Context and alternatives

Supabase Auth can supply standards-based identity, but authentication alone cannot express ACS
tenant, RBAC, ABAC, approval, and audit policy. Embedding policy in endpoints would fragment
control; a central remote decision point alone could create an availability dependency.

## Decision

Treat Supabase Auth or another approved OIDC provider as an authentication adapter. Identity
Service owns identity lifecycle; Authorization Service owns versioned RBAC/ABAC policy and
decisions. Services call a fail-closed authorization port and emit audit records. Tenant context
is independently verified and enforced by RLS. MFA is required by policy for privileged paths.
Phase 0 defines interfaces only and does not implement IAM.

## Consequences, risks, and validation

Policy caching requires short bounds and revocation strategy. Identity claims never bypass
resource authorization. Later slices require threat modelling, decision/audit correlation,
MFA tests, tenant-isolation tests, and fail-closed tests.
