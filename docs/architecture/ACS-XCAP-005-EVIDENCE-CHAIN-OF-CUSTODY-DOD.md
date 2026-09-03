# ACS-XCAP-005 — Evidence & Chain of Custody Definition of Done

**Status:** `DEFINED_PENDING_GOVERNANCE_APPROVAL`
**Capability:** `ACS-XCAP-005` — Evidence & Chain of Custody
**Implementation authorization:** `NOT AUTHORIZED`

## Purpose and approval gate

The [Definition of Ready](ACS-XCAP-005-EVIDENCE-CHAIN-OF-CUSTODY-DOR.md)
answers whether a governed implementation proposal may begin. This Definition
of Done (DoD) answers whether an approved implementation objectively satisfies
that contract. It is an acceptance artifact, not implementation authorization.

The [Initial Policy and Contract Registry](../governance/cyberdefense/ACS-XCAP-005-EVIDENCE-CHAIN-OF-CUSTODY-INITIAL-POLICY-AND-CONTRACT-REGISTRY.md)
must receive its required human dispositions before its requirements are
accepted as production acceptance criteria.

Sensitive export, retention-override and destruction acceptance additionally
depends on the canonically published platform-wide MPA policy and lifecycle;
the human-governance-approved [MPA DoR](ACS-PLATFORM-MPA-DOR.md) is not yet
implementation evidence.

`DOD_APPROVAL_REQUIRED = YES`
`DOD_APPROVED = NO`
`IMPLEMENTATION_AUTHORIZATION = NOT_GRANTED`

## Mandatory objective evidence

| DoD area                | Required evidence before acceptance                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering quality     | Format, lint, typecheck and build pass for the approved change scope.                                                                                                  |
| Functional correctness  | Unit and integration tests cover the approved evidence, custody, derivation, verification and policy contracts.                                                        |
| Database safety         | Disposable database validation proves migrations, least-privilege principals, RLS and FORCE RLS.                                                                       |
| Tenant isolation        | Positive same-tenant and negative cross-tenant read/write/spoofing tests pass through trusted server context.                                                          |
| Authorization and SoD   | Server-side permission enforcement, elevated export/retention/destruction controls, distinct-actor SoD and required dual/human approvals are evidenced.                |
| Integrity and custody   | Hash-at-ingest, re-verification, tamper detection, immutable raw evidence, append-only custody and derivation provenance are proven.                                   |
| Connector trust         | Registration, tenant binding, lifecycle/revocation, bounded content validation, quarantine and replay controls are proven.                                             |
| Consistency             | Deterministic idempotency, replay/divergence, expected-version concurrency and required transactional atomicity are proven.                                            |
| Governance records      | Audit and transactional outbox coupling are proven; failure injection proves no split evidence/custody/audit/outbox state.                                             |
| Retention and privacy   | Legal hold blocks destruction; retention, override, export, destruction, redaction/safe rendering and content-logging prohibition are proven.                          |
| Acceptance matrices     | Every `XCAP005-POS-*` and `XCAP005-NEG-*` case from the DoR is implemented and linked to reproducible evidence.                                                        |
| Observability           | Bounded metrics/alerts exist without content, secret, token, hash or unbounded-value telemetry.                                                                        |
| Production readiness    | Approved performance/load/soak/chaos, backpressure, recovery, backup/restore, reprocessing, tamper re-verification and rollback evidence is supplied where applicable. |
| Regression and security | Required workspace regression, dependency/SCA, secret scanning and security validation pass without waiver or policy weakening.                                        |

## Acceptance constraints

- No result is accepted from a mock identity, client-supplied tenant authority,
  superuser/BYPASSRLS runtime principal, or bypassed authorization/RLS path.
- No implementation is complete while its required named ownership, policy,
  permission catalog, retention/legal-hold, crypto/canonicalization or selected
  storage/KMS ADR gate remains unapproved.
- Raw evidence, credentials, tokens and sensitive payloads must not appear in
  test fixtures, ordinary events, logs, metrics, reports or acceptance output.
- Matrix evidence must be linked through the XCAP-005 traceability matrix; no
  claimed implementation evidence may be invented before the test exists.

## Closure condition

The capability is done only after the approved DoR, this approved DoD, and all
required traceability-linked evidence are accepted by the applicable governance
authorities. Human runtime acceptance, where the approved design requires it,
is a separate explicit gate.

`DOD_STATUS = NOT_APPROVED`
`CYBERDEFENSE_IMPLEMENTATION = NONE`
