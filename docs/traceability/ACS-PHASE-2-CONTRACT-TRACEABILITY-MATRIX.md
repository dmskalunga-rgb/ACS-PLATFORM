# ACS Phase 2 — Contract Traceability Matrix

| Authority / requirement           | DoR boundary                                            | Expected implementation layer                | Acceptance / evidence                        | State                            |
| --------------------------------- | ------------------------------------------------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------- |
| Baseline VOL-V 5.48; VOL-VI 6.4.2 | Commercial Contract entity                              | Contract/line/revision schema and rollback   | CTR-POS-001, 003, 011; migration/reapply     | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition                 | Explicit accepted-Proposal origin; one current Contract | Service, unique invariant, source validation | CTR-POS-001, 012; CTR-NEG-004                | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition                 | Immutable commercial origin and revisions               | Snapshot repository/service                  | CTR-POS-003, 007, 011; CTR-NEG-007           | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition                 | Frozen lifecycle/effective dates/no downstream effects  | Transition service/API                       | CTR-POS-005, 008, 009; CTR-NEG-006, 007, 013 | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Baseline tenancy/security         | AuthorizationPort, trusted context, RLS/FORCE RLS       | Role, policies and repository                | CTR-NEG-001, 002, 003, 005, 010              | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition                 | Creator/approver SoD and constrained assignment         | Authorisation and lifecycle service          | CTR-POS-006, 010; CTR-NEG-008                | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| ACS consistency standard          | Expected version, idempotency and atomicity             | Repository transactions                      | CTR-POS-004, 012; CTR-NEG-009, 012           | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Baseline API/event/audit rules    | Redacted audit and justified outbox events              | API, audit/outbox, contracts                 | CTR-NEG-011, 012                             | `LOCAL_IMPLEMENTATION_EVIDENCED` |
| Human disposition                 | Real accessible Contract UI                             | Web UI and API integration                   | CTR-WEB-001–016                              | `LOCAL_IMPLEMENTATION_EVIDENCED` |

Every `CTR-*` identifier in the DoR maps to one executable meaning. No individual `ACS-REQ` identifier is claimed because baseline completeness remains unresolved.
