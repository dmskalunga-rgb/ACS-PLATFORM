# ADR-0012: Opaque transaction-bound tenant grants

Status: `PROPOSED`

Decision class: `SECURITY_IMPLEMENTATION_DECISION`

Date: 2026-08-09

## Context

Plain PostgreSQL custom settings are not proof of authorization: a normal application role can
set them directly. Using only `app.tenant_id` and `app.user_id` therefore permits tenant spoofing
after credential compromise or SQL execution in the application role.

## Alternatives

1. Continue trusting transaction-local tenant/user settings — rejected because they are
   caller-controlled.
2. Use one database role per tenant — rejected for operational scale and connection-pool cost.
3. Sign context in the application — rejected because the database could not validate it without
   receiving shared key material.
4. Persist an opaque, expiring, one-use grant and bind activation to PostgreSQL backend PID and
   transaction ID — selected for the Phase 1 candidate.

## Proposed decision

The execute-only context issuer independently verifies trusted external subject, active user,
active membership, active tenant, and explicit permission. It issues a random UUID grant with a
30-second activation window. The tenant role can activate a grant but cannot issue or inspect one.
Activation is one-use and records `pg_backend_pid()` plus `txid_current()`.

RLS validates the opaque token against the privileged grant table, tenant, user, permission,
backend PID, and transaction ID. Directly setting or changing `app.context_token` cannot create a
matching privileged record. Replay in another transaction fails closed.

## Role model

- migration owner: creates schema/functions and is never used by normal requests;
- `acs_phase1_context_issuer`: execute-only membership, permission, and grant functions;
- `acs_phase1_tenant_app`: activates grants and accesses only RLS-governed tables/audit insert;
- `acs_phase1_security_auditor`: execute-only durable denial recorder.

Deployment creates LOGIN identities and credentials outside Git, assigning each identity to one
NOLOGIN role. Runtime `SET ROLE` is not required or claimed.

## Consequences and residual risk

The design prevents GUC spoofing by the normal tenant credential. Full compromise of the process
holding both issuer and tenant credentials remains capable of requesting authorized grants and
requires secret isolation, rotation, workload hardening, and monitoring. Grant cleanup and
retention require an operational job before production. This ADR remains pending governance
approval and production validation.
