# ACS Baseline Governance Gaps

Status: Open governance register  
Authority: Non-normative assessment artifact  
Normative source: ACS Enterprise Baseline v5.3

This register records documentary conditions exactly as observed. It does not amend,
interpret away, or create requirements for the baseline. Resolution requires the formal
baseline governance process, using RFC/ADR or another decision record authorized by the
baseline and the appropriate approving authorities.

| Gap | Observed condition | Impact | Required governance action | Resolution status |
| --- | --- | --- | --- | --- |
| GOV-01 | QG-18, QG-19, QG-20, QG-21, and QG-22 are not defined in the physical baseline, although the baseline declares QG-01 through QG-34 | Gate coverage and phase promotion cannot be inferred safely | Provide approved definitions or an explicit formal disposition | OPEN |
| GOV-02 | Historical headers state `FROZEN BASELINE`, while the v5.3 consolidation states `FINAL CONSOLIDATION CANDIDATE` until QG-34, authority approvals, and custody hash exist | Custody status can be misreported | Register QG-34 approval, authorities, and final external custody hash, or retain candidate status | OPEN |
| GOV-03 | Historical sections refer to 65 or 70 domains while v5.3 defines 75 domains | Automated cataloging may use stale counts | Preserve history and explicitly apply the v5.3 count through approved catalog metadata | OPEN |
| GOV-04 | Historical Roadmap references end at Phase 32 while v5.3 extends through Phase 38 | Planning tools may omit Phases 33–38 | Establish an approved consolidated Roadmap catalog using v5.3 precedence | OPEN |
| GOV-05 | ECOM defines its schema, rules, and minimum ownership examples but is not exhaustive | Many capabilities lack an implementation-ready owner record | Complete and approve ECOM without changing normative ownership silently | OPEN |
| GOV-06 | EDIM defines its schema, rules, and minimum dependencies but is not exhaustive | Integration contracts, producers, consumers, SLAs, and fallbacks remain incomplete | Complete and approve EDIM incrementally before dependent slices | OPEN |
| GOV-07 | EDOLM defines its schema, rules, and minimum data governance but is not exhaustive | Data ownership, sources, classifications, retention, and lineage remain incomplete | Complete and approve EDOLM before creating canonical data assets | OPEN |
| GOV-08 | Most prose requirements do not have individual `ACS-REQ` identifiers | Fine-grained bidirectional traceability is not yet possible | Establish an approved identifier catalog; use stable volume/section references meanwhile | OPEN |
| GOV-09 | Most API requirements are descriptive; only selected API groups are explicitly named | OpenAPI contracts and ownership cannot be derived safely | Approve API catalog and contracts per implementing vertical slice | OPEN |
| GOV-10 | Events are descriptive for many domains; the v5.3 annex explicitly names only an additional event set | Producer/consumer contracts and schemas cannot be inferred safely | Approve event catalog, schemas, versions, ownership, and compatibility policy | OPEN |

## Current interpretation guardrails

- v5.3 provisions prevail over preserved v5.2 wording where they conflict.
- Domain scope is 5.1–5.75 and Roadmap scope is Phase 0–38.
- `UNDEFINED_IN_BASELINE` is used for QG-18–QG-22; no substitute is invented.
- Baseline custody is reported as `FINAL CONSOLIDATION CANDIDATE` until formal evidence
  satisfies the condition stated in the v5.3 consolidation.
- Stable references such as `VOL-V-5.71` may be used for assessment traceability, but
  they are not newly created normative requirement IDs.

## Non-resolution statement

This assessment does not close any gap above. Implementation plans must carry the relevant
open governance dependency and stop when an unresolved item prevents a safe ownership,
contract, security, data, or Quality Gate decision.
