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

Documents under `architecture/`, `requirements/`, `decisions/`, `traceability/`,
`operations/`, and `evidence/` are supporting records. They become authoritative
only to the extent explicitly approved under the baseline's governance process.
