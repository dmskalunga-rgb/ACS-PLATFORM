# EDOLM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-C.

| Data object            | Source                                       | Owner                   | Classification/retention                           | State                         |
| ---------------------- | -------------------------------------------- | ----------------------- | -------------------------------------------------- | ----------------------------- |
| Tenant scope probe     | PostgreSQL foundation schema                 | TBD                     | INTERNAL; disposable                               | `IMPLEMENTATION_DEFINED`      |
| Correlation telemetry  | Originating service                          | TBD                     | INTERNAL; retention TBD                            | `DERIVED_FROM_BASELINE`       |
| Functional domain data | Not created                                  | TBD                     | Approval required                                  | `PENDING_GOVERNANCE_APPROVAL` |
| Tenant                 | Platform API → PostgreSQL `platform.tenants` | Platform Owner TBD      | INTERNAL; retention pending approval               | `IMPLEMENTATION_DEFINED`      |
| User identity mapping  | Identity adapter → `platform.users`          | Identity Owner TBD      | CONFIDENTIAL; retention pending approval           | `IMPLEMENTATION_DEFINED`      |
| Tenant membership      | Identity context → `platform.memberships`    | Authorization Owner TBD | CONFIDENTIAL; retention pending approval           | `IMPLEMENTATION_DEFINED`      |
| Tenant audit record    | Platform service → `platform.audit_logs`     | Audit Owner TBD         | CONFIDENTIAL; immutable retention pending approval | `IMPLEMENTATION_DEFINED`      |

The probe is not an ACS domain entity. Ownership, classification, lineage, retention, deletion,
residency, and lawful use are required before functional data delivery.
