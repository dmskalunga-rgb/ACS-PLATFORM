# ADR-0005: API architecture

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-II-2.4`, `VOL-VII-7.4`, `VOL-VIII-8.3`

## Context and alternatives

REST is broadly interoperable and observable; GraphQL is flexible for complex reads but adds
authorization and cost controls; RPC is efficient for governed internal calls. No baseline
text mandates one protocol.

## Decision

External synchronous APIs are contract-first REST under `/api/v1` with OpenAPI. Technical
health endpoints remain unversioned. JSON schemas validate input and output. Errors use the
shared ACS envelope. Cursor pagination, idempotency keys for retryable mutations, request and
correlation IDs, authorization, audit, and rate limits are mandatory where applicable. RPC is
allowed only for documented internal use; GraphQL needs a separate ADR.

## Consequences, risks, and validation

Versioning can leave old contracts operational, so deprecation ownership is required. Contract
tests, schema linting, negative authorization tests, and generated OpenAPI evidence validate
each slice.
