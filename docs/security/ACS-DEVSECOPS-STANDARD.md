# ACS DevSecOps and Software Supply Chain Standard

Status: `IMPLEMENTATION_DEFINED`, pending Security and Governance review

Sources: `VOL-I-1.4`, `VOL-III-3.2`, `VOL-V-5.23`, `VOL-VIII-8.3`.

Pull requests use least-privilege permissions and pinned actions. Applicable gates include
format, lint, types, build, tests, migration/RLS validation, secret scanning, SAST, SCA, SBOM,
container scanning, and IaC scanning.

| Control        | Tool                 | Purpose                                  | License                 |
| -------------- | -------------------- | ---------------------------------------- | ----------------------- |
| Secrets        | Gitleaks             | Content/history credential patterns      | MIT                     |
| SAST           | CodeQL               | Semantic analysis for selected languages | GitHub terms            |
| SCA            | pnpm audit and Trivy | Advisory/vulnerability detection         | npm service; Apache-2.0 |
| SBOM           | pnpm CycloneDX       | Lockfile inventory                       | MIT                     |
| Containers/IaC | Trivy                | Image and manifest findings              | Apache-2.0              |

Versions/actions are pinned and reviewed. Findings are not suppressed without a tracked
rationale, owner, approver, compensating control, and expiry. A scan is evidence, not proof of
absence; unavailable scans are `NOT_EXECUTED`.

Frozen lockfiles, digest-pinned minimal non-root images, immutable commit-addressed artifacts,
and SBOMs are mandatory. Signing and build provenance are required before production but remain
`NOT_IMPLEMENTED` in Phase 0 because no approved identity or artifact registry exists.

Secrets use protected CI/environment storage or external workload identity, never arguments,
Git, images, manifests, logs, or evidence. Exposure triggers revocation/rotation, incident
handling, history assessment, and consumer review.
