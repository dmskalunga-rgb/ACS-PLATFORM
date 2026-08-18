# EDOLM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-C.

| Data object            | Source                                                                  | Owner                                                            | Classification/retention                                                                                                    | State                           |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Tenant scope probe     | PostgreSQL foundation schema                                            | TBD                                                              | INTERNAL; disposable                                                                                                        | `IMPLEMENTATION_DEFINED`        |
| Correlation telemetry  | Originating service                                                     | TBD                                                              | INTERNAL; retention TBD                                                                                                     | `DERIVED_FROM_BASELINE`         |
| Functional domain data | Not created                                                             | TBD                                                              | Approval required                                                                                                           | `PENDING_GOVERNANCE_APPROVAL`   |
| Tenant                 | PostgreSQL `platform.tenants`                                           | Platform Owner TBD                                               | INTERNAL; retention pending approval                                                                                        | `IMPLEMENTATION_DEFINED`        |
| User identity mapping  | PostgreSQL `platform.users`; external subject from identity adapter     | Identity Owner TBD                                               | CONFIDENTIAL; retention pending approval                                                                                    | `IMPLEMENTATION_DEFINED`        |
| Tenant membership      | PostgreSQL `platform.memberships` and `membership_permissions`          | Authorization Owner TBD                                          | CONFIDENTIAL; retention pending approval                                                                                    | `IMPLEMENTATION_DEFINED`        |
| Tenant context grant   | PostgreSQL `platform.tenant_context_grants`                             | Authorization Owner TBD                                          | SECURITY; short-lived operational record                                                                                    | `IMPLEMENTATION_DEFINED`        |
| Tenant audit record    | PostgreSQL `platform.audit_logs` and `security_audit_logs`              | Audit Owner TBD                                                  | CONFIDENTIAL; immutable retention pending approval                                                                          | `IMPLEMENTATION_DEFINED`        |
| External OIDC subject  | Validated IdP `iss` + `sub` mapped to `platform.users.external_subject` | `PENDING_GOVERNANCE_APPROVAL`                                    | CONFIDENTIAL; retention pending approval; API/Audit consumers                                                               | `IMPLEMENTATION_DEFINED`        |
| Authentication audit   | Platform API to `platform.security_audit_logs`                          | `PENDING_GOVERNANCE_APPROVAL`                                    | SECURITY; no raw token/claims; retention pending approval                                                                   | `IMPLEMENTATION_DEFINED`        |
| Domain event outbox    | PostgreSQL `platform.domain_events`                                     | Platform Integration/Eventing                                    | Classification per envelope; configurable retention                                                                         | `IMPLEMENTATION_DEFINED`        |
| Event delivery state   | PostgreSQL `platform.event_deliveries`                                  | Platform Integration/Eventing                                    | SECURITY; tenant scoped; bounded lifecycle                                                                                  | `IMPLEMENTATION_DEFINED`        |
| Consumer receipt       | PostgreSQL `platform.consumer_event_receipts`                           | Consuming service owner pending                                  | SECURITY; configurable retry/replay-window retention                                                                        | `IMPLEMENTATION_DEFINED`        |
| Event lifecycle audit  | PostgreSQL `platform.event_lifecycle_audit`                             | Governance/Audit                                                 | SECURITY; append-only; retention pending approval                                                                           | `IMPLEMENTATION_DEFINED`        |
| Commercial customer    | PostgreSQL `commercial.customers`                                       | Commercial Data Owner; named owner `PENDING_GOVERNANCE_APPROVAL` | INTERNAL identifiers; BUSINESS registry data; optional CONFIDENTIAL_PII contact; no hard delete; retention pending approval | `IMPLEMENTED_PENDING_REMOTE_CI` |

Customer lineage is: authenticated user action → Customer API → authoritative
`commercial.customers` row → append-only audit → canonical domain event/outbox → Event Foundation.
Real consumers in this slice are the Customer API and Web UI. Future commercial consumers remain
`NOT_IMPLEMENTED / FUTURE_DEPENDENCY`. Customer data is not tenant identity data and is not used by
AI, RAG or graph processing in this slice.

The probe is not an ACS domain entity. Ownership, classification, lineage, retention, deletion,
residency, and lawful use are required before functional data delivery.

Event Foundation retention values are configuration/governance driven; this catalog does not
invent regulatory periods. Named owners and stewards remain `PENDING_GOVERNANCE_APPROVAL`.
