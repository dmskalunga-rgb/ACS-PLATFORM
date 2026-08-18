# ACS Event Delivery & Operational Lifecycle Foundation Evidence

Status: `LOCAL_VALIDATION_VERIFIED_REMOTE_CI_PENDING`

- Starting checkpoint: `develop@8698fe43ae7c4a1f2e3d2d86ae5f1e9dda60d7a2`
- Branch: `feat/pre-phase-2-event-delivery-foundation`
- Governance: PR #6 comment `5328117974`
- Phase 2: `NOT_AUTHORIZED`
- Broker: `NOT_SELECTED`
- Production transport adapter: `NOT_IMPLEMENTED`

## Implemented evidence boundary

- Existing `platform.domain_events` remains the sole immutable outbox.
- Separate delivery state provides bounded claim/lease, retry, publish, DLQ, replay, and cleanup.
- `EventTransportPort` keeps application logic broker-neutral.
- `TestOnlyInMemoryEventTransport` is deterministic evidence tooling, not production transport.
- Consumer receipts provide tenant/event/consumer-scoped duplicate suppression.
- Replay requires assurance marker, AuthorizationPort approval, tenant eligibility, reason,
  correlation, audit, and a bounded replay count.
- Publisher, consumer, operator, and retention roles have execute-only functions and no direct
  lifecycle-table privileges.

## Local validation

| Gate                             | Result     | Evidence                                                                                                        |
| -------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| Event Foundation unit tests      | `VERIFIED` | 10 tests: publish, retry/DLQ, bounded backoff, duplicate boundary, health, consumer idempotency/version, replay |
| PostgreSQL fresh migration       | `VERIFIED` | `pnpm db:validate` on disposable PostgreSQL 17                                                                  |
| PostgreSQL rollback/reapply      | `VERIFIED` | Event migration rollback, reapply, and lifecycle test repeated                                                  |
| Existing RLS/security regression | `VERIFIED` | Phase 0/1 DB validator remained green                                                                           |
| Event PostgreSQL E2E             | `VERIFIED` | 5 tests: publisher, concurrent workers, lease recovery, replay, retention, baseline                             |
| Transport semantics              | `VERIFIED` | At-least-once duplicate demonstrated after transport acceptance/ack failure                                     |
| Tenant isolation                 | `VERIFIED` | Wrong-tenant replay denied; no direct operational table privileges                                              |
| Retention                        | `VERIFIED` | Only expired published events and processed receipts removed                                                    |
| Remote CI                        | `PENDING`  | Final branch HEAD not yet published/validated                                                                   |

No documentation-only check is treated as functional proof. Final run IDs, job IDs, SHA, and
conclusions must be added only after remote CI executes on the final evidence HEAD.

## Failure, concurrency, and crash matrix

| Scenario                                                | Expected/observed result                           |
| ------------------------------------------------------- | -------------------------------------------------- |
| Transient transport failure                             | Bounded `RETRY_PENDING` with next attempt          |
| Permanent/malformed event                               | `DEAD_LETTERED`, observable and retained           |
| Two publishers                                          | Disjoint `SKIP LOCKED` claims; no state corruption |
| Crash before publish                                    | Lease expires and another worker reclaims          |
| Crash after publish/before ack                          | Possible duplicate; consumer idempotency required  |
| Duplicate consumer delivery                             | Handler not repeated after completed receipt       |
| Wrong tenant/unauthorized/insufficient assurance replay | Fail closed                                        |
| Cleanup versus active lifecycle                         | Pending/retry/DLQ/processing records preserved     |

## Local performance characterization

These disposable PostgreSQL results are an engineering baseline only, not an enterprise SLO or
capacity claim:

| Scenario          |    Volume |  Elapsed |
| ----------------- | --------: | -------: |
| Publish lifecycle | 50 events | 58.99 ms |
| Retention cleanup | 50 events | 16.95 ms |
| Retry transition  |   1 event |  7.90 ms |

## Remaining technical risks

- A production broker and adapter are intentionally not selected or implemented.
- Broker IAM, network, credential, quota, partitioning, and adapter-specific resilience remain
  subject to a separate decision.
- Production `acr`/`amr` mapping and Identity Provider lifecycle remain pending.
- Enterprise SLOs and approved retention periods remain governance decisions.
- Trusted-grant cleanup remains `REQUIRED_BEFORE_PRODUCTION` and outside this slice.
