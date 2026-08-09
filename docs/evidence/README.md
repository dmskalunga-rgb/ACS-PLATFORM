# ACS Engineering Evidence

Store records under `docs/evidence/<phase>/<quality-gate>/`. Bulky/sensitive scanner output can
remain in the authorized CI artifact store; record its immutable identifier and digest here.

Every record contains source requirement, UTC timestamp, command/test, actual result
(`VERIFIED`, `FAILED`, `NOT_EXECUTED`, or `NOT_APPLICABLE`), artifact and digest, owner,
source commit, environment, reviewer/gate, and redaction statement.

Evidence is reproducible and immutable after approval. Corrections create a new record and
retain the superseded one. Never store credentials, production data, classified payloads,
personal data, or unredacted logs. Phase 0 records live under `docs/evidence/phase-0/`.
