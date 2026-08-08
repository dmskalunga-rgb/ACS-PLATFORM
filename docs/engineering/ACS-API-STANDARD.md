# ACS API Standard

Status: `IMPLEMENTATION_DEFINED`, pending controlled review

Source: `VOL-VII-7.4`, ADR-0005.

- Functional REST resources live below `/api/v1`. Only technical probes/metadata are unversioned.
- OpenAPI describes validated requests, responses, authentication, errors, and examples.
- Errors contain `code`, `message`, `request_id`, optional safe `details`, and no stack/secret.
- Collections use stable cursor pagination with bounded limits and allow-listed sort/filter.
- Retryable mutations require scoped idempotency keys; altered bodies with reused keys fail.
- Every request has request/correlation IDs. Tenant and actor derive from trusted identity.
- Authentication, fail-closed authorization, audit, classification, validation, abuse controls,
  and rate limits are defined per operation.
- Contract, negative authorization, isolation, idempotency, and compatibility tests apply.
