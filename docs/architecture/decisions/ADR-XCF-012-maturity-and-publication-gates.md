# ADR-XCF-012: Maturity and publication gates

Status: `APPROVED`

## Context

The earlier drafts used M0 for both governance and runtime foundation, creating an ambiguous gate.

## Decision

Governance canonicalization is `XCF-G0`. Runtime milestones are M1 Framework Registry and source
release lifecycle; M2 mapping runtime, tenant overlays and vulnerability knowledge; M3 ATT&CK and
graph projection; M4 deterministic defensive-control interpretation; M5 XCAP-011 composition; M6
cognitive enrichment; M7 governed response; and M8 recovery/learning. Each milestone requires
separate human authorization, executable RTM evidence and remote validation.

M1 defines stable framework-object identities but includes no mapping or tenant-overlay runtime.
The exact boundary is frozen in
`docs/governance/xcf/ACS-XCF-M1-AUTHORITY-SCOPE-AND-MPA-CATALOG-v1.0.md`.

## Consequences

Publishing governance does not authorize or imply runtime implementation.
