# ACS Cross-Component Test Structure

Reserved suites: `integration/`, `contract/`, `security/`, `e2e/`, `performance/`, and
`resilience/`. Unit/API tests stay beside source; SQL/RLS/isolation tests live under
`database/tests/`. Empty functional suites are intentionally not fabricated in Phase 0.
