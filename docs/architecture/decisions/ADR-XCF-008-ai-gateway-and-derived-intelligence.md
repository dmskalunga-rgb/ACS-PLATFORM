# ADR-XCF-008: AI Gateway and derived intelligence

Status: `APPROVED`

## Context

Future XCF reasoning may use models, but model output cannot become authorization or domain truth.

## Decision

All model/provider execution uses the canonical AI Gateway under separate milestone authorization.
Provider/model/template identity, policy and evidence lineage are mandatory. Outputs are classified
derived assertions with uncertainty and explanation; they cannot execute protected operations.

## Consequences

Direct provider SDK calls, silent fallback and production model execution during governance are
prohibited.
