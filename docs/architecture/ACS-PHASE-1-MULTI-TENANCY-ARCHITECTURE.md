# ACS Phase 1 Multi-Tenancy Architecture

Status: `IMPLEMENTATION_DEFINED`

## First vertical slice

The only functional operation in the initial slice is retrieval of the authenticated
principal's current tenant context:

`client → authentication adapter → tenant resolver → authorization → service → PostgreSQL`
`FORCE RLS → audit → structured observability → response`.

The client may request a tenant UUID, but that UUID is never authoritative. The backend
combines it with the trusted authenticated subject and resolves an active membership before
setting database context.

## Canonical model

| Entity        | Justified fields                                                       | Tenant scope            | Lifecycle            |
| ------------- | ---------------------------------------------------------------------- | ----------------------- | -------------------- |
| `tenants`     | UUID, name, slug, status, created/updated timestamps                   | Canonical tenant root   | `ACTIVE`, `INACTIVE` |
| `users`       | UUID, external subject, status, created/updated timestamps             | Global identity mapping | `ACTIVE`, `INACTIVE` |
| `memberships` | UUID, tenant UUID, user UUID, status, created/updated timestamps       | Tenant-owned            | `ACTIVE`, `INACTIVE` |
| `audit_logs`  | UUID, tenant, actor, action, resource, outcome, classification, correlation, bounded auxiliary metadata, timestamp | Tenant-owned | Append-only |

UUID is the canonical identifier. Display name is mutable and never used for authorization.
Slug is a globally unique operator key, not the security boundary. Audit `metadata` is bounded to
2 KiB and may contain auxiliary security context such as producer name. It cannot replace actor,
tenant, action, resource, outcome, classification, or other relational fields and is not indexed
in this slice.

## Lifecycle

Phase 1 implements no lifecycle mutation endpoint. `INACTIVE` is an administrative deny state
used by context resolution. Any future transition requires an actor, authorization rule,
audit event, recovery behavior, API contract, and separate traceability.

## Identity and membership

An authentication adapter returns an immutable external subject. `users` maps that subject to
an internal UUID. `memberships` proves association with a tenant. Full enterprise IAM,
RBAC/ABAC catalogs, invitations, MFA orchestration, and user administration are outside this
slice.

## Authorization boundary

The action is `platform.context.read`. Resolution of active membership is necessary but not
sufficient: the Phase 0 `AuthorizationPort` checks an explicit `membership_permissions` grant.
Frontend state is never an authorization source.

## Database roles and RLS

- `acs_phase1_context_issuer`: NOLOGIN; execute-only membership, authorization, and context grant functions.
- `acs_phase1_tenant_app`: NOLOGIN; least-privileged RLS-governed reads and append-only audit.
- `acs_phase1_security_auditor`: NOLOGIN; execute-only durable denial audit.
- all tenant-owned tables enable and force RLS;
- an opaque one-use grant is bound to backend PID and transaction; a freely set GUC is never proof;
- missing or malformed context fails closed.

## API and errors

`GET /api/v1/platform/context` returns the authorized tenant and principal context. Responses
are schema validated and documented in OpenAPI. Missing authentication returns 401;
unauthorized or cross-tenant selection returns a generic 403; unavailable production identity
configuration returns 503. No response confirms another tenant's existence.

## Audit, events, and observability

Successful context access creates an append-only tenant audit record. Denied attempts create a
separate durable, redacted security audit record because no authorized tenant scope exists.
Request/correlation IDs propagate. Tenant/user identifiers are not metric labels. The slice is
read-only, so no domain event or outbox is created.
