# ECOM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-A.

| Capability                      | Source                  | Accountable/technical owner   | State                          | Notes                                 |
| ------------------------------- | ----------------------- | ----------------------------- | ------------------------------ | ------------------------------------- |
| Ownership model                 | ANX-A-ECOM              | Governance TBD                | `BASELINE_DEFINED`             | Baseline schema authoritative         |
| Phase 0 foundation              | Phase 0 authorization   | Governance/Engineering TBD    | `IMPLEMENTATION_DEFINED`       | Technical only                        |
| Identity/Authorization boundary | VOL-II-2.7              | TBD                           | `DERIVED_FROM_BASELINE`        | Interface only                        |
| AI Gateway boundary             | VOL-IV-4.2              | TBD                           | `DERIVED_FROM_BASELINE`        | Contract only                         |
| Phase 1 tenant context          | VOL-I-1.4; VOL-VI-6.4   | Platform Engineering TBD      | `IMPLEMENTATION_DEFINED`       | Owner approval remains pending        |
| Phase 1 identity adapter        | VOL-II-2.7; ADR-0007    | Identity Engineering TBD      | `DERIVED_FROM_BASELINE`        | OIDC production adapter pending       |
| Phase 1 authorization boundary  | VOL-II-2.7; ADR-0011    | Authorization Owner TBD       | `IMPLEMENTATION_DEFINED`       | First action is context read          |
| Phase 1 audit records           | VOL-VI-6.1; VOL-VII-7.3 | Audit Service Owner TBD       | `DERIVED_FROM_BASELINE`        | Append-only slice evidence            |
| Platform Authentication         | VOL-I-1.4; VOL-VII-7.4  | `PENDING_GOVERNANCE_APPROVAL` | `IMPLEMENTATION_DEFINED`       | Technical/security owners pending     |
| OIDC identity mapping           | VOL-II-2.7; ADR-0013    | `PENDING_GOVERNANCE_APPROVAL` | `IMPLEMENTATION_DEFINED`       | Data owner/steward pending            |
| Tenant administration           | VOL-II-2.7; ADR-0014    | `PENDING_GOVERNANCE_APPROVAL` | `IMPLEMENTATION_DEFINED`       | Technical slice integrated            |
| Phase 2 Commercial boundary     | VOL-VI-6.4.2            | `PENDING_GOVERNANCE_APPROVAL` | `PRE_IMPLEMENTATION_CANDIDATE` | Scope and accountable owner pending   |
| Commercial authorization        | VOL-I-1.4; VOL-II-2.7   | `PENDING_GOVERNANCE_APPROVAL` | `PRE_IMPLEMENTATION_CANDIDATE` | MFA/step-up and SoD decision required |
| Commercial event delivery       | VOL-VII-7.7             | `PENDING_GOVERNANCE_APPROVAL` | `PRE_IMPLEMENTATION_CANDIDATE` | Publisher operations not implemented  |

The three Phase 2 entries are non-normative readiness candidates. They do not select the first
commercial vertical slice, approve an owner, or authorize implementation. Missing assignments
remain blockers for affected functional slices.
