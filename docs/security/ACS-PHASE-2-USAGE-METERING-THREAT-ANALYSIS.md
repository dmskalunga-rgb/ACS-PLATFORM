# ACS Phase 2 — Usage / Metering Threat Analysis

Status: `PLANNED`; this document is a DoR control target, not implementation evidence.

| Threat                                                 | Required control                                                                                                      | Future proof                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Source impersonation / machine credential compromise   | Separate machine authentication, source authorization, revocation, server-bound tenant identity, fail closed.         | USG-POS-001; USG-NEG-002–003                |
| Tenant escape, BOLA, or origin substitution            | Server-resolved tenant → Subscription → Entitlement; OIDC/AuthorizationPort/trusted context/RLS/FORCE RLS.            | USG-POS-002, 008; USG-NEG-001, 003–005, 011 |
| Replay or duplicate-measurement fraud                  | Distinct API idempotency and source-scoped deduplication; divergent payload conflict.                                 | USG-POS-003–004, 010; USG-NEG-008, 010      |
| Timestamp manipulation / late-arrival abuse            | Separate UTC event/received/processing times; explicit skew, future-time, and late-arrival policy.                    | USG-POS-005; USG-NEG-007                    |
| Payload, schema, unit, value, or oversized-input abuse | Version/type/unit/value validation, bounded payloads, rate limits, and safe rejection.                                | USG-NEG-006                                 |
| Correction abuse or history destruction                | Append-only compensating corrections, authorization/SoD, immutable originals, concurrency control.                    | USG-POS-006; USG-NEG-009–010, 013           |
| Aggregation poisoning                                  | Reproducible aggregation from accepted raw facts and corrections only; no mutable commercial-origin reinterpretation. | USG-POS-007; USG-NEG-010                    |
| Audit/outbox suppression                               | Atomic raw/history/audit/outbox/idempotency transaction with TEST_ONLY rollback proof.                                | USG-POS-009; USG-NEG-012                    |
| Event replay / duplicate consumer effect               | Event Foundation consumer idempotency, retry, DLQ, controlled replay, and tenant-safe payloads.                       | USG-POS-009; USG-NEG-010, 014               |
| Financial-boundary escalation                          | Explicit absence of rating, financial, quota, and downstream authorities.                                             | USG-NEG-015                                 |
