# AIDR-0001: Cognitive Cyber Fusion and AI Core boundary

- Canonical baseline status: Accepted and canonically integrated
- Local closure status: Canonically integrated and verified
- Date: 2026-09-09
- Capability: ACS-XCAP-011 M0

## Canonical authority chain

This artifact is subordinate, in order, to:

1. [ACS Master Engineering Specification — Baseline Enterprise v5.3 — Final Consolidated Engineering Edition](../../baseline/ACS-MASTER-ENGINEERING-SPECIFICATION-BASELINE-ENTERPRISE-v5.3-FINAL-CONSOLIDATED-ENGINEERING-EDITION.txt);
2. [ACS Cyberdefense Functional Evolution Governed Architectural Delta Package v1.0 — Frozen](../../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md);
3. [ACS Cyberdefense Capability Registry](../../governance/cyberdefense/ACS-CYBERDEFENSE-CAPABILITY-REGISTRY.md);
4. the `ACS-XCAP-011` capability record in that registry; and
5. this `ACS-XCAP-011 M0 AIDR-0001` artifact.

This artifact is not an independent source of truth and cannot override an upstream authority.

## Decision

XCAP-003 owns AI/model execution authority and cognitive primitives. XCAP-011 owns only
Fusion-specific orchestration, cross-domain synthesis and derived-intelligence contracts.
XCAP-011 is not AI Core and may not call a model/provider directly. Later model execution must
traverse the canonical AI Gateway with tenant, actor, purpose, classification, correlation,
policy, model capability and audit metadata. M0 performs no inference, embedding, retrieval,
tool execution or provider selection.

Evidence and other untrusted content are data, never prompt hierarchy, tool authority or
authorization. Secrets are excluded by default. Any later AI result must pass schema validation,
provenance, explainability, confidence/uncertainty, policy-version and output-safety controls.
Malformed or unavailable AI output fails closed and never activates tools or response actions.

Provider/model allowlists, numeric thresholds, production prompts, evaluation corpus, token/cost
limits and fallback strategy remain future governed decisions.

At the M0 contract boundary, later model-mediated results must bind the canonical AI Gateway,
allowlisted provider/model identity, model version, reasoning-policy version and output schema.
A missing, mismatched, revoked or untrusted provider/model identity fails closed. Provider/model
compromise cannot grant tool, tenant, authorization or response authority; bounded audit and
observability exclude sensitive content. Provider attestation, credentials and production provider
selection are not introduced by M0.

`PARALLEL_AI_PLATFORM = PROHIBITED`
`DIRECT_PROVIDER_INTEGRATION = PROHIBITED`
`M0_MODEL_EXECUTION = NONE`

For M0 acceptance, AI Gateway unavailability, model unavailability and untrusted provider/model
identity are contract-level boundary tests. They prove bounded denial and absence of direct-provider
fallback; they do not invoke a provider or claim model execution.
