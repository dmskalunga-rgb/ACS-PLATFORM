# XCF governance supersession and historical custody

`ACS-XCF-GEP-v1.2` consolidates and supersedes the following local proposal drafts. Those drafts were
never canonical repository authority and remain historical evidence only.

| Historical draft                                                                             | SHA-256                                                            | Disposition                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| `ACS Cross-Framework Cyber Defense Control Plane v1.0.md`                                    | `a37d3fc487aba820d41f13c2713c1e6acc60024cc2f7c649822a3512b3828c99` | `SUPERSEDED_LOCAL_PROPOSAL` |
| `ACS-XCF-GEP-v1.1 — Canonical Engineering Lifecycle & Real-Data Qualification Amendment.md`  | `b7cd6af68dc84a114bd59337d35bc32740810b63e80eca984947702f55e3dc58` | `SUPERSEDED_LOCAL_PROPOSAL` |
| `ACS Cross-Framework Cyber Defense Control Plane — Governance & Engineering Package v1.0.md` | `15f2ccce57802bbbaab518a6e5cd7ad74c9e8cb4ac2a524125f40675d56ba4ce` | `SUPERSEDED_LOCAL_PROPOSAL` |

The active v1.2 package is self-contained. No normative decision or requirement depends on retrieving
these drafts.

## Roadmap supersession

The drafts used conflicting milestone identifiers. v1.2 resolves the conflict by treating governance
canonicalization as `XCF-G0`, not as a runtime milestone. Runtime milestones are:

| Canonical milestone                                | Supersedes architecture v1.0 | Supersedes GEP v1.0 |
| -------------------------------------------------- | ---------------------------- | ------------------- |
| `XCF-M1` Framework Registry and mapping foundation | `XCF-M0`                     | `XCF-M1`            |
| `XCF-M2` Vulnerability Intelligence                | `XCF-M1`                     | `XCF-M2`            |
| `XCF-M3` Adversary Intelligence                    | `XCF-M2`                     | `XCF-M3`            |
| `XCF-M4` Defensive Intelligence                    | `XCF-M3`                     | `XCF-M4`            |
| `XCF-M5` Knowledge/Fusion integration              | `XCF-M4`                     | `XCF-M5`            |
| `XCF-M6` Cognitive Decision Support                | `XCF-M5`                     | `XCF-M6`            |
| `XCF-M7` Authorized Response                       | `XCF-M6`                     | `XCF-M7`            |
| `XCF-M8` Recovery and Controlled Learning          | `XCF-M7`                     | `XCF-M8`            |

Rationale: ACS capability maturity identifiers describe runtime capability increments. Governance
publication is a prerequisite gate and must not be confused with an implemented runtime milestone.
