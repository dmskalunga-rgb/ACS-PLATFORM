# ACS AIGCP Architecture Decision Register v1.0

**Document ID:** `ACS-AIGCP-ADR-REGISTER-001`\
**Status:** `GOVERNANCE_APPROVED_PENDING_PUBLICATION`\
**Scope:** architecture-decision disposition for AIGOV-G0

## 1. Decision register

| Decision                                  | Disposition                       | Binding resolution                                                                                                                                         |
| ----------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-AI-001 AI Governance Control Plane    | APPROVED_WITH_RECONCILIATION      | AIGCP governs AI-specific inventory, risk, lifecycle metadata, and policy inputs; it is not a competing ACS platform.                                      |
| ADR-AI-002 AI Risk Scoring                | APPROVED_FOR_AI_RISK_ONLY         | Scoring belongs to AI-specific risk governance and must remain interoperable with future enterprise GRC. Numeric thresholds require later policy approval. |
| ADR-AI-003 AI Model Registry              | APPROVED_AS_FUTURE_SLICE          | Registry governs identity and lifecycle metadata; XCAP-003/AI Gateway owns execution.                                                                      |
| ADR-AI-004 AI-BOM                         | APPROVED_AS_FUTURE_SLICE          | AI-BOM complements, references, and does not duplicate SBOM/SCA.                                                                                           |
| ADR-AI-005 Dataset Governance             | APPROVED_AS_FUTURE_SLICE          | Metadata/provenance governance only; storage and training execution require separate authority.                                                            |
| ADR-AI-006 Prompt Governance              | APPROVED_AS_FUTURE_SLICE          | Critical prompts require immutable versions, classification, testing, and promotion evidence.                                                              |
| ADR-AI-007 AI Decision Envelope           | APPROVED_WITH_REUSE               | Define a profile/extension of XCAP-011 decision, confidence, uncertainty, evidence, and provenance contracts.                                              |
| ADR-AI-008 Human Authorization Boundary   | SATISFIED_BY_CANONICAL_AUTHORITY  | Reuse AuthorizationPort and MPA; no AI self-authorization or parallel service.                                                                             |
| ADR-AI-009 AI Tenant Isolation            | SATISFIED_BY_CANONICAL_FOUNDATION | Reuse trusted tenant context and PostgreSQL RLS/FORCE RLS; extend tests to AIGCP entities.                                                                 |
| ADR-AI-010 Model Evaluation and Promotion | APPROVED_AS_FUTURE_SLICE          | Evaluation and governance state do not execute or deploy models directly.                                                                                  |
| ADR-AI-011 AI Evidence and Provenance     | APPROVED_WITH_REUSE               | XCAP-005 remains evidence/custody authority; AIGCP uses typed links and governed derivations.                                                              |
| ADR-AI-012 Agent Kill Switch              | APPROVED_AS_GOVERNANCE_SEMANTICS  | Independent, tenant-aware, authorization-governed suspension; separately authorized reactivation. No runtime is approved.                                  |

## 2. Related accepted authority

These decisions are subordinate to and must remain compatible with:

- `ADR-0007` identity and authorization;
- `ADR-0011` trusted tenant context;
- `ADR-XCF-005` canonical authorization and MPA;
- `ADR-XCF-007` event/audit/transaction boundary;
- `ADR-XCF-008` AI Gateway and derived intelligence;
- `ADR-XCF-009` mapping authority;
- `ADR-XCF-011` DecisionEvidence projection;
- `ADR-0027` cognitive fusion M0 contract boundary;
- `AIDR-0001` cognitive fusion AI core boundary; and
- `SDR-0001` cognitive fusion security boundary.

## 3. Explicit non-decisions

G0 does not decide or authorize:

- provider selection;
- real model execution;
- model weights or storage technology;
- vector database or RAG architecture;
- agent runtime;
- XCF-M2 implementation;
- exact MPA quorum/expiry/independence values;
- production retention/capacity/SLO values; or
- production activation.

These remain governed future decisions.
