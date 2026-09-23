# ACS-AIGOV M0A AI Inventory local qualification evidence

Status: `LOCAL_QUALIFICATION_COMPLETE` (subject to separate human publication disposition)

Execution date: `2026-09-23`. Isolated worktree: `D:\ACS-AIGOV-M0A-IMPLEMENTATION`, branch `codex/aigov-m0a-ai-inventory`, base and remote `develop`: `a42811393323092e9e95f9502438bbe3a4da2714`. Staging was empty. No publication, production deployment, provider/model execution or persistent ACS runtime mutation was authorized or performed.

This is an implementation evidence overlay. The approved AIGCP governance documents are not rewritten. Counts below are raw results from the current tree; configured skips are not passes.

## Domain and database proof

The M0A domain is AI systems, models, model versions, datasets, dataset versions, prompts and prompt versions. Contracts reject unknown fields and raw content. Version metadata uses SHA-256 plus references, not model weights, dataset bytes or prompt bodies. The service uses signed OIDC identity, canonical active membership, server-issued tenant context and `AuthorizationPort`; the repository rechecks the trusted tenant/user/action binding.

`corepack pnpm db:validate` passed on a fresh disposable PostgreSQL 17 database. It applied the M0A migration after canonical baseline migrations, verified schema/roles/grants, RLS and FORCE RLS, rolled the M0A migration back cleanly and reapplied it. The canonical validator also reported trusted context, tenant isolation, MPA, Event Foundation, XCAP-005, XCAP-011 and XCF-M1 foundations verified. No persistent database was used.

All seven M0A entity families carry mandatory tenant-scoped foreign keys to the canonical `cyberdefense.evidence_records(tenant_id,evidence_id)` authority. Model and dataset provenance references use the same tenant-scoped authority. Real PostgreSQL tests denied nonexistent and cross-tenant evidence references on create and update, denied direct role bypass, and denied forged actor/context. Runtime version-row mutation was denied with SQLSTATE `42501`; an administrative mutation path hit the immutability trigger with SQLSTATE `55000`. No parallel evidence store or raw evidence copy was introduced.

The production PostgreSQL repository suite passed `11/11`: seven-family registration, version immutability, tenant isolation, evidence-reference isolation, stale-version conflict, exactly-one-wins concurrency, tenant-scoped idempotent replay, trusted-context/actor denial, and five injected transaction failure points. At each injected point domain, command result, audit and Event Foundation outbox state rolled back together. The real signed-OIDC HTTP suite passed `3/3`, including membership/context binding, create/read/update, stale-version conflict, cross-tenant evidence denial, mass-assignment rejection and unauthenticated rejection.

Focused contracts and service tests passed `11/11`; bounded HTTP handler tests passed `4/4`. The canonical XCAP-005 E2E passed `26/26` with the shared disposable database. MPA is **not applicable to authorized M0A registration/update transitions**; no MPA acceptance is claimed for future protected AI-governance transitions.

## Cross-capability regression

| Suite / command                                                      |            Passed |  Failed |                                              Skipped | Result |
| -------------------------------------------------------------------- | ----------------: | ------: | ---------------------------------------------------: | ------ |
| Workspace `corepack pnpm test`, terminal rerun                       | 11/11 Turbo tasks | 0 tasks | AI Gateway has no test files under configured policy | PASS   |
| Platform API unit within workspace                                   |               184 |       0 |                                         3 configured | PASS   |
| Web unit within workspace                                            |               160 |       0 |                                                    0 | PASS   |
| Phase 1 canonical `corepack pnpm test:phase1:e2e`                    |               341 |       0 |                                        31 configured | PASS   |
| Event Foundation canonical `corepack pnpm test:event-foundation:e2e` |                 5 |       0 |                                                    0 | PASS   |
| XCAP-005 real PostgreSQL E2E                                         |                26 |       0 |                                                    0 | PASS   |
| XCAP-011 real PostgreSQL E2E                                         |                 7 |       0 |                                                    0 | PASS   |
| XCAP-011 real HTTP E2E                                               |                 7 |       0 |                                                    0 | PASS   |
| XCF-M1 real PostgreSQL E2E                                           |                12 |       0 |                                                    0 | PASS   |
| MPA real HTTP E2E                                                    |                 2 |       0 |                                                    0 | PASS   |

The Phase 1 E2E covers the applicable Phase 1 trusted-context and Phase 2 customer, lead, plan, partner, opportunity, proposal, contract, subscription, entitlement and usage workflows on the disposable database. M0A changed no Web source. The separately repeated Web suite passed `160/160`.

The **first** workspace aggregate test run exited nonzero: Web had `122` passing tests but two Vitest forks failed to start before the worker response timeout. This raw run remains `FAIL`, not converted to PASS. A bounded standalone Web run passed `160/160`, followed by a new canonical workspace run passing `11/11` Turbo tasks with no timeout or expectation changes. A first Phase 1 E2E attempt also exited before tests because the test binding incorrectly used database user `acs` rather than the disposable container's `postgres` user; the corrected process-only binding ran the identical canonical suite to terminal `341 PASS / 0 FAIL / 31 configured SKIP`. These are environment/binding events, not proven product defects. An earlier focused HTTP cold-start hook timed out once; the bounded rerun passed `4/4` without changed controls. All raw failures remain disclosed.

## Static and security gates

| Gate                                     | Evidence                                                                         | State                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `corepack pnpm format:check`             | Repository Prettier check, repeated after evidence formatting                    | PASS                                                                  |
| `corepack pnpm lint`                     | 11/11 Turbo tasks                                                                | PASS                                                                  |
| `corepack pnpm typecheck`                | 11/11 Turbo tasks                                                                | PASS                                                                  |
| `corepack pnpm build`                    | 7/7 Turbo tasks                                                                  | PASS                                                                  |
| `git diff --check`                       | No tracked whitespace error; untracked evidence files checked by Prettier        | PASS                                                                  |
| `corepack pnpm audit --audit-level high` | 0 CRITICAL, 0 HIGH, 4 MODERATE                                                   | PASS at repository HIGH threshold; 4 MODERATE remain unsuppressed     |
| CycloneDX lockfile SBOM                  | 461 components, 388992 bytes; generated in temporary storage and removed         | PASS                                                                  |
| Local Trivy secret scan                  | 0 findings; read-only source mount                                               | PASS                                                                  |
| Local Trivy IaC scan                     | 0 HIGH/CRITICAL, 3 MEDIUM and 5 LOW in unchanged infrastructure/Dockerfile paths | PASS at canonical HIGH/CRITICAL threshold; lower severities disclosed |
| Platform API container build/Trivy       | Local image built; 0 HIGH/CRITICAL OS and language vulnerabilities               | PASS                                                                  |
| Web container build/Trivy                | Local image built; 0 HIGH/CRITICAL OS vulnerabilities                            | PASS                                                                  |

IaC findings are `KSV-01010` on `infrastructure/kubernetes/base/configmap.yaml`; `KSV-0125` on the unchanged Platform API and Web Kubernetes manifests; `KSV-0020` and `KSV-0021` on those two manifests; and `DS-0026` on the unchanged Platform API Dockerfile. No M0A changes touched those paths. No scanner suppression, CVE waiver or threshold change was made. Local CodeQL is not present; remote CodeQL/mandatory CI remain a publication gate and are not claimed as passed here.

The modified source, tests, fixtures, migration, audit/outbox payload shapes and error envelopes were reviewed for provider secrets, access/refresh tokens, raw prompt/dataset/model/evidence content, private keys and secret connection strings. The local Trivy secret scan found zero. Test-only database login fixtures are existing ACS conventions and no runtime credential was printed or persisted by this qualification.

## M0A acceptance subset

The published AIGCP acceptance matrix remains authoritative for future slices. M0A applies the following subset only:

| Gate                   | M0A result | Evidence / boundary                                                                                                                                     |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACC-001, 002           | PASS       | Contracts/service `11/11`, repository `11/11`, HTTP `4/4` and real HTTP `3/3`                                                                           |
| ACC-003, 004, 005, 006 | PASS       | Fresh PostgreSQL 17 validation, rollback/reapply, RLS/FORCE RLS, tenant/context/authorization negatives                                                 |
| ACC-007, 008, 009      | PASS       | Stale version, concurrency, atomic domain/audit/outbox/evidence-FK transaction and five failure injections; MPA facet not applicable to M0A transitions |
| ACC-013                | PASS       | M0A model identity, hash and XCAP-005 provenance reference; signature verification of acquired artifacts is outside registry-only M0A                   |
| ACC-014                | PASS       | M0A dataset identity/version, provenance, permitted uses and residency-policy reference; no raw dataset content                                         |
| ACC-016, 017           | PASS       | M0A tenant-bound canonical XCAP-005 references and AuthorizationPort; XCAP-005 `26/26`                                                                  |
| ACC-020                | PASS       | Executed Phase 1/2, Event Foundation, MPA, XCAP-005/011, XCF-M1, Platform API and Web regression above                                                  |
| ACC-021                | PASS       | Local M0A format, lint, typecheck, build, audit, SBOM, secret/IaC and container Trivy; CodeQL and remote CI remain publication gates                    |
| ACC-022                | PASS       | M0A requirement overlay `11/11` complete; this evidence package                                                                                         |

`ACC-010–012`, `ACC-015`, `ACC-018–019`, and `ACC-023–024` = `NOT_APPLICABLE` to authorized **local M0A runtime** qualification: prompt-injection/poisoning and kill-switch surfaces are future slices; AI-BOM is later; MPA policy values are unresolved for later protected transitions; remote CI and publication-specific human disposition are prohibited in this task. Their future-slice governance state remains `DEFINED_NOT_EXECUTED`, not PASS. This is not a waiver of future acceptance. ACC-013's cryptographic signature facet remains specifically outside M0A, which does not acquire or execute model artifacts.

`M0A_APPLICABLE_ACCEPTANCE_GATES = 16`; `M0A_APPLICABLE_PASS = 16`; `M0A_APPLICABLE_PENDING = 0`; `MANDATORY_APPLICABLE_NOT_EXECUTED = 0` for the authorized local slice. Remote CI and production acceptance are not claimed. Configured skips remain separate: Phase 1 E2E `31`, Platform API unit `3`, and AI Gateway Contract has no test files under its configured policy.

## Boundary and remaining classification

No known material M0A defect was established by the executed tests. Applicable dependency and image gates have `KNOWN_CRITICAL = 0` and `KNOWN_HIGH = 0`. Non-blocking findings: dependency audit `4 MODERATE`; unchanged IaC `3 MEDIUM / 5 LOW`. Environmental events: initial HTTP cold-start hook timeout, aggregate Web worker-start timeout, first Phase 1 disposable binding failure, slow npm registry downloads in local Docker builds, and a stalled Trivy DB mirror download. The official alternate Trivy DB repository completed successfully without changing scanner thresholds. Final documentation format/diff check and custody verification passed. No source, tests, DB schema, policy or timeout was weakened to obtain a green result.

`STAGING = EMPTY`; `COMMIT = NONE`; `PUSH = NONE`; `PR = NONE`; `MERGE = NONE`; `DEPLOYMENT = NONE`.
