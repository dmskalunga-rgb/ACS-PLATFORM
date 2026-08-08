# ACS Platform

ACS is an enterprise AI-driven cyber-defense platform. Phase 0 contains only the engineering
`FOUNDATION`; functional domain development has not started.

The authoritative source is the ACS Master Engineering Specification, Baseline Enterprise
v5.3 under `docs/baseline/`. Execution and implementation records never silently override it.

## Repository

- `apps/web/` — technical React application shell;
- `services/platform-api/` — technical Fastify health/observability service;
- `packages/` — shared contracts, tenant context, observability, and AI boundary;
- `database/` — technical migration, rollback, SQL, and RLS tests;
- `infrastructure/` — local Compose and portable Kubernetes base;
- `tests/` — cross-component test structure;
- `docs/` — baseline, governance, architecture, standards, traceability, and evidence.

## Local development

Prerequisites: Node.js 24 LTS, pnpm 11.16, Docker Desktop for database/container checks, and
kubectl with Kustomize for manifest rendering.

```powershell
git clone https://github.com/dmskalunga-rgb/ACS-PLATFORM.git
Set-Location ACS-PLATFORM
git switch develop
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

The example contains local-only values. Start the disposable database and technical services:

```powershell
docker compose up -d postgres
pnpm dev
```

Run validation:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
$env:ACS_ENV='test'
$env:DATABASE_URL='postgresql://acs_local:acs_local_only@localhost:5432/acs_foundation'
pnpm db:validate
kubectl kustomize infrastructure/kubernetes/base
```

Use `docker compose down` afterward. The database validator rejects production and database
names other than the disposable `acs_foundation` database. The application shell defaults to
`http://localhost:5173`; API probes are `http://localhost:3000/health`, `/live`, `/ready`,
`/metrics`, and `/openapi.json`.

## Git policy

`main` is stable and protected; `develop` is the integration branch. Work uses a traced,
short-lived branch and reviewed pull request. Never force-push protected branches, bypass
checks, commit secrets, or claim unexecuted validation.
