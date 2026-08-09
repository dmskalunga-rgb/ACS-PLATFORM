# ADR-0011: Trusted identity and tenant-context resolution

Status: `ACCEPTED_ON_PHASE_1_BRANCH`

Decision class: `IMPLEMENTATION_DECISION`

Date: 2026-08-09

## Context and baseline drivers

VOL-I-1.4/1.6, VOL-II-2.1/2.3/2.7, VOL-VI-6.1-6.5, and VOL-VII-7.3/7.4/7.10 require
authentication, authorization, RLS, audit, observability, and tenant isolation. ADR-0004 and
ADR-0007 already establish transaction-local tenant context and an authentication adapter
boundary. A client-supplied tenant identifier cannot establish authorization.

## Alternatives

1. Trust a tenant claim/header and filter in application queries — rejected because it enables
   spoofing and provides no independent membership proof.
2. Give the application owner/service role broad table access — rejected because normal
   requests could bypass RLS.
3. Resolve an authenticated subject and requested tenant through a narrowly granted database
   function, then execute the operation under a tenant application role with FORCE RLS —
   selected.
4. Implement the entire future IAM/RBAC platform — rejected as premature Phase 1 scope.

## Decision

The authentication adapter yields a trusted external subject. The tenant identifier supplied
by a client remains untrusted input. A restricted context-resolver role may execute one
`SECURITY DEFINER` function that returns context only for an active user, active membership,
and active tenant. The function has a fixed search path, no dynamic SQL, no write access, and
is unavailable to `PUBLIC`.

After resolution, the repository starts a transaction, switches to the least-privileged tenant
application role, sets transaction-local `app.tenant_id` and `app.user_id`, and queries FORCE
RLS tables. Authorization is evaluated server-side before the service returns data. Audit
records are append-only to the application role.

A header identity adapter exists only for development and test. Staging/production reject
that mode and report identity as not configured until an approved OIDC adapter exists.

## Security and multi-tenancy implications

- tenant spoofing, BOLA, missing context, inactive membership, and cross-tenant access fail
  closed;
- pooled connections cannot retain context because settings are transaction-local;
- superuser/service-role access is not the normal request model;
- the minimized resolver function is a privileged surface and receives direct negative tests;
- errors do not reveal whether another tenant or membership exists.

## Operational implications

Database provisioning must grant the connection identity permission to assume the resolver
and tenant application roles without making either role login-capable. An approved OIDC
adapter is required before staging or production. Health remains independent of identity
provider availability, while the functional endpoint returns an explicit unavailable state.

## Consequences

The first slice proves the complete security path with a small API surface. Additional
permissions, lifecycle transitions, tenant administration, and enterprise IAM require later
traced decisions and are not implied by this ADR.
