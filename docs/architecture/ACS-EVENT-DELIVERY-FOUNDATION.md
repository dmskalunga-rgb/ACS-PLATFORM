# ACS Event Delivery & Operational Lifecycle Foundation

Status: `IMPLEMENTED_PENDING_FINAL_CI`

Sources: VOL-VII-7.7, ADR-0006, human governance disposition PR #6 comment `5328117974`.

## Boundary

The pre-Phase-2 foundation implements:

`Domain transaction → immutable transactional outbox → delivery state → publisher → transport port → idempotent consumer → audit/observability`.

It contains no Commercial entity, workflow, API, role, schema, or broker selection. The included
in-memory transport is `TEST_ONLY` and is not production infrastructure.

## Components

| Component                          | Responsibility                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `platform.domain_events`           | Existing immutable canonical outbox and versioned envelope                      |
| `platform.event_deliveries`        | Mutable claim/lease, retry, publish, DLQ, replay, and retention state           |
| `EventTransportPort`               | Broker-neutral transport boundary                                               |
| `OutboxPublisher`                  | Bounded claim, transport publish, acknowledgement, retry/DLQ, graceful shutdown |
| `platform.consumer_event_receipts` | Tenant-aware atomic consumer deduplication                                      |
| `ControlledReplayService`          | Step-up marker, AuthorizationPort, bounded reason, controlled repository call   |
| `platform.event_lifecycle_audit`   | Append-only failure/replay/cleanup evidence                                     |

## Lifecycle and invariants

Delivery states are `PENDING`, `PROCESSING`, `RETRY_PENDING`, `PUBLISHED`, and
`DEAD_LETTERED`. `PROCESSING` requires a claim token, worker, and finite lease. `PUBLISHED` and
`DEAD_LETTERED` have unambiguous terminal timestamps. Retry attempts and replay attempts are
bounded.

PostgreSQL claims eligible rows with `FOR UPDATE SKIP LOCKED`. The claim transaction finishes
before transport I/O. Expired leases become eligible again. A crash after broker acceptance but
before local acknowledgement may publish a duplicate; this is the deliberate at-least-once
boundary. Consumers therefore acquire tenant/event-scoped receipts atomically and do not repeat a
completed mutation.

## Retry, DLQ, and replay

Retryable and terminal errors are explicit. Exponential retry is capped by configured safe bounds;
there is no infinite retry. Exhaustion and terminal failures enter `DEAD_LETTERED` without payload
logging or deletion.

Replay requires step-up satisfaction, server-side `AuthorizationPort` approval, tenant/event
match, eligible DLQ state, a bounded reason, correlation, append-only audit, and a replay-count
limit. The PostgreSQL operator role can execute only the replay function and has no direct table
mutation privilege.

## Retention

Published-event and processed-receipt retention values are configurable and bounded; no business
or regulatory duration is asserted. Cleanup uses bounded `SKIP LOCKED` batches, excludes active,
retrying, and dead-letter events, and emits lifecycle audit records. Trusted-grant cleanup remains
separate and `REQUIRED_BEFORE_PRODUCTION`.

## Tenant and security boundary

All operational rows carry tenant scope. Tenant tables use RLS and FORCE RLS. Runtime roles use
execute-only security-definer functions and have no direct table access. Metrics contain only
bounded outcomes and aggregate gauges; tenant, event, actor, and payload values are prohibited as
labels. Payloads are JSON objects capped at 256 KiB by PostgreSQL and validated by the canonical
envelope before publication/consumption.

Event operational privileges never imply Commercial, Finance, Tenant Administrator, Security
Administrator, or Auditor authority. Concrete Phase 2 roles do not exist in this foundation.

## Health and ordering

Publisher/transport degradation is separate from application liveness. A transport outage is a
recoverable degraded delivery condition. No global ordering is implemented or claimed. A future
event contract may define ordering only for an explicit aggregate/business/partition key.

## Recovery and rollback

The migration is additive and has a tested rollback/reapply script. Rollback removes only Event
Foundation state and restores the original append-only outbox trigger. Operational rollback after
real delivery data exists requires backup/evidence review; production remains forward-only.
