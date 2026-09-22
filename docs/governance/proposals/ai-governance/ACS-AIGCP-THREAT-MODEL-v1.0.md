# ACS AIGCP Threat Model v1.0

**Document ID:** `ACS-AIGCP-TM-001`\
**Status:** `GOVERNANCE_APPROVED_PENDING_PUBLICATION`\
**Runtime verification:** `NOT_EXECUTED`

## 1. Protected assets

- tenant context and membership authority;
- model, dataset, prompt, evaluation, and deployment identities;
- model artifacts and signatures;
- AI risk decisions and residual-risk acceptances;
- prompts, datasets, inputs, outputs, embeddings, and vector material;
- evidence, provenance, audit, and outbox integrity;
- AuthorizationPort and MPA decisions; and
- kill-switch state and recovery authority.

## 2. Trust boundaries

| ID       | Boundary                     | Required control direction                              |
| -------- | ---------------------------- | ------------------------------------------------------- |
| TB-AI-01 | User -> Prompt Gateway       | Authentication, classification, validation, rate limits |
| TB-AI-02 | Telemetry -> AI Pipeline     | Schema, provenance, tenant binding, bounded ingestion   |
| TB-AI-03 | CTI -> Cognitive Core        | XCF source trust, freshness, provenance                 |
| TB-AI-04 | RAG -> Vector Store          | Tenant namespace, permitted-use and retrieval policy    |
| TB-AI-05 | Vector Store -> Model        | Provenance, classification, bounded context             |
| TB-AI-06 | Model -> Tool                | Deny-by-default tool policy and AuthorizationPort       |
| TB-AI-07 | Agent -> AuthorizationPort   | No self-authorization; trusted tenant context           |
| TB-AI-08 | AI -> SOAR/Execution         | Recommendation only until authorized                    |
| TB-AI-09 | Model Registry -> Runtime    | Approved identity/version/hash and trust state          |
| TB-AI-10 | Dataset Registry -> Training | Permitted-use, provenance and evaluation gate           |
| TB-AI-11 | AI Provider -> ACS           | AI Gateway, provider trust, redaction, validation       |
| TB-AI-12 | Tenant -> AI Context         | Server-issued context and fail-closed RLS               |

## 3. Threat/control matrix

| Threat family                        | Existing reusable control                  | Required future proof                                       |
| ------------------------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| Prompt and indirect prompt injection | Strict contracts and classification policy | Dedicated adversarial suites and tool-isolation tests       |
| Context/RAG/embedding poisoning      | XCF/XCAP-005 provenance patterns           | Source validation, tenant-scoped retrieval, poisoning tests |
| Model/data poisoning                 | Hash/provenance concepts                   | Signature, quarantine, evaluation, and revocation tests     |
| Model theft/extraction               | General access/rate controls               | Model-specific abuse and extraction resistance              |
| Sensitive data/secret leakage        | Tenant controls and secret scanning        | Input/output redaction and negative leakage tests           |
| Cross-tenant leakage                 | Trusted context and RLS/FORCE RLS          | Model/dataset/prompt/RAG/vector/evidence negative E2E       |
| Tool abuse/excessive agency          | AuthorizationPort/MPA                      | Agent/tool policy and bypass tests                          |
| Privilege escalation                 | AuthorizationPort, MPA, least privilege    | AI-specific protected-operation tests                       |
| Unsafe action/blast radius           | MPA and fail-closed execution              | Dry-run, bounded scope, rollback, kill-switch tests         |
| Hallucination/misinformation         | XCAP-011 evidence/confidence               | Evaluation, corroboration, fact/inference labeling          |
| Confidence manipulation              | XCAP-011 uncertainty model                 | Calibration, tamper, and insufficient-confidence tests      |
| Audit suppression                    | Transactional audit/outbox                 | Atomic failure injection and reconstruction tests           |
| Evidence corruption                  | XCAP-005 hashes/custody                    | AI derivation/integrity tests                               |
| Resource exhaustion                  | General quotas/observability               | Token, cost, concurrency and provider-budget controls       |
| Supply-chain compromise              | SCA/SBOM and XCF source trust              | AI-BOM, artifact signature and provider trust tests         |
| Systemic multi-agent/model failure   | No runtime exists                          | Circuit breakers, isolation, kill switch and chaos tests    |

## 4. Mandatory abuse cases

Future applicable slices must test at least:

1. missing, expired, substituted, and cross-tenant context;
2. direct database bypass under runtime roles;
3. unauthorized or replayed protected transition;
4. AI attempts to approve its own recommendation;
5. expired, consumed, non-independent, or incorrectly attested MPA;
6. unregistered, revoked, quarantined, or hash-mismatched model artifact;
7. unversioned or unapproved critical prompt;
8. unprovenanced or disallowed dataset use;
9. sensitive content introduced into audit/outbox;
10. evidence/provenance substitution or tampering;
11. framework-mapping substitution outside XCF authority;
12. prompt and indirect prompt injection;
13. poisoned source, dataset, feedback, RAG, or embedding;
14. provider outage, malformed output, or trust revocation;
15. kill-switch bypass and self-reactivation; and
16. partial-transaction failure across state, audit, outbox, evidence,
    and MPA consumption.

## 5. Residual governance risks

Exact provider trust, signatures, MPA policy values, data-retention values,
RAG/vector architecture, and agent execution are deliberately unresolved
until their respective implementation slices are separately authorized.
