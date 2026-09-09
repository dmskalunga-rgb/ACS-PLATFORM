# SDR-0001: Cognitive Cyber Fusion tenant, authorization and evidence-trust boundary

- Status: Proposed for human governance review
- Date: 2026-09-09
- Capability: ACS-XCAP-011 M0

## Canonical authority chain

This artifact is subordinate, in order, to:

1. [ACS Master Engineering Specification — Baseline Enterprise v5.3 — Final Consolidated Engineering Edition](../../baseline/ACS-MASTER-ENGINEERING-SPECIFICATION-BASELINE-ENTERPRISE-v5.3-FINAL-CONSOLIDATED-ENGINEERING-EDITION.txt);
2. [ACS Cyberdefense Functional Evolution Governed Architectural Delta Package v1.0 — Frozen](../../baseline/ACS_CYBERDEFENSE_FUNCTIONAL_EVOLUTION_GOVERNED_ARCHITECTURAL_DELTA_PACKAGE_v1.0_FROZEN.md);
3. [ACS Cyberdefense Capability Registry](../../governance/cyberdefense/ACS-CYBERDEFENSE-CAPABILITY-REGISTRY.md);
4. the `ACS-XCAP-011` capability record in that registry; and
5. this `ACS-XCAP-011 M0 SDR-0001` artifact.

This artifact is not an independent source of truth and cannot override an upstream authority.

## Threats

Cross-tenant reference injection, inactive/unauthorized actors, evidence/custody bypass, poisoned
telemetry, malicious evidence, prompt injection, false IOC injection, fabricated entity
relationships, hallucinated promotion, model/provider compromise, stale/replayed context, policy
downgrade, provenance tampering, sensitive content leakage, confidence spoofing,
confidence-as-authority, recommendation-as-authorization, and MPA bypass.

## Decision

Fusion uses validated OIDC, ACTIVE membership, server-issued trusted tenant context and
AuthorizationPort. The client cannot establish tenant, membership, permission, evidence integrity,
source trust, or domain authority. Every reference is typed, tenant-bound, authorized and resolved
through its canonical owner. XCAP-005 integrity/provenance state is mandatory for evidence.
Cross-tenant access and inference are denied by default.

Provenance is mandatory, immutable in meaning and version-bound to the result, inputs,
supporting/contradicting references and applicable model/policy versions. Missing, malformed,
detached or mismatched provenance fails closed and never becomes Fusion authority. No new KMS, PKI
or signature system is implied.

Confidence dimensions are system-derived under a bound computation/policy version, never client
authority. Malformed or out-of-contract confidence is rejected; missing values use explicit
`UNKNOWN` only where the contract permits it. Confidence—including operational-decision
confidence—cannot authorize action, bypass AuthorizationPort or bypass MPA.

Untrusted inputs are isolated as data. Results are accepted only after strict schema, provenance,
policy, confidence and explanation validation. Raw evidence, prompts, credentials, secrets and
unrestricted outputs are prohibited from ordinary events, logs, traces and metrics. Failures expose
bounded codes only.

Fusion can recommend investigation or response candidates but cannot authorize or execute them,
bypass AuthorizationPort, or bypass canonical MPA. The same human/actor cannot satisfy incompatible
operational authority classes where the protected operation requires separation.

## Verification obligations

The positive, negative/security and failure-injection matrices are mandatory. Future persistence,
if authorized, must use least privilege and tenant RLS/FORCE RLS. Security controls may not be
relaxed by fallback, dependency degradation or emergency paths.
