# ECOM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-A.

| Capability                      | Source                  | Accountable/technical owner | State                    | Notes                           |
| ------------------------------- | ----------------------- | --------------------------- | ------------------------ | ------------------------------- |
| Ownership model                 | ANX-A-ECOM              | Governance TBD              | `BASELINE_DEFINED`       | Baseline schema authoritative   |
| Phase 0 foundation              | Phase 0 authorization   | Governance/Engineering TBD  | `IMPLEMENTATION_DEFINED` | Technical only                  |
| Identity/Authorization boundary | VOL-II-2.7              | TBD                         | `DERIVED_FROM_BASELINE`  | Interface only                  |
| AI Gateway boundary             | VOL-IV-4.2              | TBD                         | `DERIVED_FROM_BASELINE`  | Contract only                   |
| Phase 1 tenant context          | VOL-I-1.4; VOL-VI-6.4   | Platform Engineering TBD    | `IMPLEMENTATION_DEFINED` | Owner approval remains pending  |
| Phase 1 identity adapter        | VOL-II-2.7; ADR-0007    | Identity Engineering TBD    | `DERIVED_FROM_BASELINE`  | OIDC production adapter pending |
| Phase 1 authorization boundary  | VOL-II-2.7; ADR-0011    | Authorization Owner TBD     | `IMPLEMENTATION_DEFINED` | First action is context read    |
| Phase 1 audit records           | VOL-VI-6.1; VOL-VII-7.3 | Audit Service Owner TBD     | `DERIVED_FROM_BASELINE`  | Append-only slice evidence      |

Missing assignments remain blockers for affected functional slices.
