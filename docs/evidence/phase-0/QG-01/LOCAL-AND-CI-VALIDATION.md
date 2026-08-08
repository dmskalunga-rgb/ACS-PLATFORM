# Phase 0 Foundation Validation Evidence

- Source: Phase 0 authorization; `VOL-II-2.4-2.7`, `VOL-VI-6.1-6.9`,
  `VOL-VII-7.1-7.10`, `VOL-VIII-8.3`
- Timestamp: 2026-08-09 (Africa/Luanda)
- Owner: ACS Engineering (implementation evidence; governance approval pending)
- Branch: `infra/phase-0-engineering-foundation`
- Source commit: `d3abe2b353b1481205a13df926452e0c4729ce93`
- Environment: Windows local workspace; GitHub-hosted Ubuntu runner
- Redaction: no credentials, tokens, production data, or sensitive payloads included

| Validation                                         | Result     | Evidence                                                                                           |
| -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                | `VERIFIED` | Prettier: all matched files compliant                                                              |
| `pnpm lint`                                        | `VERIFIED` | 9/9 Turbo tasks                                                                                    |
| `pnpm typecheck`                                   | `VERIFIED` | 9/9 Turbo tasks                                                                                    |
| `pnpm test`                                        | `VERIFIED` | 14 tests passed across contracts, tenant context, observability, API, configuration, and web shell |
| `pnpm build`                                       | `VERIFIED` | 6/6 workspace builds                                                                               |
| PostgreSQL migration/RLS/isolation                 | `VERIFIED` | PostgreSQL 17 disposable database returned migration/RLS/tenant_isolation VERIFIED                 |
| `kubectl kustomize infrastructure/kubernetes/base` | `VERIFIED` | Manifests rendered without warning                                                                 |
| `pnpm audit --audit-level high`                    | `VERIFIED` | No known vulnerabilities reported                                                                  |
| CycloneDX SBOM                                     | `VERIFIED` | 388,847 bytes; SHA-256 `BAC242405D935A61E2095CD6C7E00032480AEC7E142F63C62645A15D4B9EB3E3`          |
| Git integrity/private-key marker check             | `VERIFIED` | `git fsck --full` clean; no private-key markers                                                    |
| Local container build                              | `FAILED`   | Command exceeded 300 seconds before producing an image; no success claimed                         |
| GitHub Actions run `31283387146`                   | `FAILED`   | Five jobs succeeded; Container and IaC scanning failed at initial Trivy filesystem scan            |

GitHub job results:

- Quality foundation: `VERIFIED`;
- PostgreSQL migration and tenant isolation: `VERIFIED`;
- CodeQL SAST: `VERIFIED`;
- Secret scanning: `VERIFIED`;
- SCA and SBOM: `VERIFIED`;
- Container and IaC scanning: `FAILED` (job `93168180154`).

Detailed job logs require authenticated repository administration and `gh` is not installed.
Public annotations expose only exit code 1. Exact finding reproduction with Trivy 0.69.3 timed
out locally; no suppression or speculative correction was applied.
