# ACS document index

This index distinguishes normative product authority from execution guidance.
Where documents conflict, the authoritative baseline takes precedence over
execution and governance material.

| Document | Path | Version | Function | Authority | Status | Precedence |
| --- | --- | --- | --- | --- | --- | --- |
| ACS Master Engineering Specification — Final Consolidated Engineering Edition | `baseline/ACS-MASTER-ENGINEERING-SPECIFICATION-BASELINE-ENTERPRISE-v5.3-FINAL-CONSOLIDATED-ENGINEERING-EDITION.txt` | 5.3 | Defines the product, architecture, engineering requirements, and acceptance baseline | ACS engineering baseline | NORMATIVE / SINGLE SOURCE OF TRUTH | 1 — highest |
| ACS Codex Execution Authority Readequation | `governance/ACS-v5.3-CODEX-EXECUTION-AUTHORITY-READEQUATION.txt` | 5.3 | Adapts execution authority to the Codex engineering agent without changing normative scope | ACS execution governance | EXECUTION / GOVERNANCE | 2 — subordinate to baseline |
| ACS Master Engineering Initialization Prompt — Codex DevOps | `governance/ACS-MASTER-ENGINEERING-INITIALIZATION-PROMPT-CODEX-DEVOPS-v5.3.txt` | 5.3 | Directs governed initialization and development workflow | ACS execution governance | EXECUTION / GOVERNANCE | 3 — subordinate to baseline and execution authority |
| ACS Official Development Initialization Prompt — Skyworks | `governance/legacy/ACS-OFFICIAL-DEVELOPMENT-INITIALIZATION-PROMPT-SKYWORKS-v5.3.txt` | 5.3 | Preserves the pre-Codex initialization instruction for audit history | Legacy execution reference | SUPERSEDED / REFERENCE ONLY | None — must not override current governance or baseline |
| ACS Repository Assessment | `architecture/ACS-REPOSITORY-ASSESSMENT.md` | Initial | Records factual repository and stack evidence from Phase B | Engineering assessment | ASSESSMENT / NON-NORMATIVE | Evidence only |
| ACS Initial Implementation Readiness | `architecture/ACS-INITIAL-IMPLEMENTATION-READINESS.md` | Initial | Determines the first incomplete Roadmap phase and entry constraints | Engineering assessment | ASSESSMENT / NON-NORMATIVE | Evidence only |
| ACS Initial Traceability Matrix | `traceability/ACS-INITIAL-TRACEABILITY-MATRIX.md` | Initial | Maps baseline areas to observed repository evidence and gaps | Engineering traceability | ASSESSMENT / NON-NORMATIVE | Subordinate to baseline |
| ACS Engineering Gap Register | `traceability/ACS-ENGINEERING-GAP-REGISTER.md` | Initial | Records temporary assessment gaps and recommended actions | Engineering assessment | ASSESSMENT / NON-NORMATIVE | Subordinate to baseline |
| ACS Baseline Governance Gaps | `governance/ACS-BASELINE-GOVERNANCE-GAPS.md` | Initial | Records unresolved documentary and custody conditions without interpreting them away | Baseline governance assessment | OPEN GOVERNANCE GAPS / NON-NORMATIVE | Requires formal resolution |

Documents under `architecture/`, `requirements/`, `decisions/`, `traceability/`,
`operations/`, and `evidence/` are supporting records. They become authoritative
only to the extent explicitly approved under the baseline's governance process.

## Phase 0 implementation records

- `architecture/decisions/` — ADR-0001 through ADR-0010.
- `engineering/` — engineering, database, API, event, testing, and observability standards.
- `security/ACS-DEVSECOPS-STANDARD.md` — pipeline and supply-chain controls.
- `governance/ACS-QUALITY-GATE-PROCESS.md` — gate lifecycle; QG-18 through QG-22 remain
  `UNDEFINED_IN_BASELINE`.
- `governance/catalogs/` — non-normative ECOM, EDIM, and EDOLM working catalogs.
- `evidence/` — evidence schema and phase records.
