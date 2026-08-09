# ADR-0011: Trusted identity and tenant-context resolution

Status: `PROPOSED`

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

After membership resolution, the accepted Phase 0 `AuthorizationPort` evaluates the requested
action against an explicit membership permission. The resolver then issues the opaque trusted
context grant defined by proposed ADR-0012. A separately credentialed tenant connection activates
that grant in its transaction and queries FORCE RLS tables. Runtime role switching is not used;
deployment login identities inherit exactly one NOLOGIN capability role. Audit records are
append-only to the application role.

A header identity adapter exists only for development and test. Staging/production reject
that mode and report identity as not configured until an approved OIDC adapter exists.

## Security and multi-tenancy implications

- tenant spoofing, BOLA, missing context, inactive membership, and cross-tenant access fail
  closed;
- pooled connections cannot retain or replay context because activation is bound to the backend
  PID and transaction;
- superuser/service-role access is not the normal request model;
- the minimized resolver function is a privileged surface and receives direct negative tests;
- errors do not reveal whether another tenant or membership exists.

## Operational implications

Database provisioning creates external LOGIN identities as members of exactly one repository
NOLOGIN capability role; no credentials are stored in Git. An approved OIDC
adapter is required before staging or production. Health remains independent of identity
provider availability, while the functional endpoint returns an explicit unavailable state.

## Consequences

The first slice proves the complete security path with a small API surface. Additional
permissions, lifecycle transitions, tenant administration, and enterprise IAM require later
traced decisions and are not implied by this ADR.

This proposal does not become approved architecture until the required governance decision.
