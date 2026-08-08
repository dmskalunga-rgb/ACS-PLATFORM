# ACS Platform

ACS is an enterprise AI-driven cyber-defense platform. This repository is
prepared for governed implementation; functional development has not started.

**Authoritative Baseline: ACS-MASTER-ENGINEERING-SPECIFICATION — Baseline Enterprise v5.3**

The specification in `docs/baseline/` is the normative Single Source of Truth.
Execution prompts and governance material support delivery but do not override
the baseline. Read the baseline before proposing or implementing any change.

## Repository structure

- `docs/` — baseline, governance, architecture, requirements, decisions, traceability, operations, and evidence.
- `frontend/` and `backend/` — application areas reserved for governed implementation.
- `database/` — schemas, migrations, and database tests.
- `infrastructure/` — deployment and environment definitions.
- `integrations/` and `agents/` — governed integration and agent components.
- `tests/` — cross-component validation.

## Development prerequisites

Before development begins:

1. Read the authoritative v5.3 baseline and the governance documents indexed in `docs/README.md`.
2. Complete repository assessment, gap analysis, and requirements traceability.
3. Keep credentials out of Git and follow `SECURITY.md`.
4. Use the toolchain and version constraints selected during the architecture assessment; none are prescribed by this bootstrap.

## Branch policy

- `main` represents stable, approved production history.
- `develop` is the integration branch for approved delivery work.
- Use short-lived `feature/`, `fix/`, `security/`, `infra/`, `docs/`, `release/`, or `hotfix/` branches as appropriate.
- Merge through reviewed pull requests with required CI and security checks. Force pushes and branch deletion should be disabled for `main`.
