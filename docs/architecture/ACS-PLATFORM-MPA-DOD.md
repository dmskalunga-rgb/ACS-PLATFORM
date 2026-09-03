# ACS Platform — Multi-Person Authorization Definition of Done

**Status:** `APPROVED_AS_FUTURE_ACCEPTANCE_GATE`
**Implementation authorization:** `NOT AUTHORIZED`

An approved MPA implementation is accepted only with objective evidence that:

- every approved lifecycle transition and terminal-state denial is enforced;
- policy authority composition, SoD, distinct technical identities and required
  physical-human confirmation are fail-closed;
- approvals are immutably bound to tenant, operation, target, requester, policy
  version, authority requirements and version/expiry context;
- cross-tenant/operation/target reuse, self approval, wrong authority,
  stale-version use, reject/revoke/expiry use and replay are denied;
- single-use consumption and the protected operation are atomic, and concurrent
  consumption has exactly one governed success;
- RLS/FORCE RLS, least privilege, canonical AuthorizationPort, audit and Event
  Foundation/outbox integration are proved on a disposable database;
- telemetry contains bounded metadata only and contains no token, credential,
  approval secret or sensitive resource content; and
- each approved MPA and consumer acceptance case has reproducible evidence.

## Required future evidence classes

| Evidence class     | Required objective proof                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | State transitions, policy evaluation, authority composition, SoD, binding, expiry, idempotency, expected-version guards and consumption behavior.                                     |
| Integration        | AuthorizationPort, trusted tenant context, audit, outbox, Event Foundation, request/correlation propagation, persistence/RLS where applicable and protected-operation consumers.      |
| Security           | All five positive and eleven negative MPA cases; self-approval, authority, tenant, operation/target binding, terminal-state denial, replay, stale version, concurrency and atomicity. |
| Regression         | Applicable format, lint, typecheck, build, unit, integration, database/RLS, tenant isolation, authorization, shared E2E, bootstrap-authorization regression and security scanning.    |
| Human independence | Where required, external human attestation; tests prove only technical identity distinction, authority-class compliance and self-approval denial.                                     |

No DoD claim may treat distinct technical identities as proof of distinct
physical humans. Existing bootstrap behavior is a required regression surface.

`DOD_UNIT_EVIDENCE = DEFINED`
`DOD_INTEGRATION_EVIDENCE = DEFINED`
`DOD_SECURITY_EVIDENCE = DEFINED`
`DOD_REGRESSION_EVIDENCE = DEFINED`

The MPA positive matrix (`MPA-POS-001` through `005`) and negative/security
matrix (`MPA-NEG-001` through `011`) in the MPA DoR are separate from and do
not change XCAP-005's approved ten positive and twenty-three negative cases.

No bootstrap-only acceptance result is generic MPA evidence without an approved
equivalence mapping. No MPA result is accepted through a client-supplied tenant,
superuser/BYPASSRLS principal, bypassed authorization path or mock identity.

`DOD_APPROVAL_REQUIRED = NO — approved as a future acceptance gate`
`DOD_APPROVED = YES`
`MPA_IMPLEMENTATION = NONE`
