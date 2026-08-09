# Phase 0 Final Engineering Validation Evidence

- Source: `VOL-II-2.4-2.7`, `VOL-III-3.2`, `VOL-VI-6.1-6.9`,
  `VOL-VII-7.1-7.10`, and `VOL-VIII-8.3`
- Date: 2026-08-09
- Technical source commit: `b0055259f3cd31935f5a86676bb24c949eb3db00`
- Branch: `infra/phase-0-engineering-foundation`
- GitHub Actions run: `31288548847`
- Run interval: 2026-08-09 01:34:30 UTC through 01:35:47 UTC
- Environment: Windows local workspace, Docker Desktop, PostgreSQL 17, and
  GitHub-hosted Ubuntu runners
- Owner: ACS Engineering; governance approval remains separate
- Redaction: no credentials, tokens, production data, or sensitive payloads are included

This record supersedes failed results for promotion purposes without deleting the historical
record in `LOCAL-AND-CI-VALIDATION.md`.

## CI results

| Job                                       |        Job ID | Result     |
| ----------------------------------------- | ------------: | ---------- |
| Quality foundation                        | `93181665664` | `VERIFIED` |
| Secret scanning                           | `93181665670` | `VERIFIED` |
| PostgreSQL migration and tenant isolation | `93181665672` | `VERIFIED` |
| CodeQL SAST                               | `93181665673` | `VERIFIED` |
| SCA and SBOM                              | `93181665678` | `VERIFIED` |
| Container and IaC scanning                | `93181671612` | `VERIFIED` |

The workflow conclusion for run `31288548847` is `success`. Container builds, filesystem
and IaC scanning, and both image scans completed in the mandatory workflow.

## Engineering validation

| Control           | Command or evidence                                | Result     |
| ----------------- | -------------------------------------------------- | ---------- |
| Formatting        | `pnpm format:check`                                | `VERIFIED` |
| Lint              | `pnpm lint`; 9/9 tasks                             | `VERIFIED` |
| Type checking     | `pnpm typecheck`; 9/9 tasks                        | `VERIFIED` |
| Tests             | `pnpm test`; 14/14 tests                           | `VERIFIED` |
| Build             | `pnpm build`; 6/6 builds                           | `VERIFIED` |
| SCA               | `pnpm audit --audit-level high`                    | `VERIFIED` |
| Filesystem scan   | Trivy, HIGH/CRITICAL gate                          | `VERIFIED` |
| IaC/config scan   | Trivy config, HIGH/CRITICAL gate                   | `VERIFIED` |
| Secret scan       | Gitleaks CI and local Trivy                        | `VERIFIED` |
| Kubernetes render | `kubectl kustomize infrastructure/kubernetes/base` | `VERIFIED` |

## PostgreSQL and multi-tenancy

`pnpm db:validate` ran against a disposable PostgreSQL 17 database locally and in job
`93181665672`. Migration, RLS, tenant isolation, and tenant escape prevention returned
`VERIFIED`.

## Security remediation closure

### DS-0002

- Original finding: Trivy `DS-0002`, HIGH, container running without an explicit non-root
  user in `apps/web/Dockerfile`.
- Initial correction: `USER 101:101` in commit
  `9de341615d94400ca565d543a204c84817e92365`.
- Runtime correction: ownership for Nginx cache, logs, runtime paths, and static content;
  UID/GID-aware tmpfs mounts; Docker healthcheck; Kubernetes liveness/readiness probes.
- Runtime evidence: UID/GID `101:101`, user `nginx`, Docker health `healthy`, `/` returned
  HTTP 200, and `/api/health` returned HTTP 200.
- Final state: `RESOLVED_VERIFIED` by run `31288548847`.

### API runtime vulnerabilities

- Before: one CRITICAL and six HIGH findings from npm-related tooling included in the Node
  runtime image.
- Remediation: npm, npx, corepack, pnpm, pnpx, and their global runtime packages were
  removed; the Node executable and application production dependencies were preserved.
- Runtime evidence: user `acs`, UID `10001`, healthy API response.
- After: zero CRITICAL and zero HIGH findings in the local image scan; the corresponding
  mandatory CI image scan passed.
- Final state: `RESOLVED_VERIFIED`.

## Container evidence

| Image | Runtime identity           | Local image digest                                                        | HIGH/CRITICAL | Result     |
| ----- | -------------------------- | ------------------------------------------------------------------------- | ------------: | ---------- |
| API   | `acs`, UID `10001`         | `sha256:8bcf86eb58998c19775d53d089b4e494d465841be261bc2585ab5765f7268142` |             0 | `VERIFIED` |
| Web   | `nginx`, UID/GID `101:101` | `sha256:27b7332276ef368f4928c2008faf695eb0a3f7f9415609be09b884042eaea429` |             0 | `VERIFIED` |

Both runtime bases remain pinned by digest in their Dockerfiles. The image digests above
identify the locally built validation images; CI independently rebuilt and scanned the
images from the source commit.

## SBOM evidence

- Generator command: `pnpm sbom:generate`
- Format: CycloneDX JSON
- CI artifact: `phase-zero-sbom`
- CI artifact ID: `9030633860`
- CI artifact size: 60,177 bytes
- CI artifact digest: `sha256:175eeea182f2d99012b2d4a252e095dfdbc4570f1a0d25c88b79a40e67b80cb0`
- CI result: `VERIFIED`, job `93181665678`
- Local SBOM SHA-256:
  `CD8DF9628C4F9977A82F92086ED3B93E15C11514E79F279433C7060FB6E2C684`

The CI artifact digest and local file hash identify artifacts packaged in different
environments and are intentionally recorded separately.

## Architecture and standards evidence

ADR-0001 through ADR-0010 record repository, frontend, backend, data, API, event, identity,
AI Gateway boundary, observability, and deployment decisions. Engineering, database, API,
event, testing, observability, DevSecOps, Quality Gate, and evidence standards are tracked
under `docs/engineering/`, `docs/security/`, `docs/governance/`, and `docs/evidence/`.

## Boundary statement

This evidence validates the Phase 0 engineering foundation only. It does not declare the
ACS product complete, freeze the v5.3 baseline, approve QG-34, authorize production, close
baseline-wide governance gaps, or authorize Phase 1.
