# ACS AIGCP Requirements v1.0

**Document ID:** `ACS-AIGCP-REQ-001`\
**Status:** `GOVERNANCE_APPROVED_PENDING_PUBLICATION`\
**Scope:** `AIGOV-G0`\
**Implementation:** `NOT_AUTHORIZED`

## 1. Normative baseline

The terms MUST, MUST NOT, SHALL, SHALL NOT, SHOULD, and MAY are
normative. All operational requirements remain future acceptance gates
until separately authorized, implemented, and evidenced.

## 2. Requirements

| ID                | Reconciled requirement                                                                                                                                         | Planned slice         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| ACS-AIGOV-REQ-001 | Every governed AI system SHALL have a stable tenant-bound identity and lifecycle record.                                                                       | M0A                   |
| ACS-AIGOV-REQ-002 | Every governed model and model version SHALL have identity, version, provenance, artifact hash, source/provider identity, and trust state where applicable.    | M0A                   |
| ACS-AIGOV-REQ-003 | Every governed dataset and version SHALL have provenance, classification, permitted-use metadata, residency, and retention policy.                             | M0A/M2                |
| ACS-AIGOV-REQ-004 | Every AI-specific risk SHALL have an accountable human or canonical governance-role owner.                                                                     | M0B                   |
| ACS-AIGOV-REQ-005 | Every assessed AI risk SHALL record inherent and residual scoring, treatment state, evidence, and version.                                                     | M0B                   |
| ACS-AIGOV-REQ-006 | Every security-relevant critical inference SHALL reference canonical evidence without copying sensitive raw evidence into ordinary records or events.          | M4                    |
| ACS-AIGOV-REQ-007 | Every security-relevant critical inference SHALL carry reconstructable provenance, confidence, uncertainty, and explanation.                                   | M4                    |
| ACS-AIGOV-REQ-008 | All tenant-owned AI-governance data SHALL use server-issued trusted tenant context and fail-closed PostgreSQL RLS/FORCE RLS.                                   | M0A onward            |
| ACS-AIGOV-REQ-009 | No AI component SHALL authorize its own protected action or provide privileged execution authority.                                                            | All slices            |
| ACS-AIGOV-REQ-010 | Every protected AI-governance action SHALL traverse the canonical `AuthorizationPort`.                                                                         | M5                    |
| ACS-AIGOV-REQ-011 | Canonical MPA/human authority SHALL be applied where approved policy requires independence, quorum, or dual control.                                           | M5                    |
| ACS-AIGOV-REQ-012 | Every critical prompt SHALL have stable identity, immutable version/hash, classification, change evidence, and governed promotion state.                       | M0A/M2                |
| ACS-AIGOV-REQ-013 | Model changes SHALL trigger policy-defined evaluation and shall not silently become approved or deployable.                                                    | M1                    |
| ACS-AIGOV-REQ-014 | Dataset changes SHALL trigger policy-defined evaluation and shall not silently alter governed inference.                                                       | M1/M2                 |
| ACS-AIGOV-REQ-015 | A reproducible AI-BOM SHALL link AI assets, software SBOM, providers, tools, policies, licenses, and provenance without duplicating the software SBOM.         | M3                    |
| ACS-AIGOV-REQ-016 | Security-relevant AI decisions SHALL be auditable and reconstructable through canonical audit, Event Foundation/outbox, and XCAP-005 evidence references.      | M4                    |
| ACS-AIGOV-REQ-017 | Governed model versions SHALL expose policy-defined monitoring, drift, evaluation, suspension, and reassessment state.                                         | M1/M7                 |
| ACS-AIGOV-REQ-018 | Any governed agent SHALL expose an independently controlled, tenant-aware, auditable kill switch; recovery/reactivation SHALL be separately authorized.        | M5/M6                 |
| ACS-AIGOV-REQ-019 | Cross-tenant inference, RAG, vector retrieval, evidence resolution, and authorization reuse SHALL be prohibited and negatively tested.                         | All applicable slices |
| ACS-AIGOV-REQ-020 | Original forensic evidence SHALL remain immutable under XCAP-005; AI output SHALL be represented as derived evidence or bounded references.                    | M4                    |
| ACS-AIGOV-REQ-021 | XCAP-003 / AI Gateway SHALL remain the sole canonical model/provider execution boundary.                                                                       | All slices            |
| ACS-AIGOV-REQ-022 | AIGCP SHALL publish domain events only through Event Foundation and the transactional outbox.                                                                  | All mutating slices   |
| ACS-AIGOV-REQ-023 | AIGCP SHALL reference XCF framework/release/mapping authority and SHALL NOT implement a parallel framework-mapping authority.                                  | M0B/M8                |
| ACS-AIGOV-REQ-024 | AIGCP risk records SHALL remain AI-specific and aggregatable by a future enterprise GRC authority without duplication.                                         | M0B                   |
| ACS-AIGOV-REQ-025 | Sensitive prompts, raw datasets, model weights, secrets, sensitive outputs, and raw evidence SHALL NOT appear in ordinary audit/event payloads.                | All slices            |
| ACS-AIGOV-REQ-026 | Protected lifecycle transitions SHALL use expected-version concurrency, tenant-scoped idempotency, transactional audit/outbox, and fail-closed error handling. | M0A onward            |
| ACS-AIGOV-REQ-027 | Governance state SHALL remain distinguishable from implementation, qualification, deployment, and production-readiness state.                                  | All slices            |

## 3. Hard invariants

1. AI output is not authorization and is not execution.
2. Missing or invalid tenant context means deny.
3. Authorization uncertainty means deny.
4. No unregistered production model is permitted after the applicable
   runtime policy is implemented.
5. No unversioned critical prompt is permitted.
6. No governed dataset without provenance is permitted.
7. No critical inference without evidence and provenance is permitted.
8. No protected destructive action may bypass AuthorizationPort/MPA.
9. Model, prompt, or dataset change must not be silent.
10. Original forensic evidence is immutable.
11. Critical residual risk cannot be accepted by AI.
12. No parallel tenant, authorization, approval, evidence, event,
    framework-mapping, or model-execution authority may be introduced.

## 4. Slice boundary

Only G0 governance is approved by the current disposition. M0A and every
later slice require separate implementation authorization.
