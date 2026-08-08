# ADR-0001: Repository architecture

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-I-1.4`, `VOL-II-2.4–2.7`, `VOL-VII-7.1–7.10`, `VOL-VIII-8.3`

## Context and criteria

ACS needs shared contracts, synchronized vertical slices, reproducible builds, centralized
quality gates, and the ability to extract deployable services without creating duplicate
sources of truth. Criteria: security, scalability, maturity, maintenance, observability,
Kubernetes support, developer productivity, licensing, and vendor independence.

## Alternatives

- Repository per service: strong isolation, but premature coordination and versioning cost.
- Unstructured single repository: simple initially, but weak boundaries and build scaling.
- Workspace monorepo: shared governance and contracts with explicit package/service boundaries.

## Decision

Use a pnpm workspace monorepo with Turborepo task orchestration:

- `apps/` user-facing deployables;
- `services/` backend deployables;
- `packages/` shared technical contracts and libraries;
- `database/`, `infrastructure/`, `tests/`, `tools/`, and `docs/` as governed areas.

Begin as a modular platform with one technical API service. New services require ECOM owner,
EDIM contract, operational justification, and an ADR.

## Consequences and risks

Build boundaries and dependency direction must be enforced. A monorepo can become coupled if
packages expose internals, so only stable contracts may cross boundaries. pnpm and Turborepo
are MIT licensed; versions and the lockfile are pinned.

## Validation

`pnpm install --frozen-lockfile`, Turbo build/lint/typecheck/test graph, and workspace boundary
review. References: https://pnpm.io/workspaces and https://turborepo.com/docs.
