# ACS Phase 1 Engineering Evidence

Status: `PHASE_1_TECHNICALLY_COMPLETE_GOVERNANCE_OR_HARDENING_PENDING`

- Phase: Platform Foundation and Multi-Tenancy
- Base branch: `develop`
- Base SHA: `c5bea416dbc71f83c485fa92817e5850d4de88f3`
- Working branch: `feat/phase-1-platform-multitenancy`
- Environment: Windows workspace, Docker Desktop, PostgreSQL 18.3 pinned by digest, GitHub-hosted runners
- Redaction: never record tokens, credentials, connection strings, or sensitive payloads

Evidence is added at each controlled checkpoint. A result is `VERIFIED` only after the
referenced command, test, or CI job actually completes.

| Checkpoint              | Artifact                                                            | Result     |
| ----------------------- | ------------------------------------------------------------------- | ---------- |
| Phase 1 entry gate      | Phase 0 merge ancestry, clean develop, `pnpm check`, post-merge CI  | `VERIFIED` |
| Requirements and design | Inventory, ADR-0011, architecture, threat analysis, traceability    | `VERIFIED` |
| Data and security       | Roles, migration, trusted grants, FORCE RLS, durable audit          | `VERIFIED` |
| Backend vertical slice  | Identity, AuthorizationPort, PostgreSQL adapters, safe denials      | `VERIFIED` |
| Frontend vertical slice | Shared response contract; development identity excluded in prod     | `VERIFIED` |
| Local quality gate      | `CI=true pnpm check`; format/lint/typecheck/25 tests/build          | `VERIFIED` |
| PostgreSQL validation   | `pnpm db:validate`; migration/RLS/spoofing/audit matrix             | `VERIFIED` |
| API/PostgreSQL E2E      | `pnpm test:phase1:e2e`; 11/11 tests                                 | `VERIFIED` |
| SBOM                    | `pnpm sbom:generate`; CycloneDX lockfile SBOM                       | `VERIFIED` |
| Phase 1 remote CI       | Run `31584126240` on `e3f8d0910c6c52c77e8ea2945eb9755b1a797f47`     | `VERIFIED` |
| Phase 0 regression CI   | Run `31584126302` on `e3f8d0910c6c52c77e8ea2945eb9755b1a797f47`     | `VERIFIED` |
| Repository validation   | Run `31586095633`, job `94080163232`, `workflow_dispatch`, same SHA | `VERIFIED` |

Local validation date: 2026-08-12. The disposable database was removed after execution. The
local `pnpm audit` registry request was blocked by the execution environment's external metadata
disclosure policy; SCA remains assigned to the authorized GitHub workflow and is not reported as
successful locally. Remote SCA/SBOM completed successfully in run `31584126302`.

Repository validation completed at 2026-08-12T10:08:41Z. Its `repository-safety` job verified
the required repository files, unsafe tracked-file policy including the `.env.example` exemption,
private-key markers, and whitespace controls defined by the workflow on the recorded SHA.

Known non-blocking observation: the production web build succeeds but Vite reports that
`node:crypto`, referenced by the compiled contracts package, is externalized for browser
compatibility. No runtime failure was observed in the implemented read-only slice; the dependency
boundary should be separated before browser code consumes a contract path that executes crypto.

The production authentication vertical-slice evidence is maintained separately in
`PRODUCTION-OIDC-JWT-EVIDENCE.md`. It does not supersede the accepted selective-adoption record.

Tenant administration implementation and its current validation boundary are recorded in
`TENANT-ADMINISTRATION-EVIDENCE.md`.

The Tenant Administration & Authorization Lifecycle slice was integrated through PR #4 at merge
SHA `8b2eb5b705088427479b85cecdca8ee161ce883b`. Post-merge Repository, Phase 1, and Phase 0
validation runs `31935367613`, `31935367596`, and `31935367655` completed successfully on that
exact SHA. This verifies only that Phase 1 slice; it does not authorize Phase 2 or promote
ADR-0014 beyond `PROPOSED`.

The final Phase 1 documentation closure was integrated through PR #5 at merge SHA
`8698fe43ae7c4a1f2e3d2d86ae5f1e9dda60d7a2`. Post-merge Repository, Phase 1, and Phase 0
validation runs `31936812725`, `31936812713`, and `31936812776` completed successfully on that
exact SHA. This is the current integrated technical checkpoint; governance approval and
operational-hardening dispositions remain separate decisions.
