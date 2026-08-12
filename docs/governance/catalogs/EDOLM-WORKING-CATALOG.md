# EDOLM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-C.

| Data object            | Source                                                              | Owner                   | Classification/retention                           | State                         |
| ---------------------- | ------------------------------------------------------------------- | ----------------------- | -------------------------------------------------- | ----------------------------- |
| Tenant scope probe     | PostgreSQL foundation schema                                        | TBD                     | INTERNAL; disposable                               | `IMPLEMENTATION_DEFINED`      |
| Correlation telemetry  | Originating service                                                 | TBD                     | INTERNAL; retention TBD                            | `DERIVED_FROM_BASELINE`       |
| Functional domain data | Not created                                                         | TBD                     | Approval required                                  | `PENDING_GOVERNANCE_APPROVAL` |
| Tenant                 | PostgreSQL `platform.tenants`                                       | Platform Owner TBD      | INTERNAL; retention pending approval               | `IMPLEMENTATION_DEFINED`      |
| User identity mapping  | PostgreSQL `platform.users`; external subject from identity adapter | Identity Owner TBD      | CONFIDENTIAL; retention pending approval           | `IMPLEMENTATION_DEFINED`      |
| Tenant membership      | PostgreSQL `platform.memberships` and `membership_permissions`      | Authorization Owner TBD | CONFIDENTIAL; retention pending approval           | `IMPLEMENTATION_DEFINED`      |
| Tenant context grant   | PostgreSQL `platform.tenant_context_grants`                         | Authorization Owner TBD | SECURITY; short-lived operational record           | `IMPLEMENTATION_DEFINED`      |
| Tenant audit record    | PostgreSQL `platform.audit_logs` and `security_audit_logs`          | Audit Owner TBD         | CONFIDENTIAL; immutable retention pending approval | `IMPLEMENTATION_DEFINED`      |

The probe is not an ACS domain entity. Ownership, classification, lineage, retention, deletion,
residency, and lawful use are required before functional data delivery.
