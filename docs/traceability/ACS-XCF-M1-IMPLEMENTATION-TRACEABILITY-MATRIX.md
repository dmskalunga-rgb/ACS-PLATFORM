# ACS-XCF M1 implementation traceability matrix

Status: `COMPLETE_LOCAL_IMPLEMENTATION_EVIDENCE`

This matrix is an implementation-evidence overlay for the ten requirements applicable to M1. The
canonical governance documents remain unchanged.

| Requirement | Governance                                     | Implementation / persistence                                                     | Executed test and security evidence                                              | Acceptance / evidence                  |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| XCF-REQ-001 | ADR-XCF-003; source-trust registry; M1 catalog | Contracts, `XcfFrameworkRegistryService`, PostgreSQL publishers/sources/releases | Contracts `4/4`; service/HTTP; DB `12/12`; NEG-007/008/010/013; FI-002/004/005   | AC-001/002/003; qualification evidence |
| XCF-REQ-002 | ADR-XCF-003; TM-01                             | Server-derived bytes/hash/objects; artifacts, releases and objects tables        | Crypto/parser `18/18`; DB provenance; NEG-007/010/022/023/024; FI-005/006/007    | AC-001; qualification evidence         |
| XCF-REQ-003 | ADR-XCF-003; TM-02                             | Immutable release rows, supersession and revocation tables                       | Supersession/revocation DB proof; NEG-011/013/029; FI-009                        | AC-003; qualification evidence         |
| XCF-REQ-004 | ADR-XCF-011; TM-02                             | Release/hash/provenance identity and preserved historical rows                   | Replay, rollback/reapply and NEG-031 restored release digest                     | AC-002/003; qualification evidence     |
| XCF-REQ-014 | ADR-XCF-002; M1/M2 frozen boundary             | Global governance tenant only; no M2 overlay/promotion runtime                   | RLS/FORCE RLS; zero promotion relations/functions; NEG-001/002/004/009/021       | M1 scope proof; qualification evidence |
| XCF-REQ-048 | ADR-XCF-006; TM-14                             | Canonical server tenant context and tenant-bound persistence                     | Canonical cross-tenant denial and context-spoofing SQL proofs                    | Isolation evidence                     |
| XCF-REQ-049 | ADR-XCF-006; TM-14                             | XCAP-005 evidence references only; no raw evidence event payload                 | XCAP-005 `26/26`; zero sensitive XCF event-payload violations                    | Evidence boundary proof                |
| XCF-REQ-052 | ADR-XCF-002; TM-14                             | RLS + FORCE RLS on every XCF table and least-privilege runtime role              | Canonical DB validation, direct-bypass denial, NEG-021 and restored DB RLS proof | Database qualification evidence        |
| XCF-REQ-058 | ADR-XCF-007; TM-16                             | Bounded audit/event metadata for success, quarantine and acquisition failure     | Audit/outbox atomicity, zero sensitive event payloads, FI-002/003/008/011/012    | AC-001; qualification evidence         |
| XCF-REQ-064 | ADR-XCF-010; TM-17                             | Tenant context required before repository access                                 | Missing/invalid context denial, AuthorizationPort unavailable and no fallback    | NEG-003/005; FI-001/014                |

`M1_REQUIREMENTS_TOTAL = 10`
`M1_REQUIREMENTS_MAPPED = 10`
`M1_REQUIREMENTS_UNMAPPED = 0`
`M1_TESTS_ORPHANED = 0`
`M1_EVIDENCE_GAPS = 0`
