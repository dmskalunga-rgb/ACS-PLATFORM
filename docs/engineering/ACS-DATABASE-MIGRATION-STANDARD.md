# ACS Database Migration Standard

Status: `IMPLEMENTATION_DEFINED`, pending controlled review

Source: `VOL-VI-6.1-6.9`, `VOL-VII-7.5`, ADR-0004.

- Name files `YYYYMMDDHHMMSS_<lower_snake_case>.sql`; ordering is lexical and immutable.
- Production changes are forward-only. Provide a reviewed safe rollback or document
  roll-forward recovery and restore requirements.
- Never edit an applied migration; correct it with a new one.
- Destructive/locking changes require impact analysis, backup/restore evidence, staged rollout,
  approval, and tested recovery.
- Use explicit keys, ownership, constraints, classification, retention, and justified indexes.
- Tenant rows require non-null `tenant_id`, indexed tenant paths, forced RLS, least-privilege
  roles, and positive plus negative isolation tests.
- Tenant context is transaction-local. Pools cannot retain tenant/actor context. Privileged
  roles are distinct, narrowly scoped, and audited.

CI applies migrations to an empty supported PostgreSQL instance, executes SQL/RLS/isolation
tests, and records checksum, version, command, commit, environment, and actual result.
