# ACS Cross-Framework Cyber Defense Control Plane governance

This directory is the canonical governance package for `ACS-XCF-CP-001`.

Status: `GOVERNANCE_QUALIFIED_FOR_CANONICAL_PUBLICATION`

The package defines governance only. It authorizes no runtime implementation, database migration,
external-feed ingestion, AI-provider execution, response automation, production activation, or
subsequent capability.

The active package is self-contained and does not depend normatively on superseded drafts. Historical
draft custody is recorded in `SUPERSESSION.md`.

## Active package

- `ACS-XCF-GEP-v1.2.md` — charter, architecture, roadmap, DoR/DoD and engineering lifecycle.
- `ACS-XCF-REQUIREMENTS-v1.2.md` — sixty-six individually identified requirements.
- `ACS-XCF-RTM-v1.2.md` — individual future traceability with truthful implementation status.
- `ACS-XCF-THREAT-MODEL-v1.2.md` — trust boundaries, threats and residual risks.
- `ACS-XCF-SOURCE-TRUST-AND-FRAMEWORK-REGISTRY-v1.2.md` — external-source and registry governance.
- `ACS-XCF-DATA-MAPPING-GRAPH-GOVERNANCE-v1.2.md` — mapping, graph and global/tenant rules.
- `ACS-XCF-AUTHORIZATION-EVIDENCE-EVENT-GOVERNANCE-v1.2.md` — canonical authority reuse.
- `ACS-XCF-M1-AUTHORITY-SCOPE-AND-MPA-CATALOG-v1.0.md` — frozen M1/M2 boundary,
  global/tenant permission and role catalogs, and canonical XCF MPA policies.
- `ACS-XCF-ACCEPTANCE-MATRIX-v1.2.md` — deterministic future acceptance contracts.
- `ACS-XCF-NEGATIVE-SECURITY-MATRIX-v1.2.md` — canonical negative-security cases.
- `ACS-XCF-FAILURE-INJECTION-MATRIX-v1.2.md` — canonical failure-injection cases.

Standalone XCF ADRs are under `docs/architecture/decisions/` and publication evidence is under
`docs/evidence/xcf/`.

## Authority boundary

```text
XCF_GOVERNANCE = CANDIDATE_FOR_CANONICAL_PUBLICATION
XCF_RUNTIME_IMPLEMENTATION = NONE
XCF_IMPLEMENTATION_AUTHORITY = NOT_GRANTED
FRAMEWORK_REGISTRY_IMPLEMENTATION_AUTHORITY = NOT_GRANTED
```
