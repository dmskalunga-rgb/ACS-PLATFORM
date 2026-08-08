# ACS Initial Implementation Readiness

Status: Phase B/C readiness decision  
Decision: `READY_FOR_PHASE_0_IMPLEMENTATION`

This decision means that the repository has enough normative authority to begin a
controlled Phase 0 engineering-foundation slice after explicit authorization. It does
not authorize functional domain implementation and does not mean Phase 0 is complete.

## First incomplete Roadmap phase

**Phase 0 — Governance and Engineering Foundation** is the first incomplete phase.

This was determined from repository evidence:

- baseline and execution governance exist;
- Git branch policy and a minimal repository validation workflow exist;
- no approved stack decision, application architecture, engineering standards,
  reproducible toolchain, dependency strategy, environment model, test strategy,
  security pipeline, observability foundation, or traceability implementation exists.

No evidence supports advancing directly to Phase 1.

## Phase 0 readiness

| Phase 0 prerequisite | Status | Evidence or gap |
| --- | --- | --- |
| Authoritative baseline available | `IMPLEMENTED_VERIFIED` | `docs/baseline/` |
| Execution authority available | `IMPLEMENTED_VERIFIED` | `docs/governance/` |
| Git workflow and protected stable branch | `IMPLEMENTED_VERIFIED` | Repository state and documented policy |
| Basic repository validation CI | `IMPLEMENTED_VERIFIED` | `.github/workflows/repository-validation.yml` |
| Initial factual repository assessment | `IMPLEMENTED_VERIFIED` | `docs/architecture/ACS-REPOSITORY-ASSESSMENT.md` |
| Initial gap register | `IMPLEMENTED_VERIFIED` | `docs/traceability/ACS-ENGINEERING-GAP-REGISTER.md` |
| Initial traceability | `PARTIAL` | Area-level matrix exists; individual requirements are not fully identified |
| Architecture decision records | `MISSING` | `docs/decisions/` has no tracked decisions |
| Technology stack selection | `MISSING` | No ADR or manifest |
| Engineering standards | `MISSING` | No coding, testing, API, data, or migration standards |
| Reproducible build/test toolchain | `MISSING` | No source, manifests, locks, or build files |
| DevSecOps quality pipeline | `PARTIAL` | Repository safety only |
| Environment and secret-reference model | `MISSING` | No runtime environment contract |
| Evidence and Quality Gate procedure | `MISSING` | No execution-evidence schema or approval workflow |

## Blocking prerequisites before Phase 1

- Approve a technology and repository architecture through ADRs.
- Define canonical service boundaries beginning with Platform Foundation.
- Establish ECOM, EDIM, and EDOLM working matrices at implementation granularity.
- Establish stable requirement identifiers or an approved reference-mapping procedure.
- Define database migration, RLS, tenant-isolation, and rollback standards.
- Define API/event versioning and contract-test standards.
- Establish reproducible local and CI build/test/security toolchains.
- Define development, test, staging, and production environment boundaries.
- Define evidence capture and Quality Gate approval procedures.

## Governance blockers affecting later promotion

- QG-18 through QG-22 are undefined in the physical baseline.
- The baseline custody state remains `FINAL CONSOLIDATION CANDIDATE` until formal
  QG-34 approval, authorities, and custody hash are registered.
- ECOM, EDIM, and EDOLM are not exhaustive.

These gaps do not require inventing replacements. They must be resolved or formally
accepted through the baseline governance process before they affect a gated promotion.

## Recommended first vertical slice

**Phase 0 — Governed Engineering Foundation**

Proposed scope for a future, separately authorized branch:

1. Record stack, monorepo/layout, deployment, data, and security decisions as ADRs.
2. Define development tool versions, dependency locking, formatting, linting, and tests.
3. Establish the canonical Platform Foundation boundaries without yet implementing
   functional domain behavior.
4. Expand CI with evidence-backed secrets scanning, SAST/SCA, SBOM, and policy checks
   appropriate to the selected stack.
5. Define traceability, Quality Gate evidence, migration/RLS, API/event, observability,
   rollback, and environment standards.

## Entry constraint

No implementation should begin from this assessment branch. A new authorized work branch
must be derived from updated `develop`, and its plan must reference the applicable baseline
sections, gaps, owners, dependencies, tests, and Quality Gates.
