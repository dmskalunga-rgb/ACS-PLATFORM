# Tenant Administration read-first assessment

## Validated starting point

- `develop@f169665e068af3d842f26a21db971f116bf8c48a`
- `develop...origin/develop`: `0/0`
- Working tree: clean
- Local mandatory check: passed before branch creation
- Work branch: `feat/phase-1-tenant-administration`

## Reused authoritative foundation

- Production OIDC/JWT authentication and stable external identity mapping.
- Existing active tenant membership resolution; no JIT membership or role provisioning.
- `AuthorizationPort` and repository authorization adapter.
- One-use, transaction-bound, permission-specific trusted tenant context grants.
- PostgreSQL tenant ownership, RLS, `FORCE ROW LEVEL SECURITY`, least-privilege roles, and durable
  allowed/denied audit stores.
- `/api/v1`, normalized errors, OpenAPI, request/correlation identifiers, structured logging, and
  metrics conventions.
- Canonical event envelope and broker-neutral event standard.

## Gaps authorized for this slice

- Canonical tenant roles, role-permission assignments, and membership-role assignments.
- Governed membership activation/deactivation and authorization assignment/revocation.
- Privileged APIs and a minimal real administrative UI.
- Concurrency, idempotency, self-escalation, cross-tenant, revocation, replay, audit, and event
  evidence for administrative mutations.

## Boundary

The implementation is additive and Phase 1-only. Historical evidence and normative baseline
content are preserved. Governance gaps and `PROPOSED` ADR status remain open unless separately
approved.
