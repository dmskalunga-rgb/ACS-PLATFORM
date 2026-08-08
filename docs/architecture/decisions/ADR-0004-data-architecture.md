# ADR-0004: Data architecture

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-II-2.5`, `VOL-VI-6.1-6.9`, `VOL-VII-7.5`

## Context and alternatives

ACS requires PostgreSQL/Supabase-compatible transactions while preserving separate security
lake, graph, vector/AI, and analytics responsibilities. A single universal store would reduce
initial integration but violate workload and governance boundaries. Service-owned databases
immediately would add premature operational fragmentation.

## Decision

Use SQL-first, forward-only PostgreSQL migrations as the transactional foundation. Organize
schemas, migrations, rollbacks, and SQL/RLS tests under `database/`; access is mediated by
repositories and explicit transactions. Every tenant-owned row carries `tenant_id`; the
service sets a transaction-local tenant context and RLS fails closed. Privileged operations
use a distinct audited role. Other data planes remain contracts until their traced phases.

## Consequences, risks, and validation

RLS complements rather than replaces application authorization. Connection pooling must never
leak session context. Migration review, constraints, indexes, rollback plans, PostgreSQL tests,
and cross-tenant negative tests are required. Supabase portability is retained without making
its hosted control plane mandatory.
