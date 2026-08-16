# EDOLM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-C.

| Data object                        | Source                                                                  | Owner                         | Classification/retention                                      | State                          |
| ---------------------------------- | ----------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- | ------------------------------ |
| Tenant scope probe                 | PostgreSQL foundation schema                                            | TBD                           | INTERNAL; disposable                                          | `IMPLEMENTATION_DEFINED`       |
| Correlation telemetry              | Originating service                                                     | TBD                           | INTERNAL; retention TBD                                       | `DERIVED_FROM_BASELINE`        |
| Functional domain data             | Not created                                                             | TBD                           | Approval required                                             | `PENDING_GOVERNANCE_APPROVAL`  |
| Tenant                             | PostgreSQL `platform.tenants`                                           | Platform Owner TBD            | INTERNAL; retention pending approval                          | `IMPLEMENTATION_DEFINED`       |
| User identity mapping              | PostgreSQL `platform.users`; external subject from identity adapter     | Identity Owner TBD            | CONFIDENTIAL; retention pending approval                      | `IMPLEMENTATION_DEFINED`       |
| Tenant membership                  | PostgreSQL `platform.memberships` and `membership_permissions`          | Authorization Owner TBD       | CONFIDENTIAL; retention pending approval                      | `IMPLEMENTATION_DEFINED`       |
| Tenant context grant               | PostgreSQL `platform.tenant_context_grants`                             | Authorization Owner TBD       | SECURITY; short-lived operational record                      | `IMPLEMENTATION_DEFINED`       |
| Tenant audit record                | PostgreSQL `platform.audit_logs` and `security_audit_logs`              | Audit Owner TBD               | CONFIDENTIAL; immutable retention pending approval            | `IMPLEMENTATION_DEFINED`       |
| External OIDC subject              | Validated IdP `iss` + `sub` mapped to `platform.users.external_subject` | `PENDING_GOVERNANCE_APPROVAL` | CONFIDENTIAL; retention pending approval; API/Audit consumers | `IMPLEMENTATION_DEFINED`       |
| Authentication audit               | Platform API to `platform.security_audit_logs`                          | `PENDING_GOVERNANCE_APPROVAL` | SECURITY; no raw token/claims; retention pending approval     | `IMPLEMENTATION_DEFINED`       |
| Tenant administration idempotency  | PostgreSQL `platform.administrative_operations`                         | `PENDING_GOVERNANCE_APPROVAL` | SECURITY; tenant scoped; retention/cleanup pending            | `IMPLEMENTATION_DEFINED`       |
| Tenant administration event outbox | PostgreSQL `platform.domain_events`                                     | `PENDING_GOVERNANCE_APPROVAL` | CONFIDENTIAL; append-only; delivery/retention pending         | `IMPLEMENTATION_DEFINED`       |
| Phase 2 commercial candidate set   | VOL-VI-6.4.2 commercial objects; no physical data created               | `PENDING_GOVERNANCE_APPROVAL` | Classification, tenant scope, retention, deletion all pending | `PRE_IMPLEMENTATION_CANDIDATE` |

The probe is not an ACS domain entity. Ownership, classification, lineage, retention, deletion,
residency, and lawful use are required before functional data delivery.

The Phase 2 candidate entry is non-normative. It neither chooses a first entity nor authorizes a
schema or migration. Its authoritative source, stewardship, lineage, classification, residency,
retention, deletion, legal basis, and consumers must be approved before implementation.
