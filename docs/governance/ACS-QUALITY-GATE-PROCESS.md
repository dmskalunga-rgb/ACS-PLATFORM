# ACS Quality Gate Process

Status: `IMPLEMENTATION_DEFINED`, pending Governance approval

This process does not define missing normative gate content.

Each gate record includes identifier, source, owner, approver, entry criteria, validation,
evidence, status, timestamp, commit/artifact, environment, waiver, and revalidation trigger.
Statuses are `NOT_STARTED`, `IN_REVIEW`, `PASSED`, `FAILED`, `WAIVED`, `BLOCKED`, and
`UNDEFINED_IN_BASELINE`.

1. Confirm the normative source and accountable owner.
2. Verify entry criteria and evidence integrity.
3. Execute validation on the identified commit/environment.
4. Record the actual result and immutable artifact.
5. Approve, fail, block, or grant a time-bounded waiver.
6. Revalidate after relevant code, dependency, environment, threat, or baseline changes.

Failure blocks promotion. Waivers specify scope, risk, controls, approver, expiry, and mandatory
revalidation; they cannot contradict non-waivable baseline rules.

| Gate  | Status                  | Treatment                              |
| ----- | ----------------------- | -------------------------------------- |
| QG-18 | `UNDEFINED_IN_BASELINE` | Formal definition/disposition required |
| QG-19 | `UNDEFINED_IN_BASELINE` | Formal definition/disposition required |
| QG-20 | `UNDEFINED_IN_BASELINE` | Formal definition/disposition required |
| QG-21 | `UNDEFINED_IN_BASELINE` | Formal definition/disposition required |
| QG-22 | `UNDEFINED_IN_BASELINE` | Formal definition/disposition required |
