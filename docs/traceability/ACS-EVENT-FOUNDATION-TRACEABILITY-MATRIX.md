# ACS Event Foundation Traceability Matrix

Status: `IMPLEMENTED_PENDING_FINAL_CI`

No row creates a normative `ACS-REQ` identifier.

| Baseline/governance                   | Requirement                          | Architecture                            | Data/implementation                                  | Security/test                                                     | Evidence                  | Status           |
| ------------------------------------- | ------------------------------------ | --------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- | ---------------- |
| VOL-VII-7.7; ADR-0006                 | Versioned tenant event envelope      | `ACS-EVENT-DELIVERY-FOUNDATION.md`      | Existing `domain_events`; canonical contracts        | Envelope/schema and payload-bound tests                           | Event Foundation evidence | `VERIFIED_LOCAL` |
| VOL-VII-7.7; PR #6 comment 5328117974 | At-least-once publisher              | `EventTransportPort`, `OutboxPublisher` | `event_deliveries`; PostgreSQL adapter               | Concurrency, lease recovery, duplicate boundary                   | Event Foundation evidence | `VERIFIED_LOCAL` |
| VOL-VII-7.7                           | Bounded retry and DLQ                | Explicit delivery state machine         | Attempt/schedule/error/terminal timestamps           | Retry exhaustion and terminal classification                      | Event Foundation evidence | `VERIFIED_LOCAL` |
| VOL-VII-7.7; MFA policy boundary      | Controlled replay                    | `ControlledReplayService`               | Replay function and lifecycle audit                  | Step-up, authorization, tenant, eligibility, reason, replay limit | Event Foundation evidence | `VERIFIED_LOCAL` |
| VOL-VII-7.7                           | Idempotent consumers                 | `IdempotentEventConsumer`               | `consumer_event_receipts`                            | Atomic duplicate suppression and version rejection                | Event Foundation evidence | `VERIFIED_LOCAL` |
| VOL-VI-6.1–6.9                        | Tenant isolation and least privilege | Separate operational roles              | FORCE RLS; execute-only functions                    | Wrong-tenant replay and privilege tests                           | DB validation             | `VERIFIED_LOCAL` |
| VOL-VII-7.10; ADR-0009                | Safe audit/observability             | Lifecycle audit and telemetry port      | Append-only audit; aggregate Prometheus signals      | No high-cardinality tenant/event/user labels                      | Event Foundation evidence | `VERIFIED_LOCAL` |
| Human operational disposition         | Outbox/idempotency retention         | Bounded cleanup design                  | Published events and expired processed receipts only | Cleanup/concurrency/rollback-reapply tests                        | Event Foundation evidence | `VERIFIED_LOCAL` |

Phase 2 remains `NOT_AUTHORIZED`. Global ECOM/EDIM/EDOLM completeness, named owners, individual
ACS-REQ identifiers, QG-18–QG-22, baseline custody, SLOs, and commit-signing enforcement remain
open.
