# ACS Engineering Standards

Status: `IMPLEMENTATION_DEFINED`, pending controlled review

Authority: subordinate to ACS Enterprise v5.3. If it conflicts with the baseline, the baseline
prevails and the conflict enters the Gap Register.

## Requirement references

Until governance assigns individual `ACS-REQ` identifiers, work uses stable references in the
form `VOL-<roman>-<section>` and, for domains, `VOL-V-5.<domain>`. This must not renumber or
amend the baseline. Every change links source, ADR, implementation, validation, evidence,
owner, and commit.

## Engineering rules

- Dependencies flow from deployables to stable packages; packages do not import deployables.
- Domain 5.x code requires authorization, ECOM ownership, relevant EDIM/EDOLM entries, tests,
  and a short-lived branch from `develop`.
- Configuration is validated at startup. Secrets never enter defaults, logs, Git, images,
  manifests, fixtures, or evidence.
- TypeScript is strict; untrusted boundaries require runtime schemas and errors fail closed.
- User-facing slices require accessibility, internationalization, responsive layout, and
  explicit loading, empty, error, and disconnected states.
- Commits remain small and traceable; required checks are never bypassed.

## Supply chain and configuration

Runtime, package-manager, direct dependency, action, and container versions are pinned. The
committed `pnpm-lock.yaml` controls frozen installs. CI emits an SBOM. Artifacts are immutable
and source-commit-addressed. SCA, SAST, secret, container, and IaC findings follow the
DevSecOps standard. Signing/provenance remain `NOT_IMPLEMENTED` until a verified identity and
registry exist.

`.env.example` contains names and safe local examples only. Local values use ignored `.env`;
CI uses protected secrets; production uses an approved external secret manager with workload
identity, least privilege, audit, rotation, and revocation.
