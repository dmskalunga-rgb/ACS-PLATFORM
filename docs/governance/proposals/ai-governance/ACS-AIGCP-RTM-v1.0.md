# ACS AIGCP Requirements Traceability Matrix v1.0

**Document ID:** `ACS-AIGCP-RTM-001`\
**Status:** `GOVERNANCE_APPROVED_PENDING_PUBLICATION`\
**Implementation evidence:** `NOT_YET_APPLICABLE`

## 1. Traceability rule

`GOVERNED` means the authority and intended acceptance boundary are
defined. It does not mean implemented or qualified. No operational row
may transition to PASS without executed evidence from the applicable
slice.

## 2. Matrix

| Requirement | Authority/reuse                     | Planned implementation           | Required evidence                                    | G0 status                    |
| ----------- | ----------------------------------- | -------------------------------- | ---------------------------------------------------- | ---------------------------- |
| REQ-001     | Trusted tenant context              | AI-system registry               | Unit, PostgreSQL, RLS, HTTP                          | GOVERNED                     |
| REQ-002     | XCF trust + XCAP-005 provenance     | Model/version registry           | Hash, signature, provenance, lifecycle tests         | GOVERNED                     |
| REQ-003     | XCAP-005                            | Dataset/version registry         | Provenance, classification, residency tests          | GOVERNED                     |
| REQ-004     | ACS identity/governance roles       | AI risk owner binding            | Ownership and unauthorized-change tests              | GOVERNED                     |
| REQ-005     | AIGCP AI-risk authority             | Assessment/treatment records     | Scoring, version, treatment evidence                 | GOVERNED                     |
| REQ-006     | XCAP-005 + XCAP-011                 | Decision envelope profile        | Evidence resolution and no-raw-content tests         | GOVERNED                     |
| REQ-007     | XCAP-011                            | Decision envelope profile        | Provenance/confidence/uncertainty tests              | GOVERNED                     |
| REQ-008     | Trusted context + RLS               | Every tenant-owned AIGCP table   | PostgreSQL 17, FORCE RLS, negative isolation         | GOVERNED                     |
| REQ-009     | ADR-XCF-008/AIDR-0001               | All AI workflows                 | Authorization-bypass negative tests                  | GOVERNED                     |
| REQ-010     | AuthorizationPort                   | Protected-operation adapters     | Denial, expiry, tenant and policy tests              | GOVERNED                     |
| REQ-011     | Platform MPA                        | AI protected-operation policies  | Independence, quorum, expiry, consume/replay         | GOVERNED; policy values open |
| REQ-012     | AIGCP                               | Prompt/version registry          | Hash, diff, classification, promotion tests          | GOVERNED                     |
| REQ-013     | AIGCP + AI Gateway boundary         | Evaluation/model lifecycle       | Change-trigger and no-silent-promotion tests         | GOVERNED                     |
| REQ-014     | AIGCP                               | Dataset/evaluation lifecycle     | Change-trigger and downstream-impact tests           | GOVERNED                     |
| REQ-015     | SBOM/SCA + AIGCP                    | AI-BOM                           | Reproducibility and component-link tests             | GOVERNED                     |
| REQ-016     | Audit + Event Foundation + XCAP-005 | Decision envelope profile        | Transactional reconstruction tests                   | GOVERNED                     |
| REQ-017     | AIGCP                               | Monitoring/KRI records           | Drift, alert, reassessment, suspension tests         | GOVERNED                     |
| REQ-018     | AuthorizationPort + MPA             | Kill-switch policy/adapter       | Independent suspend/reactivate and failure injection | GOVERNED; runtime deferred   |
| REQ-019     | Trusted context + RLS               | All inference/retrieval paths    | Cross-tenant negative E2E                            | GOVERNED                     |
| REQ-020     | XCAP-005                            | Derived-evidence linkage         | Immutability and derivation tests                    | GOVERNED                     |
| REQ-021     | XCAP-003 / AI Gateway               | Provider adapter outside AIGCP   | Direct-provider prohibition and contract E2E         | GOVERNED                     |
| REQ-022     | Event Foundation                    | Transactional outbox integration | Atomic state/audit/outbox tests                      | GOVERNED                     |
| REQ-023     | XCF                                 | Framework applicability overlays | Authority-reference and no-duplicate-mapping tests   | GOVERNED; XCF-M2 dependency  |
| REQ-024     | Future GRC interoperability         | AI-risk projection/export        | Stable-ID and non-duplication contract tests         | GOVERNED                     |
| REQ-025     | Classification policy               | Logging/event serializers        | Leakage and redaction negative tests                 | GOVERNED                     |
| REQ-026     | Existing concurrency patterns       | All mutations                    | Stale version, replay, rollback, atomicity           | GOVERNED                     |
| REQ-027     | Governance state model              | Documentation/API status         | State-transition and representation tests            | GOVERNED                     |

## 3. Cross-capability regression set

Applicable future slices must preserve:

- identity and active membership;
- trusted tenant context;
- AuthorizationPort;
- MPA;
- XCAP-005 evidence and custody;
- XCAP-011 fusion contracts;
- XCF registry/mapping authority;
- Event Foundation and outbox;
- AI Gateway direct-provider prohibition; and
- repository static/security gates.

## 4. G0 conclusion

Requirements-to-authority and requirements-to-future-evidence mappings
are complete. Runtime evidence remains intentionally absent because no
implementation slice is authorized.
