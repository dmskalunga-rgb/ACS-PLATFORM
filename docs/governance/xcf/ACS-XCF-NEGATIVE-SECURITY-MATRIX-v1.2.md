# ACS-XCF negative-security matrix v1.2

Status: `APPROVED_FUTURE_IMPLEMENTATION_GATE`

All cases use production authorization, persistence and validation boundaries. A denial must be
fail-closed, generic where existence is sensitive, transactionally audited where applicable, and
must emit no success event or unauthorized evidence. Current result for every case is
`NOT_EXECUTED`.

| ID            | Attack or misuse                                            | Expected invariant                                 | Evidence required                              | Milestone |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- | --------- |
| `XCF-NEG-001` | Cross-tenant read                                           | No row, graph node or existence disclosure         | FORCE RLS and API denial                       | M1–M8     |
| `XCF-NEG-002` | Cross-tenant write                                          | No mutation, audit/outbox success or side effect   | Transaction rollback and RLS proof             | M1–M8     |
| `XCF-NEG-003` | Missing, invalid or expired trusted tenant context          | Request denied before domain access                | Context validation trace                       | M1–M8     |
| `XCF-NEG-004` | Client-spoofed tenant/membership                            | Server context remains authoritative               | Authorization and context evidence             | M1–M8     |
| `XCF-NEG-005` | AuthorizationPort bypass                                    | Protected operation denied                         | Canonical decision and no mutation             | M1–M8     |
| `XCF-NEG-006` | MPA bypass or same-human incompatible approvals             | Sensitive operation denied                         | Approval/attestation rejection                 | M1–M8     |
| `XCF-NEG-007` | Untrusted source identity or source spoofing                | Import quarantined or rejected                     | Source trust and audit evidence                | M1        |
| `XCF-NEG-008` | Unauthorized global source/version activation               | Activation denied                                  | MPA/authorization and unchanged active version | M1        |
| `XCF-NEG-009` | Unauthorized tenant fact promoted to global                 | Promotion denied                                   | Ownership and scope proof                      | M1–M3     |
| `XCF-NEG-010` | Signature or hash mismatch                                  | Artifact rejected and quarantined                  | Integrity verification evidence                | M1        |
| `XCF-NEG-011` | Stale-version substitution                                  | Stale fact/mapping cannot become active            | Version binding evidence                       | M1–M3     |
| `XCF-NEG-012` | Mapping poisoning or unsupported equivalence                | Mapping rejected or remains unapproved             | Review policy and provenance                   | M2        |
| `XCF-NEG-013` | Revoked source/mapping reused                               | Revoked object rejected                            | Revocation-time decision evidence              | M1–M3     |
| `XCF-NEG-014` | Graph traversal leaks foreign/global-restricted data        | Result excludes unauthorized nodes/edges           | Query authorization and RLS proof              | M3        |
| `XCF-NEG-015` | DecisionEvidence tamper/detachment                          | Decision invalidated; no action                    | XCAP-005 integrity/custody proof               | M5–M8     |
| `XCF-NEG-016` | AI Gateway/model/provider substitution                      | Request fails closed; no direct fallback           | Provider contract and failure evidence         | M6        |
| `XCF-NEG-017` | Prompt/context injection via source/evidence                | Content remains data and cannot alter policy/tools | Redaction and policy-bound output              | M6        |
| `XCF-NEG-018` | Private graph/evidence exfiltration via output or telemetry | Sensitive content absent                           | Output/event/log inspection                    | M3–M8     |
| `XCF-NEG-019` | Autonomous response from recommendation                     | No operation executes                              | MPA and operation-bound authorization proof    | M7        |
| `XCF-NEG-020` | Replay or divergent idempotency-key reuse                   | Exact replay stable; divergent reuse conflicts     | Receipt/transaction evidence                   | M1–M8     |
| `XCF-NEG-021` | Direct database role broadens tenant/global access          | Least privilege and FORCE RLS deny                 | Role matrix and SQL proof                      | M1–M8     |
| `XCF-NEG-022` | Raw sensitive evidence in normal event/audit/log            | Payload rejected or redacted                       | Event schema and telemetry inspection          | M1–M8     |

`NEGATIVE_CASES = 22`

`NEGATIVE_CASES_EXECUTED = 0`

`SECURITY_WAIVERS = NONE`
