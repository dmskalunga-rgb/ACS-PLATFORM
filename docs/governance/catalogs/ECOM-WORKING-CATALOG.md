# ECOM Working Catalog

Status: `PENDING_GOVERNANCE_APPROVAL`. This does not replace normative ANX-A.

| Capability                      | Source                   | Accountable/technical owner     | State                    | Notes                                   |
| ------------------------------- | ------------------------ | ------------------------------- | ------------------------ | --------------------------------------- |
| Ownership model                 | ANX-A-ECOM               | Governance TBD                  | `BASELINE_DEFINED`       | Baseline schema authoritative           |
| Phase 0 foundation              | Phase 0 authorization    | Governance/Engineering TBD      | `IMPLEMENTATION_DEFINED` | Technical only                          |
| Identity/Authorization boundary | VOL-II-2.7               | TBD                             | `DERIVED_FROM_BASELINE`  | Interface only                          |
| AI Gateway boundary             | VOL-IV-4.2               | TBD                             | `DERIVED_FROM_BASELINE`  | Contract only                           |
| Phase 1 tenant context          | VOL-I-1.4; VOL-VI-6.4    | Platform Engineering TBD        | `IMPLEMENTATION_DEFINED` | Owner approval remains pending          |
| Phase 1 identity adapter        | VOL-II-2.7; ADR-0007     | Identity Engineering TBD        | `DERIVED_FROM_BASELINE`  | OIDC production adapter pending         |
| Phase 1 authorization boundary  | VOL-II-2.7; ADR-0011     | Authorization Owner TBD         | `IMPLEMENTATION_DEFINED` | First action is context read            |
| Phase 1 audit records           | VOL-VI-6.1; VOL-VII-7.3  | Audit Service Owner TBD         | `DERIVED_FROM_BASELINE`  | Append-only slice evidence              |
| Platform Authentication         | VOL-I-1.4; VOL-VII-7.4   | `PENDING_GOVERNANCE_APPROVAL`   | `IMPLEMENTATION_DEFINED` | Technical/security owners pending       |
| OIDC identity mapping           | VOL-II-2.7; ADR-0013     | `PENDING_GOVERNANCE_APPROVAL`   | `IMPLEMENTATION_DEFINED` | Data owner/steward pending              |
| Event Delivery Foundation       | VOL-VII-7.7; ADR-0006    | Platform Integration/Eventing   | `IMPLEMENTATION_DEFINED` | Named owner remains pending             |
| Event operational security      | PR #6 comment 5328117974 | Platform Security/Authorization | `IMPLEMENTATION_DEFINED` | Replay is privileged and step-up marked |

Functional ownership is approved; named people remain `PENDING_GOVERNANCE_APPROVAL`. Missing
assignments remain blockers for affected production or functional slices.
