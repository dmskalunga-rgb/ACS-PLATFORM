# ACS-XCF M1 implementation qualification evidence

Status: `LOCAL_QUALIFICATION_COMPLETE`

Execution date: `2026-09-22`
Execution context: isolated worktree `D:\ACS-XCF-M1-IMPLEMENTATION`; disposable PostgreSQL 17
Historical base: `b43296fecd5a168bd33c92e288dc7fb894eb307a`

This is implementation evidence. It does not alter the frozen XCF governance package and does not
authorize staging, publication, merge, deployment, M2, AIGCP, GRCF or XRESP.

## Material gap closure

| Gap                                  | Result | Executed evidence                                                                                                                                                                                                                                |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Independent cryptographic trust      | PASS   | Ed25519 verification, unknown/revoked key, algorithm substitution, malformed/mismatched signature, publisher/key mismatch and valid-signature/schema-failure separation in `xcf-framework-artifact.test.ts` and `xcf-framework-registry.test.ts` |
| Canonical bounded acquisition/parser | PASS   | HTTPS-only acquisition, redirect denial, timeout, partial/oversized response, media/schema/depth/object-count bounds, gzip ratio/truncation, duplicate identity, server-derived hash/object graph and inert prototype-looking payload proof      |
| Activation-time license revalidation | PASS   | Unit validation of changed/revoked/incompatible license plus PostgreSQL activation denial with MPA consumption rollback in `xcf-framework-registry.database.e2e.test.ts`                                                                         |

## PostgreSQL, RLS and lifecycle

`corepack pnpm db:validate` passed on a fresh disposable `postgres:17-alpine` database. The canonical
result reported XCF M1 migration, rollback, RLS and FORCE RLS as `VERIFIED`, together with trusted
context, tenant isolation, MPA, audit, Event Foundation, XCAP-005 and XCAP-011 foundations.

The production PostgreSQL M1 suite passed `12/12` and proved registration, source activation,
quarantine, immutable provenance, approval, activation, deterministic replay, concurrency,
activation-time license denial, activation rollback, quarantine rollback, supersession, revocation,
audit/outbox rollback and bounded PostgreSQL-unavailable failure.

## Failure injection matrix

All 13 cases assigned to M1 were executed; no case was skipped or inferred.

| Case                                        | Result | Evidence                                                                                                       |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| XCF-FI-001 PostgreSQL unavailable           | PASS   | Real repository connection to a closed local port failed within the bounded assertion; no success receipt      |
| XCF-FI-002 source timeout                   | PASS   | Acquisition abort classified `ACQUISITION_TIMEOUT`; bounded failure recorded; no release ingestion             |
| XCF-FI-003 transaction abort                | PASS   | Injected transaction phases rolled back domain, command, audit and event rows                                  |
| XCF-FI-004 serialization conflict           | PASS   | Two concurrent exact replays produced one canonical row and one replay receipt                                 |
| XCF-FI-005 integrity failure                | PASS   | Hash/signature failures quarantined with zero canonical objects and no activation event                        |
| XCF-FI-006 partial download                 | PASS   | Declared/received length mismatch rejected as `PARTIAL_DOWNLOAD`                                               |
| XCF-FI-007 parser/schema failure            | PASS   | Truncated JSON, unsupported schema, depth and object-count exhaustion rejected within bounds                   |
| XCF-FI-008 quarantine persistence failure   | PASS   | Failure after domain write rolled artifact, release, command, audit and outbox back to zero                    |
| XCF-FI-009 activation transaction failure   | PASS   | Failure before commit preserved the prior ACTIVE release, candidate APPROVED state and unconsumed MPA envelope |
| XCF-FI-011 audit append failure             | PASS   | Failure after audit append rolled domain/audit/command back                                                    |
| XCF-FI-012 outbox append failure            | PASS   | Failure after event append rolled domain/audit/outbox/command back                                             |
| XCF-FI-014 AuthorizationPort unavailable    | PASS   | Rejected authorization produced no repository call or fallback                                                 |
| XCF-FI-015 MPA unavailable/rejected/expired | PASS   | Canonical MPA suite passed `27/27`, including fail-closed attestation and expiry states                        |

`FI_EXECUTED = 13`, `FI_PASS = 13`, `FI_FAIL = 0`, `FI_NOT_EXECUTED = 0`.

## Negative-security matrix

The 22 cases applicable to M1 passed:

- `XCF-NEG-001` through `XCF-NEG-008`: canonical database isolation/context proofs, server tenant
  authority, AuthorizationPort, MPA and source trust/revocation tests;
- `XCF-NEG-009`: an executed schema inspection found zero M1 mapping, overlay, tenant-fact or
  promotion relations/functions; the prohibited M2 promotion surface is absent;
- `XCF-NEG-010`, `011`, `013`: signature/hash, expected-version, source/release revocation and
  activation-state proofs;
- `XCF-NEG-020` through `025`: replay conflict, database least privilege/FORCE RLS, bounded event
  payload, hostile parser/resource limits, decompression bounds and license denial;
- `XCF-NEG-028`, `029`, `031`, `032`: partial-state atomicity, rollback/reapply referential proof,
  backup/restore recovery and unsupported schema rejection.

The read-only event inspection found zero XCF payloads containing raw artifact bytes, raw artifacts,
object graphs, signatures or license text.

`NEG_EXECUTED = 22`, `NEG_PASS = 22`, `NEG_FAIL = 0`, `NEG_NOT_EXECUTED = 0`.

## NEG-031 recovery proof

NEG-031 is applicable to M1 and passed. A PostgreSQL custom-format backup of the qualified database
was restored into a clean second database. Source and restore matched on all nine XCF tables, row
counts, audit count, event count, release-history digest, supersession and revocation history. All XCF
tables retained both RLS and FORCE RLS. The restored database then passed the real M1 PostgreSQL
suite `7/7`.

The compared state included: publishers `4`, sources `2`, artifacts `3`, releases `3`, objects `1`,
supersessions `1`, revocations `1`, commands `8`, audits `12`, events `12`, and release digest
`ce29db3ac325ee1ff3303b07514f8ea9`.

## M1 acceptance

| Acceptance                                   | Result | Evidence                                                                                                                 |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| XCF-AC-001 signed source/release ingestion   | PASS   | Production validator/service tests plus real repository quarantine/ingestion/audit/outbox proof                          |
| XCF-AC-002 replay-safe identical ingestion   | PASS   | Exact replay returned one receipt and no duplicate artifact/fact/event; divergent replay denied                          |
| XCF-AC-003 governed newer-version activation | PASS   | Independent approval + canonical MPA activation retained prior immutable history and produced exactly one active version |

`M1_ACCEPTANCE_MAPPED = 3`, `M1_ACCEPTANCE_EXECUTED = 3`, `M1_ACCEPTANCE_PASS = 3`,
`M1_ACCEPTANCE_FAIL = 0`, `M1_ACCEPTANCE_SKIP = 0`, `M1_ACCEPTANCE_NOT_EXECUTED = 0`.

## Regression and static/security gates

- Contracts: `23/23`.
- Platform API unit: `173 passed`, `3 configured skips`; final affected focused matrix `28/28`.
- Phase 1/Phase 2 canonical E2E: `372/372`.
- Event Foundation PostgreSQL E2E: `5/5`.
- XCAP-005 PostgreSQL E2E: `26/26`.
- XCAP-011 PostgreSQL E2E: `7/7`.
- Web: `160/160`. The first workspace attempt had a Vitest worker-start timeout before the Contract
  suite executed; the missing Contract suite then passed `22/22`, and the complete Web suite passed
  `160/160` without changing timeout or configuration.
- Workspace surfaces: all 11 repository tasks reached success across the canonical run plus targeted
  recovery of the unstarted Web worker.
- Format, workspace lint, workspace typecheck (`11/11`), workspace build (`7/7`) and
  `git diff --check`: PASS.
- `pnpm audit --audit-level high`: exit `0`; `0 HIGH`, `0 CRITICAL`, `4 MODERATE` unsuppressed.

## Correction ledger

| Correction                                                                  | Files                                                                  | Invalidated gates                                     | Rerun                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| Q-01 RLS fixture aligned with the governed source-license columns           | `database/tests/rls/xcf_m1_framework_registry_isolation.sql`           | Database validation                                   | Fresh canonical validation PASS          |
| Q-02 Type/lint-only cleanup                                                 | Artifact/service test and implementation type surfaces                 | Typecheck, lint, focused tests                        | PASS                                     |
| Q-03 Preserve cryptographic result independently of later schema quarantine | `xcf-framework-artifact.ts`, `xcf-framework-registry.ts`, focused test | Artifact/service tests, typecheck, lint/build surface | Focused `28/28`, typecheck and lint PASS |

## Disposition

`RTM = COMPLETE`
`EVIDENCE_COMPLETENESS = PASS`
`MANDATORY_NOT_EXECUTED = 0`
`MANDATORY_FAILED = 0`
`KNOWN_MATERIAL_DEFECTS = NONE`
`M1_DOD = SATISFIED`

Staging, commit, push, pull request, merge and deployment remain `NONE` / `NOT_AUTHORIZED`.
