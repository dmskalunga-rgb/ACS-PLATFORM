# Cyberdefense Architecture Readiness Gate

Status: `CANONICAL_FROZEN_GOVERNANCE_BASELINE`
Gate ID: `CYBERDEFENSE_ARCHITECTURE_GATE`

## Decision rule

No `ACS-CYB` capability may enter implementation unless the evidence package for the
specific change passes every condition below. The gate applies to extensions as well as
new bounded components.

| Required condition                                         | Required evidence                                                                                                                                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CANONICAL_CAPABILITY_ID = ASSIGNED`                       | One registry ID and bounded intended outcome.                                                                                                                                                 |
| `NON_SCOPE = DEFINED`                                      | Explicit exclusions, retained canonical owners and prohibited parallel foundations.                                                                                                           |
| `DUPLICATE_CAPABILITY = NO`                                | Comparison with the registry and current ACS domain ownership.                                                                                                                                |
| `ISOLATED_SUBSYSTEM = NO`                                  | Reuse plan for canonical ACS identity, tenant, authorization, event, audit, observability, AI and reporting boundaries.                                                                       |
| `TENANT_BOUNDARY = DEFINED`                                | Tenant-owned/global classification, trusted-context path, isolation tests.                                                                                                                    |
| `TENANT_MODEL = DEFINED`                                   | Canonical ACS tenant and active-membership authority; no client or module-local tenant authority.                                                                                             |
| `SERVER_SIDE_AUTHORIZATION = DEFINED`                      | Explicit server-side permission/policy decision; no client or realm-role authorization.                                                                                                       |
| `RLS_STRATEGY = DEFINED`                                   | Table/function/role strategy, FORCE RLS analysis and negative cross-tenant proof.                                                                                                             |
| `DATA_OWNERSHIP = DEFINED`                                 | Named owner, authoritative source, classification, retention and lifecycle boundary.                                                                                                          |
| `EVENT_CONTRACTS = DEFINED`                                | Versioned produced/consumed events, idempotency and transactional outbox choice.                                                                                                              |
| `AUDIT_CONTRACT = DEFINED`                                 | Append-only audit actor, action, object, outcome and retention boundary.                                                                                                                      |
| `EVIDENCE_MODEL = DEFINED`                                 | Integrity, custody, retention, access, export and deletion semantics.                                                                                                                         |
| `AI_CORE_INTEGRATION = DEFINED`                            | ADR-0008 gateway path, model authority, explainability and deterministic degraded mode.                                                                                                       |
| `CORRELATION_INTEGRATION = DEFINED`                        | Reused correlation inputs/outputs, evidence links and failure behavior.                                                                                                                       |
| `GRAPH_CONTRACT = DEFINED`                                 | Canonical graph authority, entity/relationship ownership, provenance and consumer boundary.                                                                                                   |
| `REPORTING_INTEGRATION = DEFINED`                          | Authorized data product, aggregate/tenant boundary and data lineage.                                                                                                                          |
| `CASE_ORCHESTRATION_CONTRACT = DEFINED`                    | Canonical case owner, state transitions, authorization, audit and execution boundary.                                                                                                         |
| `CONNECTOR_TRUST = DEFINED`                                | Connector identity, tenant binding, credentials, source trust, validation, quarantine, replay protection and revocation.                                                                      |
| `OBSERVABILITY = DEFINED`                                  | Safe telemetry, SLO/alert expectations and no sensitive labels.                                                                                                                               |
| `FAIL_CLOSED_BEHAVIOR = DEFINED`                           | Denial/degraded behavior for authentication, authorization, integrity, dependencies and execution.                                                                                            |
| `THREAT_MODEL_IMPACT = DEFINED`                            | Capability-specific threats, trust boundaries, abuse cases and required mitigations.                                                                                                          |
| `ATOMICITY = DEFINED`                                      | Transaction and failure atomicity for state, audit, evidence and outbox effects where applicable.                                                                                             |
| `TRACEABILITY = DEFINED`                                   | Authority, requirement, design, test, acceptance and production evidence links.                                                                                                               |
| `COMMERCIAL_READINESS_DECISION = DEFINED_WHERE_APPLICABLE` | Explicit reuse or non-applicability for Plan, Subscription, Entitlement, Usage/Metering, Licensing and edition profiles.                                                                      |
| `DOR = APPROVED`                                           | Capability-specific authority, mission, scope, non-scope, owner, data classification, threats, dependencies, contracts and acceptance plan.                                                   |
| `DOD_APPROVAL = DEFINED`                                   | Completion requires an approved DoD and acceptance disposition distinct from DoR, including security, tenant isolation, audit/event, observability, traceability, CI and production evidence. |
| `DEPENDENCY_GRAPH = VALIDATED`                             | Upstream prerequisites satisfied; no unresolved cycle.                                                                                                                                        |
| `NEGATIVE_SECURITY_MATRIX = DEFINED`                       | Denial, isolation, replay/idempotency, integrity and dependency-failure cases.                                                                                                                |
| `PRODUCTION_ACCEPTANCE = DEFINED`                          | Production-readiness evidence, operational ownership and controlled human acceptance plan.                                                                                                    |
| `COGNITIVE_CYBER_FUSION_INTEGRATION = DEFINED`             | Applicable XCAP-011 participation and explicit `NOT_APPLICABLE` justification, if any.                                                                                                        |
| `FUSION_INPUT_CONTRACT = DEFINED`                          | Signals, evidence, entities, correlation keys, provenance and source-trust inputs.                                                                                                            |
| `FUSION_OUTPUT_CONTRACT = DEFINED`                         | Derived contexts/assertions/recommendations, ownership and consumer boundary.                                                                                                                 |
| `FUSION_PROVENANCE = DEFINED`                              | Trace-back to original evidence, tenant, source and authorization provenance.                                                                                                                 |
| `FUSION_CONFIDENCE_MODEL = DEFINED`                        | Confidence inputs, source weighting and uncertainty semantics.                                                                                                                                |
| `FUSION_EXPLAINABILITY = DEFINED`                          | Assertion class, explanation and high-impact human-review boundary.                                                                                                                           |
| `FUSION_TENANT_BOUNDARY = DEFINED`                         | Server-authoritative tenant scope and cross-tenant default denial.                                                                                                                            |
| `FUSION_FAIL_CLOSED_BEHAVIOR = DEFINED`                    | Integrity/dependency degradation and execution denial behavior.                                                                                                                               |

`DOR = APPROVED` incorporates the complete root-governed checklist. The capability DoR
must resolve, where applicable: `AUTHORITY`, `MISSION`, `SCOPE`, `NON_SCOPE`, `OWNERSHIP`,
`DEPENDENCIES`, `DATA_OWNERSHIP`, `TENANT_MODEL`, `IDENTITY`, `AUTHORIZATION`, `RLS`,
`EVENT_CONTRACTS`, `AUDIT_CONTRACT`, `EVIDENCE_CONTRACT`, `FUSION_CONTRACT`,
`CORRELATION_CONTRACT`, `GRAPH_CONTRACT`, `AI_CONTRACT`, `REPORTING_CONTRACT`,
`CASE_ORCHESTRATION_CONTRACT`, `CONNECTOR_TRUST`, `RETENTION`, `FAIL_CLOSED`,
`THREAT_MODEL_IMPACT`, `POSITIVE_ACCEPTANCE`, `NEGATIVE_SECURITY_MATRIX`, `CONCURRENCY`,
`IDEMPOTENCY`, `ATOMICITY`, `OBSERVABILITY`, `TRACEABILITY`, `PRODUCTION_ACCEPTANCE`, and
`COMMERCIAL_READINESS_DECISION`. An existing evidence row may satisfy a checklist item, but
no omitted item is implicitly approved.

## Mandatory acceptance package

The capability proposal must define positive acceptance, negative/security acceptance,
concurrency/idempotency where applicable, RLS/isolation proof, audit/event transaction
proof, observability assertions, integration failure behavior and production readiness.
Missing evidence is a blocking `GAP`.

Lifecycle labels are cumulative and distinct: `IMPLEMENTED` does not imply `INTEGRATED`,
`SECURITY_VERIFIED`, `PRODUCTION_READY`, or `COMMERCIAL_READY`.

## Allowed outcomes

Only one outcome may be recorded for each proposal:

- `CYBERDEFENSE_CAPABILITY_READY_FOR_IMPLEMENTATION`
- `CYBERDEFENSE_CAPABILITY_ARCHITECTURE_BLOCKED`

`READY_FOR_IMPLEMENTATION` is not implementation authorization. Separate change control,
approved governance deltas and explicit implementation authority remain required.

No operational `ACS-CYB` capability may reach `CYBERDEFENSE_CAPABILITY_READY_FOR_IMPLEMENTATION`
without satisfying its applicable Fusion requirements.

## Prohibited shortcuts

The gate rejects parallel identity/tenant/authorization systems, client-authoritative tenant
selection, isolated evidence stores, module-specific AI/reporting platforms, security-impacting
actions without server authorization and audit, and any unapproved direct integration that
bypasses the Event Foundation or established domain ownership.
