# ACS-XCF failure-injection matrix v1.2

Status: `APPROVED_FUTURE_IMPLEMENTATION_GATE`

Each case must use the real production code boundary and prove bounded failure, rollback, audit,
outbox consistency, retry/idempotency behavior, evidence integrity and absence of unauthorized
fallback. Current result for every case is `NOT_EXECUTED`.

| ID           | Injected failure                                 | Required behavior                                   | Evidence required                         | Milestone |
| ------------ | ------------------------------------------------ | --------------------------------------------------- | ----------------------------------------- | --------- |
| `XCF-FI-001` | PostgreSQL unavailable                           | Fail closed; no in-memory authority                 | Bounded error and no side effect          | M1–M8     |
| `XCF-FI-002` | Source timeout                                   | Import aborts or remains retryable, never active    | Receipt/audit state                       | M1        |
| `XCF-FI-003` | Transaction abort                                | Data, audit and outbox roll back together           | Database transaction proof                | M1–M8     |
| `XCF-FI-004` | Deadlock/serialization conflict                  | Bounded retry or conflict, no duplicate             | Concurrency trace                         | M1–M8     |
| `XCF-FI-005` | Integrity verification failure                   | Artifact quarantined; no parsing/activation         | Hash/signature evidence                   | M1        |
| `XCF-FI-006` | Partial download                                 | Partial bytes never become a release                | Storage/receipt inspection                | M1        |
| `XCF-FI-007` | Parser/schema failure                            | Version rejected with bounded reason                | Validation and audit evidence             | M1        |
| `XCF-FI-008` | Quarantine persistence failure                   | Whole import fails; no active artifact              | Transaction proof                         | M1        |
| `XCF-FI-009` | Activation transaction failure                   | Prior active version remains authoritative          | Version and rollback proof                | M1        |
| `XCF-FI-010` | Mapping persistence failure                      | No partial mapping/provenance                       | Transaction proof                         | M2        |
| `XCF-FI-011` | Canonical audit append failure                   | Governed mutation rolls back                        | Data/audit atomicity                      | M1–M8     |
| `XCF-FI-012` | Outbox append failure                            | Governed mutation rolls back                        | Data/outbox atomicity                     | M1–M8     |
| `XCF-FI-013` | Evidence reference unavailable or invalid        | Derived result/action fails closed                  | XCAP-005 resolution evidence              | M5–M8     |
| `XCF-FI-014` | AuthorizationPort unavailable                    | Protected operation denied                          | No fallback proof                         | M1–M8     |
| `XCF-FI-015` | MPA unavailable/rejected/expired                 | Sensitive operation not executed                    | MPA decision evidence                     | M1–M8     |
| `XCF-FI-016` | AI Gateway unavailable or model result malformed | No direct-provider fallback or authoritative result | Gateway and schema failure evidence       | M6        |
| `XCF-FI-017` | Graph traversal timeout/limit exceeded           | Bounded incomplete response; no leaked partial data | Query limit and telemetry proof           | M3        |
| `XCF-FI-018` | Recovery/rollback failure                        | Escalate fail-closed; preserve immutable evidence   | Recovery log, audit and operator decision | M8        |

`FAILURE_INJECTION_CASES = 18`

`FAILURE_INJECTION_CASES_EXECUTED = 0`

`AUTOMATIC_REMEDIATION_AUTHORIZED = NO`
