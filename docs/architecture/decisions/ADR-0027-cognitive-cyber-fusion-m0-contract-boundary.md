# ADR-0027: Cognitive Cyber Fusion M0 contract boundary

- Canonical baseline status: Accepted and canonically integrated
- Local closure status: Content complete, ready for controlled publication, not yet canonically integrated
- Date: 2026-09-09
- Capability: ACS-XCAP-011

## Canonical authority chain

This artifact is subordinate, in order, to:

1. [ACS Master Engineering Specification — Baseline Enterprise v5.3 — Final Consolidated Engineering Edition](../../baseline/ACS-MASTER-ENGINEERING-SPECIFICATION-BASELINE-ENTERPRISE-v5.3-FINAL-CONSOLIDATED-ENGINEERING-EDITION.txt);
2. [ACS Cyberdefense Functional Evolution Governed Architectural Delta Package v1.0 — Frozen](../../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md);
3. [ACS Cyberdefense Capability Registry](../../governance/cyberdefense/ACS-CYBERDEFENSE-CAPABILITY-REGISTRY.md);
4. the `ACS-XCAP-011` capability record in that registry; and
5. this `ACS-XCAP-011 M0 ADR-0027` artifact.

This artifact is not an independent source of truth and cannot override an upstream authority.

## Context

ACS requires cross-domain reasoning without allowing derived intelligence to replace evidence,
domain truth, tenant authority, authorization, AI governance, correlation, graph, audit, or event
foundations. CYB-001 is not yet the canonical asset/entity authority, while M0 is permitted before
CYB-001 solely to freeze contracts and governance.

## Decision

M0 is a contract-validation and bounded-idempotency-receipt boundary. Contract `cyberdefense.fusion.request` with initial
schema version `1.0.0` carries validated tenant-bound typed references and purpose/policy context.
Contract `cyberdefense.fusion.result` with initial schema version `1.0.0` returns classified
assertions, hypotheses, support/contradiction, explanation, gaps, assumptions, uncertainty,
multidimensional confidence and full provenance. References resolve through canonical owners;
XCAP-005 is evidence authority. XCAP-011 owns Fusion orchestration/contracts, not model execution
(XCAP-003/AI Gateway), correlation (XCAP-006), graph authority (XCAP-007), or response
authorization/execution.

Final lifecycle contracts use Event Foundation. Canonical identity, trusted tenant context,
AuthorizationPort, audit, observability, and MPA are reused. Any unsupported required dependency,
untrusted provenance, integrity failure, cross-tenant reference, malformed result, or policy
mismatch fails closed.

## Consequences

- M0 can be implemented and tested without inventing CYB-001 entities or executing a model.
- M0 stores no Fusion content or domain state. The capability-local bounded command receipt owns
  tenant-scoped request-hash binding, row locking, exact replay, divergent reuse rejection,
  concurrency and bounded expiry.
- M0 events are finalized contracts validated at the boundary. Receipt, canonical audit and outbox
  commit atomically; no success audit/event is visible before commit.
- M1 is blocked before CYB-001; M2 and M3 retain their XCAP-006/XCAP-007 dependencies.
- Results are derived intelligence, not producer-domain truth or operational authorization.
- Production thresholds, providers, models, persistence beyond the bounded receipt, and activation
  require later governance.
- No parallel platform or autonomous response path is permitted.
