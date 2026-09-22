# ACS AI RISK REGISTER & AI GOVERNANCE CONTROL PLANE v1.0

**Document ID:** `ACS-AI-GOV-001`\
**Version:** `1.0`\
**Status:** `GOVERNANCE_BASELINE_APPROVED_PENDING_PUBLICATION`\
**Target:** `ACS — Angola Cyber Shield`\
**Integration:** `ACS Cross-Framework Cyber Defense Control Plane`\
**Architecture:** Multi-tenant / Hybrid Cloud + On-Prem / Zero-Trust\
**Database:** PostgreSQL 17 + RLS\
**Decision Authority:** Human Governance\
**AI Authority:** Advisory by default\
**Baseline Date:** 2026-09-21

**Human Governance Disposition:** `AIGOV-G0_APPROVED`\
**Runtime Implementation:** `NOT_AUTHORIZED`\
**Production Readiness:** `NOT_CLAIMED`

---

## Governance Reconciliation Notice

Human governance approved this document as the basis for the ACS AI
governance baseline, subject to the binding G0 reconciliations recorded
in the companion governance package in this directory.

Those reconciliations take precedence wherever a literal structure in
this document would duplicate or conflict with an established ACS
authority. In particular:

- AIGCP owns AI-specific risk governance, not generic enterprise GRC;
- XCAP-003 / AI Gateway remains the model/provider execution boundary;
- policy evaluation feeds the canonical `AuthorizationPort` and does
  not create a parallel authorization service;
- protected AI-governance operations reuse canonical MPA/human
  authority;
- Event Foundation and the transactional outbox remain the only event
  publication authority;
- XCF remains the framework and framework-mapping authority;
- XCAP-005 remains the evidence, provenance, integrity, and custody
  authority;
- XCAP-011 contracts are the starting point for the future AI Decision
  Envelope profile; and
- governance approval is not runtime implementation, qualification, or
  production readiness.

The controlling companion documents are:

- `ACS-AIGCP-G0-GOVERNANCE-CLOSURE-v1.0.md`;
- `ACS-AIGCP-REQUIREMENTS-v1.0.md`;
- `ACS-AIGCP-RTM-v1.0.md`;
- `ACS-AIGCP-POLICY-AND-AUTHORITY-REGISTRY-v1.0.md`;
- `ACS-AIGCP-ARCHITECTURE-DECISION-REGISTER-v1.0.md`;
- `ACS-AIGCP-THREAT-MODEL-v1.0.md`; and
- `ACS-AIGCP-ACCEPTANCE-MATRIX-v1.0.md`.

---

## 0. Purpose and Normative Language

This document establishes the canonical governance and engineering
baseline for AI risk management in ACS. The keywords **MUST**, **MUST
NOT**, **SHALL**, **SHALL NOT**, **SHOULD**, and **MAY** are normative.

The AI Governance Control Plane (AIGCP) is a transversal capability
integrated with the ACS Cross-Framework Cyber Defense Control Plane. It
governs AI systems, models, datasets, prompts, AI-BOM components,
evaluations, deployments, risks, controls, evidence, provenance,
authorization boundaries, and lifecycle decisions.

### Fundamental invariant

```text
AI OUTPUT != AUTHORIZATION != EXECUTION
```

No model, LLM, ML engine, Cognitive Core, agent, RAG component,
predictive engine, or AI-assisted workflow implicitly grants itself
authority to execute a protected ACS operation.

---

## 1. Product Constitution

The AIGCP SHALL govern:

```text
ACS
├── Predictive AI
├── Generative AI
├── ML / DL
├── NLP
├── UEBA
├── Fusion Engine
├── Cognitive AI Core
├── RAG
├── Embeddings / Vector Retrieval
├── AI Agents
├── AI-assisted SOAR
├── Threat Intelligence AI
├── Attack Graph Intelligence
├── Predictive Defense
└── Context Engineering
        │
        ▼
ACS AI GOVERNANCE CONTROL PLANE
```

Mandatory decision path:

```text
OBSERVE
  ↓
ANALYZE
  ↓
AI INFERENCE
  ↓
EVIDENCE + PROVENANCE
  ↓
CONFIDENCE + UNCERTAINTY
  ↓
EXPLANATION
  ↓
RECOMMENDATION
  ↓
POLICY ENGINE
  ↓
AuthorizationPort
  ↓
MPA / HUMAN AUTHORITY (when required)
  ↓
EXECUTION
  ↓
AUDIT + EVIDENCE + LEARNING
```

---

## 2. AI Risk Taxonomy

Code Risk family

---

AIR-T01 Model Reliability & Accuracy
AIR-T02 AI/ML Security
AIR-T03 Data & Dataset Risk
AIR-T04 GenAI / LLM Security
AIR-T05 Agentic & Autonomous Risk
AIR-T06 Privacy & Confidentiality
AIR-T07 Multi-Tenant Isolation
AIR-T08 Explainability & Human Oversight
AIR-T09 AI Supply Chain
AIR-T10 Operational & Resilience Risk
AIR-T11 Evidence / Forensics / Provenance
AIR-T12 Governance / Compliance / Lifecycle

Each risk SHALL have one primary category and MAY have secondary
categories.

---

## 3. Initial Canonical AI Risk Register

---

ID Primary risk Initial severity Principal treatment

---

ACS-AIR-001 Hallucination Critical Grounding, provenance,
corroboration, HITL

ACS-AIR-002 Incorrect containment Critical Authorization
recommendation boundary, MPA,
rollback

ACS-AIR-003 False positives High Calibration,
correlation, SOC
feedback

ACS-AIR-004 False negatives Critical Defense-in-depth,
deterministic + ML
detection

ACS-AIR-005 Cross-tenant AI data Critical RLS, ABAC/RBAC,
leakage isolation tests

ACS-AIR-006 Cross-tenant RAG Critical Tenant-scoped
retrieval retrieval and
namespaces

ACS-AIR-007 Prompt injection Critical Input isolation,
policy/tool controls

ACS-AIR-008 Indirect prompt Critical Untrusted-content
injection isolation and
provenance

ACS-AIR-009 Excessive agency Critical Least privilege,
deny-by-default, HITL

ACS-AIR-010 Unsafe autonomous SOAR Critical Approval gates,
action dry-run, rollback

ACS-AIR-011 Model poisoning Critical Provenance, signing,
validation

ACS-AIR-012 Data poisoning Critical Integrity/quality
gates, anomaly
detection

ACS-AIR-013 Adversarial ML / High Ensemble detection,
evasion adversarial testing

ACS-AIR-014 UEBA bias High Contextual baselines,
explainability, review

ACS-AIR-015 Unexplainable High Mandatory
recommendation explanation/evidence
object

ACS-AIR-016 Miscalibrated Critical Calibration,
confidence uncertainty,
corroboration

ACS-AIR-017 Human automation bias High HITL, approval
rationale, training

ACS-AIR-018 Knowledge Graph High Provenance,
corruption validation, temporal
validity

ACS-AIR-019 Malicious or stale CTI High Reputation, freshness,
corroboration

ACS-AIR-020 Framework mapping High Versioned validated
error mapping catalog

ACS-AIR-021 Model drift High Drift monitoring,
benchmark, rollback

ACS-AIR-022 Poor data quality High Quality SLOs, lineage,
schema validation

ACS-AIR-023 PII/sensitive-data Critical Minimization, masking,
disclosure classification

ACS-AIR-024 Secret/credential Critical Secret detection,
leakage redaction, vault/DLP

ACS-AIR-025 AI supply-chain Critical AI-BOM/SBOM,
compromise signatures, scanning

ACS-AIR-026 Model/provider outage High Fallback, circuit
breaker, degradation

ACS-AIR-027 Missing AI decision Critical Immutable audit and
auditability decision
reconstruction

ACS-AIR-028 AI alteration of Critical Immutable originals,
forensic evidence derived-artifact
separation

ACS-AIR-029 Inference presented as Critical Fact/inference
forensic fact separation, analyst
validation

ACS-AIR-030 Incorrect threat High Evidence thresholds,
attribution multi-source
validation

ACS-AIR-031 Digital Twin fidelity High Fidelity metrics and
failure validation

ACS-AIR-032 Prediction interpreted High Probabilistic output
as certainty and uncertainty

ACS-AIR-033 Unbounded AI resource High Quotas, budgets, rate
consumption limiting

ACS-AIR-034 Model extraction High Abuse detection and
output/rate controls

ACS-AIR-035 Unauthorized model Critical Registry, governance
deployment gate

ACS-AIR-036 Unvalidated Critical Change control and
model/prompt/dataset regression
change

ACS-AIR-037 Tenant-context Critical Context invariant,
propagation failure fail-closed tests

ACS-AIR-038 Malicious feedback High Trust weighting and
poisoning validation

ACS-AIR-039 Autonomous-response Critical Blast-radius analysis,
blast radius MPA, kill switch

ACS-AIR-040 Multi-agent/model Critical Independent
systemic failure validation, circuit
breakers
---------------------------------------------------------------------------------

---

## 4. Risk Scoring Model

Dimensions:

```text
Likelihood       L = 1..5
Impact           I = 1..5
Exposure         E = 1..5
Detectability    D = 1..5
AI Autonomy      A = 1..5
Blast Radius     B = 1..5
Control Strength C = 0..1
```

Canonical formulas:

```text
IR = L × I × ((E + D + A + B) / 4)
RR = IR × (1 - C)
```

Bands:

       Score Rating

---

       0--20 LOW
      21--45 MODERATE
      46--75 HIGH
     76--100 VERY_HIGH
    101--125 CRITICAL

Risk scores inform governance; they SHALL NOT automatically accept a
risk. Critical residual risk requires explicit human governance
disposition.

---

## 5. Canonical Data Model --- PostgreSQL 17

Canonical schema:

```sql
CREATE SCHEMA IF NOT EXISTS ai_governance;
```

Core entities:

```text
ai_governance.ai_systems
ai_governance.models
ai_governance.model_versions
ai_governance.datasets
ai_governance.dataset_versions
ai_governance.prompts
ai_governance.prompt_versions
ai_governance.ai_bom_components
ai_governance.risks
ai_governance.risk_assessments
ai_governance.risk_controls
ai_governance.risk_treatments
ai_governance.risk_acceptances
ai_governance.evaluations
ai_governance.deployments
ai_governance.ai_observations
ai_governance.evidence_links
ai_governance.framework_applicability_overlays
```

`ai_observations` are bounded domain state records, not an event bus.
Their publication SHALL use Event Foundation and the transactional
outbox. `framework_applicability_overlays` SHALL reference canonical XCF
framework, release, and mapping identities and SHALL NOT become a
parallel framework-mapping authority.

Central risk entity baseline:

```sql
CREATE TABLE ai_governance.risks (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    risk_code varchar(32) NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    primary_category varchar(64) NOT NULL,

    ai_system_id uuid,
    model_id uuid,
    dataset_id uuid,
    prompt_id uuid,

    likelihood smallint NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
    impact smallint NOT NULL CHECK (impact BETWEEN 1 AND 5),
    exposure smallint NOT NULL CHECK (exposure BETWEEN 1 AND 5),
    detectability smallint NOT NULL CHECK (detectability BETWEEN 1 AND 5),
    autonomy smallint NOT NULL CHECK (autonomy BETWEEN 1 AND 5),
    blast_radius smallint NOT NULL CHECK (blast_radius BETWEEN 1 AND 5),

    inherent_score numeric(8,2) NOT NULL,
    residual_score numeric(8,2),

    treatment_status varchar(32) NOT NULL,
    owner_id uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, risk_code)
);
```

Application services MUST validate referential integrity against the
existing ACS canonical identity, tenant, authorization, and evidence
models rather than creating duplicate authorities.

---

## 6. PostgreSQL RLS and Tenant Isolation

Every tenant-owned AIGCP relation MUST enable and force RLS.

```sql
ALTER TABLE ai_governance.risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_governance.risks FORCE ROW LEVEL SECURITY;
```

Canonical trust path:

```text
Authenticated identity
       ↓
Trusted tenant resolution
       ↓
Transaction-bound tenant context
       ↓
PostgreSQL RLS
       ↓
Authorized tenant rows only
```

Client-supplied `tenant_id` SHALL NOT establish authority. Missing,
malformed, stale, or contradictory tenant context MUST fail closed.

Required negative tests include cross-tenant read, insert, update,
delete, RAG retrieval, vector search, model context, evidence linkage,
and framework mapping access.

---

## 7. AI Model Registry

Every governed model/version SHALL record at least:

```text
model_id
name
provider
model_family
model_type
version
weights_digest
artifact_digest
license
deployment_mode
hosting_location
approved_use_cases[]
prohibited_use_cases[]
input_classification
output_classification
training_provenance
evaluation_profile
risk_tier
owner
approval_status
approved_by
approved_at
retired_at
```

Lifecycle:

```text
DISCOVERED
→ REGISTERED
→ EVALUATING
→ APPROVED
→ DEPLOYABLE
→ DEPLOYED
→ MONITORED
→ SUSPENDED
→ RETIRED
```

`UNREGISTERED_MODEL → PRODUCTION` is prohibited.

---

## 8. AI-BOM

The ACS AI Bill of Materials SHALL trace:

```text
AI System
├── Models and versions
├── Weights/artifacts and hashes
├── Tokenizers
├── Embedding models
├── Rerankers
├── Datasets and versions
├── Fine-tuning datasets
├── Vector databases
├── Prompt templates/system prompts
├── Agent definitions
├── Tools and connectors
├── Guardrails
├── Libraries
├── Runtime dependencies
├── External APIs/providers
└── Licenses and provenance
```

AI-BOM complements, but does not replace, the software SBOM.

---

## 9. Dataset Governance

No dataset SHALL enter training, fine-tuning, evaluation, RAG, or
governed inference without registration and policy evaluation.

Mandatory metadata:

```text
dataset_id
version
sha256
source
provenance
classification
tenant_scope
retention_policy
allowed_purposes[]
prohibited_purposes[]
quality_score
privacy_review
security_review
approval
```

Lifecycle:

```text
INGEST
→ PROVENANCE
→ CLASSIFICATION
→ OWNERSHIP/LICENSE
→ TENANT SCOPE
→ INTEGRITY
→ QUALITY
→ POISONING ASSESSMENT
→ PRIVACY/SECURITY REVIEW
→ APPROVAL
→ PERMITTED USE
```

---

## 10. Prompt Governance

Critical prompts SHALL be governed configuration artifacts.

Required fields:

```text
prompt_id
prompt_version
purpose
content_hash
model_compatibility
allowed_tools[]
prohibited_tools[]
risk_class
owner
change_reason
test_evidence
approval
deployment
rollback_version
```

Critical prompt change path:

```text
CHANGE
→ DIFF
→ SECURITY TEST
→ PROMPT-INJECTION TEST
→ REGRESSION
→ RISK REASSESSMENT
→ APPROVAL
→ DEPLOY
→ OBSERVE
```

---

## 11. Cross-Framework Mapping

AIGCP SHALL normalize mappings rather than duplicate external
frameworks:

```text
AI Risk
├── NIST AI RMF
├── ISO/IEC 42001
├── ISO/IEC 23894
├── OWASP GenAI / LLM
├── MITRE ATLAS
├── NIST CSF
├── NIST SP 800-53
├── CISA
├── MITRE ATT&CK / D3FEND
└── ACS Controls
```

NIST AI RMF functions used by the governance model:

```text
GOVERN
MAP
MEASURE
MANAGE
```

All external mapping identifiers MUST be version-aware and validated
against an approved catalog. The implementation MUST NOT fabricate
framework identifiers.

Example mapping object:

```json
{
  "riskId": "ACS-AIR-007",
  "mappings": [
    {
      "framework": "OWASP_LLM",
      "reference": "LLM01:2025"
    },
    {
      "framework": "NIST_AI_RMF",
      "function": "MEASURE"
    },
    {
      "framework": "MITRE_ATLAS",
      "reference": "<validated-technique-id>"
    }
  ]
}
```

---

## 12. AI Decision Envelope

Every security-relevant AI inference SHALL produce a reconstructable
decision envelope.

```json
{
  "decisionId": "uuid",
  "tenantId": "uuid",
  "model": {
    "id": "uuid",
    "version": "..."
  },
  "hypothesis": "...",
  "confidence": 0.87,
  "uncertainty": 0.13,
  "explanation": {},
  "evidenceRefs": [],
  "provenance": {},
  "recommendedActions": [],
  "authorization": {
    "required": true,
    "authority": "AuthorizationPort"
  }
}
```

An action-only output such as `{"action":"BLOCK_IP"}` is insufficient as
a governed decision record.

---

## 13. Authorization Boundary and Agentic Control

Protected actions MUST follow:

```text
AI
→ Recommendation
→ Policy Evaluation
→ AuthorizationPort
→ MPA / Human Approval when required
→ Execution Adapter
→ Target
→ Evidence / Audit
```

A kill switch SHALL exist for agentic/autonomous capabilities. The AI
subsystem SHALL NOT approve its own privileged elevation, risk
acceptance, reactivation after governance suspension, or bypass of a
human/MPA gate.

---

## 14. API Contracts

Canonical base:

```text
/api/v1/ai-governance
```

Initial contract surface:

```text
GET    /risks
POST   /risks
GET    /risks/:id
PATCH  /risks/:id
POST   /risks/:id/assessments
POST   /risks/:id/treatments
POST   /risks/:id/acceptance

GET    /models
POST   /models
GET    /models/:id
POST   /models/:id/versions
POST   /models/:id/evaluations

GET    /datasets
POST   /datasets

GET    /prompts
POST   /prompts
POST   /prompts/:id/versions

GET    /ai-bom
GET    /framework-applicability-overlays
GET    /metrics
GET    /dashboard
```

All contracts SHALL use the ACS canonical authentication, authorization,
request-ID, error-envelope, validation, audit, and observability
conventions.

### Optimistic concurrency

Governed mutations MUST protect against stale writes.

```http
PATCH /api/v1/ai-governance/risks/{id}
If-Match: "17"
```

Stale version:

```http
HTTP/1.1 409 Conflict
```

```json
{
  "error": {
    "code": "STALE_AI_RISK_VERSION",
    "requestId": "...",
    "currentVersion": 18
  }
}
```

Silent overwrite is prohibited.

---

## 15. RTM Delta

Namespace: `ACS-AIGOV-REQ-*`

---

ID Requirement

---

ACS-AIGOV-REQ-001 Every governed AI system SHALL be
registered

ACS-AIGOV-REQ-002 Every model SHALL have identity,
version, and provenance

ACS-AIGOV-REQ-003 Every governed dataset SHALL have
provenance

ACS-AIGOV-REQ-004 Every risk SHALL have an
accountable owner

ACS-AIGOV-REQ-005 Every assessed risk SHALL have
inherent and residual scoring

ACS-AIGOV-REQ-006 Every critical inference SHALL
reference evidence

ACS-AIGOV-REQ-007 Every critical inference SHALL
carry provenance

ACS-AIGOV-REQ-008 Tenant isolation SHALL fail closed

ACS-AIGOV-REQ-009 AI SHALL NOT authorize its own
protected action

ACS-AIGOV-REQ-010 Protected actions SHALL traverse
AuthorizationPort

ACS-AIGOV-REQ-011 MPA SHALL be enforced according to
policy

ACS-AIGOV-REQ-012 Critical prompts SHALL be versioned

ACS-AIGOV-REQ-013 Model changes SHALL trigger
governed evaluation

ACS-AIGOV-REQ-014 Dataset changes SHALL trigger
governed evaluation

ACS-AIGOV-REQ-015 AI-BOM SHALL be reproducibly
generated

ACS-AIGOV-REQ-016 AI decisions SHALL be
auditable/reconstructable

ACS-AIGOV-REQ-017 Model drift SHALL be monitored

ACS-AIGOV-REQ-018 Governed agents SHALL expose an
enforceable kill switch

ACS-AIGOV-REQ-019 Cross-tenant inference/retrieval
SHALL be prohibited

ACS-AIGOV-REQ-020 Original forensic evidence SHALL
remain immutable
-----------------------------------------------------------------------

Traceability chain:

```text
Requirement
→ Design
→ Implementation
→ Test
→ Evidence
→ Acceptance
```

---

## 16. ADR Delta

ADR Decision

---

ADR-AI-001 AI Governance Control Plane
ADR-AI-002 AI Risk Scoring Model
ADR-AI-003 AI Model Registry
ADR-AI-004 AI-BOM
ADR-AI-005 Dataset Governance
ADR-AI-006 Prompt Governance
ADR-AI-007 AI Decision Envelope
ADR-AI-008 Human Authorization Boundary
ADR-AI-009 AI Tenant Isolation
ADR-AI-010 Model Evaluation & Promotion
ADR-AI-011 AI Evidence & Provenance
ADR-AI-012 Agent Kill Switch

### ADR-AI-008 --- Human Authorization Boundary

**Decision:** No AI component SHALL possess implicit authority to
execute a protected operational action.

```text
AI → Recommendation
AI ↛ Authorization
AI ↛ Privileged Execution
```

---

## 17. Threat Model Delta

New trust boundaries:

```text
TB-AI-01 User → Prompt Gateway
TB-AI-02 Telemetry → AI Pipeline
TB-AI-03 CTI → Cognitive Core
TB-AI-04 RAG → Vector Store
TB-AI-05 Vector Store → Model
TB-AI-06 Model → Tool
TB-AI-07 Agent → AuthorizationPort
TB-AI-08 AI → SOAR
TB-AI-09 Model Registry → Runtime
TB-AI-10 Dataset Registry → Training
TB-AI-11 AI Provider → ACS
TB-AI-12 Tenant → AI Context
```

Threat families:

```text
Prompt manipulation
Indirect prompt injection
Context poisoning
Training/data poisoning
RAG poisoning
Embedding manipulation
Model theft/extraction
Model tampering
Sensitive-data leakage
Cross-tenant leakage
Tool abuse
Excessive agency
Privilege escalation
Unsafe action
Hallucination/misinformation
Confidence manipulation
Audit suppression
Evidence corruption
Resource exhaustion
Supply-chain compromise
Systemic multi-agent/model failure
```

---

## 18. Acceptance Matrix

Gate Acceptance criterion

---

AIGOV-ACC-001 Unit tests PASS
AIGOV-ACC-002 Integration tests PASS
AIGOV-ACC-003 Real PostgreSQL PASS
AIGOV-ACC-004 RLS PASS
AIGOV-ACC-005 Cross-tenant negative tests PASS
AIGOV-ACC-006 Unauthorized access DENIED
AIGOV-ACC-007 Concurrency PASS
AIGOV-ACC-008 Atomicity PASS
AIGOV-ACC-009 Failure injection PASS
AIGOV-ACC-010 Prompt injection suite PASS
AIGOV-ACC-011 Indirect prompt injection suite PASS
AIGOV-ACC-012 Data/model poisoning controls PASS
AIGOV-ACC-013 Model provenance PASS
AIGOV-ACC-014 Dataset provenance PASS
AIGOV-ACC-015 AI-BOM generation PASS
AIGOV-ACC-016 Evidence integrity PASS
AIGOV-ACC-017 Authorization boundary PASS
AIGOV-ACC-018 MPA PASS
AIGOV-ACC-019 Agent kill switch PASS
AIGOV-ACC-020 Cross-system regression PASS
AIGOV-ACC-021 Static/security gates PASS
AIGOV-ACC-022 RTM evidence complete
AIGOV-ACC-023 Remote CI PASS
AIGOV-ACC-024 Human governance disposition recorded

Mocks MAY support legitimate isolated unit tests but SHALL NOT
constitute evidence for PostgreSQL, RLS, authorization, integration,
concurrency, or E2E acceptance.

---

## 19. Dashboards and KRIs

Executive dashboard SHALL expose, at minimum:

```text
AI GOVERNANCE POSTURE
Registered AI Systems
Approved / Evaluating / Suspended Models
Open AI Risks by severity
Residual Critical Risks
Unapproved AI Assets
Cross-Tenant Violations
Models with Drift
Prompt/Indirect Injection Events
AI Recommendations
Human Overrides
AuthorizationPort Denials
Autonomous Protected Actions
```

Canonical KRIs:

```text
Critical AI Risk Count
Residual Critical Risk Count
Unregistered Model Rate
Unapproved Model Deployment Rate
Cross-Tenant Retrieval Rate
Cross-Tenant Inference Rate
Hallucination Rate
False Positive Rate
False Negative Rate
Confidence Calibration Error
Model Drift Rate
Prompt Injection Success Rate
Indirect Injection Success Rate
AI Recommendation Override Rate
AI Actions Denied by AuthorizationPort
Dataset Integrity Failure Rate
Evidence Provenance Failure Rate
Mean Time to Detect Model Drift
Mean Time to Suspend Unsafe Model
```

Hard-zero targets:

```text
cross_tenant_data_exposure = 0
cross_tenant_RAG_retrieval = 0
unauthorized_AI_execution = 0
unregistered_production_model = 0
```

---

## 20. Governance State Machine

```text
IDENTIFIED
→ ANALYZED
→ ASSESSED
→ TREATMENT_REQUIRED
→ MITIGATING
→ VALIDATING
→ RESIDUAL_RISK_REVIEW
      ├→ ACCEPTED → MONITORED → REASSESS
      └→ REJECTED → BLOCKED
```

Critical residual risk SHALL NOT be auto-accepted.

---

## 21. Cross-Framework Control Plane Integration

```text
NIST CSF / SP 800-61 / SP 800-53
CISA
MITRE ATT&CK / D3FEND
CVE / CWE / CVSS
          │
          ▼
ACS CROSS-FRAMEWORK CYBER DEFENSE CONTROL PLANE
          │
    ┌─────┴─────────────┐
    ▼                   ▼
Security Control     AI Governance
Graph                Control Plane
                        │
             ┌──────────┼──────────┐
             ▼          ▼          ▼
          AI Risk     Model      AI-BOM
          Register    Registry
             └──────────┬──────────┘
                        ▼
               ACS Knowledge Graph
                        │
                        ▼
               Fusion/Cognitive Core
                        │
                        ▼
                 Decision Envelope
                        │
                        ▼
                  AuthorizationPort
                        │
                    MPA / HITL
                        │
                        ▼
                       SOAR
                        │
                        ▼
Detect → Investigate → Decide → Contain
→ Eradicate → Recover → Learn
                        │
                        ▼
              Evidence / Audit / CoC
```

---

## 22. Mandatory Engineering Invariants

```text
INV-AI-001  No AI output is operational authority.
INV-AI-002  No cross-tenant AI context.
INV-AI-003  No unregistered production model.
INV-AI-004  No unversioned critical prompt.
INV-AI-005  No unprovenanced governed dataset.
INV-AI-006  No critical inference without evidence/provenance.
INV-AI-007  No protected destructive action without authorization.
INV-AI-008  No silent model/prompt/dataset change.
INV-AI-009  No mutation of original forensic evidence.
INV-AI-010  No automatic acceptance of critical residual risk.
INV-AI-011  Missing tenant context = DENY.
INV-AI-012  Authorization failure/uncertainty = DENY.
```

---

## 23. Canonical DevSecOps Lifecycle

```text
Authority / DoR
→ Custody Verification
→ Scope Confirmation
→ Implementation
→ Focused Tests
→ Integration Tests
→ Real PostgreSQL
→ RLS / Tenant Isolation
→ Authorization Tests
→ Real E2E
→ Concurrency
→ Atomicity
→ Failure Injection
→ AI Adversarial Testing
→ Acceptance Matrix
→ Cross-System Regression
→ Static / Security Gates
→ Evidence + Traceability
→ DoD
→ Publication
→ Remote CI
→ Merge
→ Human Governance Disposition
```

The agent SHALL stop rather than expand scope when authority is absent.

---

## 24. Definition of Done

The release state `ACS_AI_GOVERNANCE_CONTROL_PLANE_V1_ACCEPTED` is
permitted only when evidence supports:

```text
Requirements          PASS
RTM                   PASS
ADRs                  PASS
Threat Model          PASS
PostgreSQL            PASS
RLS                   PASS
Tenant Isolation      PASS
API                   PASS
Concurrency           PASS
AuthorizationPort     PASS
MPA                   PASS
AI-BOM                PASS
Model Registry        PASS
Dataset Governance    PASS
Prompt Governance     PASS
Adversarial Tests     PASS
Evidence / CoC        PASS
Acceptance Matrix     PASS
Regression            PASS
Remote CI             PASS
Human Governance      APPROVED
```

Otherwise the state SHALL accurately remain one of:

```text
IN_IMPLEMENTATION
VALIDATING
BLOCKED
AWAITING_HUMAN_GOVERNANCE
```

No unexecuted gate may be represented as PASS.

---

# 25. MASTER INITIALIZATION PROMPT --- CODEX

```text
ACS AI RISK REGISTER & AI GOVERNANCE CONTROL PLANE v1.0
MASTER INITIALIZATION PROMPT

ROLE
You are operating as the governed engineering agent for the
ACS — Angola Cyber Shield platform.

MISSION
Implement the ACS AI Risk Register & AI Governance Control Plane
as an integrated capability of the existing ACS Cross-Framework
Cyber Defense Control Plane.

AUTHORITY
The governance baseline, frozen architecture, accepted ADRs,
RTM, threat model, security invariants and explicit human
authorization define your authority.

You do not expand your own scope.

CORE PRINCIPLE

AI OUTPUT != AUTHORIZATION != EXECUTION.

No model, LLM, ML engine, Cognitive Core, agent, RAG component,
predictive engine or AI-assisted workflow may implicitly grant
itself authority to execute a protected ACS operation.

MANDATORY CAPABILITIES

Implement:

1. AI Risk Register
2. AI Risk Taxonomy
3. AI Risk Assessment Engine
4. Risk Treatment
5. Residual Risk Management
6. AI Model Registry
7. Model Version Registry
8. Dataset Registry
9. Dataset Versioning
10. Prompt Registry
11. Prompt Versioning
12. AI-BOM
13. AI Evaluation Registry
14. AI Deployment Registry
15. Framework Mapping
16. AI Decision Envelope
17. Evidence & Provenance integration
18. Dashboard/KRIs
19. AuthorizationPort integration
20. MPA/Human Governance integration.

TENANCY

The ACS is multi-tenant.

Tenant isolation is a security invariant.

All tenant-owned AI governance entities MUST be protected
using PostgreSQL RLS.

Client-provided tenant identifiers are never authoritative.

Missing tenant context MUST fail closed.

Cross-tenant reads, writes, retrievals, embeddings,
inferences or context propagation are prohibited.

DATABASE

Use real PostgreSQL.

Do not replace required PostgreSQL validation with mocks,
in-memory repositories or SQLite.

RLS must be verified using positive and negative
cross-tenant tests.

AI MODEL GOVERNANCE

No unregistered model may reach production.

Every production model must have:

identity
version
provenance
artifact integrity
risk classification
evaluation evidence
approval state
deployment record.

DATASET GOVERNANCE

Every governed dataset must have:

identity
version
origin
provenance
classification
integrity
permitted purposes
tenant scope
security assessment
approval state.

PROMPT GOVERNANCE

Critical prompts are governed configuration artifacts.

Prompt changes require:

versioning
diff
security testing
regression testing
risk reassessment
approval
deployment evidence
rollback capability.

AI-BOM

Maintain traceability of models, weights, tokenizers,
embeddings, datasets, prompts, agents, tools,
connectors, guardrails, runtimes, providers and licenses.

DECISION ENVELOPE

Security-relevant AI output must contain sufficient
structured information to reconstruct the decision:

model/version
hypothesis
confidence
uncertainty
explanation
evidence references
provenance
recommended actions
authorization requirement.

Never represent an AI inference as verified forensic fact
without corresponding evidence.

AUTHORIZATION

Protected actions must traverse the established
ACS authorization architecture.

AI
→ recommendation
→ policy evaluation
→ AuthorizationPort
→ MPA/Human Approval when required
→ execution.

Fail closed on authorization uncertainty or failure.

EVIDENCE

Original forensic evidence is immutable.

AI-generated interpretations are derived artifacts.

Maintain cryptographic integrity, provenance,
chain-of-custody references and complete auditability.

CONCURRENCY

Governed mutations require concurrency protection.

Stale writes must produce the canonical conflict behavior
and must not silently overwrite newer governance state.

SECURITY

Test at minimum:

prompt injection
indirect prompt injection
RAG poisoning
dataset poisoning
model tampering
cross-tenant retrieval
sensitive information disclosure
excessive agency
tool abuse
model extraction
unbounded consumption
evidence corruption
authorization bypass.

NO MOCK ACCEPTANCE

Mocks may support isolated unit tests where legitimate,
but they are not evidence for database, RLS,
authorization, integration or E2E acceptance.

REQUIRED EXECUTION ORDER

Authority/DoR
→ custody verification
→ scope confirmation
→ implementation
→ focused tests
→ integration
→ real PostgreSQL
→ RLS/isolation
→ authorization
→ E2E
→ concurrency
→ atomicity
→ failure injection
→ AI adversarial testing
→ acceptance matrix
→ regression
→ static/security gates
→ evidence/traceability
→ DoD
→ publication
→ remote CI
→ merge
→ human governance disposition.

STOP CONDITIONS

Stop rather than improvise when:

authority is missing;
scope expansion is required;
a frozen architectural decision would be violated;
tenant isolation cannot be proven;
authorization semantics are ambiguous;
critical evidence is unavailable;
a destructive migration is required without authority;
a critical residual AI risk requires human acceptance.

Do not weaken a security control to make a test pass.

Do not silently substitute mocks for required real
infrastructure.

Do not fabricate test evidence.

Do not fabricate framework mappings.

Do not declare PASS when a required gate was not executed.

FINAL DISPOSITION

Only evidence-backed states are permitted.

Examples:

PASS
FAIL
BLOCKED
NOT_EXECUTED
NOT_AUTHORIZED

A completed implementation does not itself constitute
governance approval.

Final production or phase progression remains subject to
explicit human governance disposition.
```

---

## 26. Canonical Status

This document establishes the human-approved governance baseline pending
controlled repository publication:

```text
ACS AI RISK REGISTER & AI GOVERNANCE CONTROL PLANE v1.0
Document ID: ACS-AI-GOV-001
Status: GOVERNANCE_BASELINE_APPROVED_PENDING_PUBLICATION
Runtime implementation: NOT AUTHORIZED
Qualification: NOT EXECUTED
Production readiness: NOT CLAIMED
```

Only controlled publication and subsequent canonical integration may
transition this package to an integrated governance state. Runtime
implementation, qualification, and production readiness require
separate explicit authorization and evidence.
