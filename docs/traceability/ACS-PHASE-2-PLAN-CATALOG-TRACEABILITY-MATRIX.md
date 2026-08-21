# ACS Phase 2 Plan Catalog Traceability Matrix

Status: `PRE_IMPLEMENTATION_TRACEABILITY`

No individual ACS-REQ identifiers are invented; baseline references remain
authoritative. This matrix prepares traceability only and records no runtime
implementation or test success.

| Authority          | Requirement / decision                     | Prepared artifact                  | Required future evidence                                   | State                      |
| ------------------ | ------------------------------------------ | ---------------------------------- | ---------------------------------------------------------- | -------------------------- |
| VOL-VI 6.4.2       | Canonical `plans`, `plan_features`         | ADR-0017; Plan Catalog DoR         | migration/rollback, scoped uniqueness, RLS/FORCE RLS       | `PREPARED_NOT_IMPLEMENTED` |
| VOL-VI 6.1/6.3/6.5 | Tenant isolation and controlled operations | DoR authorization boundary         | trusted context, AuthorizationPort, cross-tenant negatives | `PREPARED_NOT_IMPLEMENTED` |
| VOL-VII 7.3/7.4    | Versioned API, audit and security          | DoR API/audit matrix               | API E2E, redacted audit, idempotency/concurrency           | `PREPARED_NOT_IMPLEMENTED` |
| VOL-VII 7.7        | Canonical event delivery                   | DoR event contract; EDIM candidate | atomic outbox and Event Foundation recovery                | `PREPARED_NOT_IMPLEMENTED` |
| VOL-VIII 8.1–8.4   | Phase 2 governed vertical delivery         | DoR quality matrix                 | UI, regression, CI and evidence                            | `PREPARED_NOT_IMPLEMENTED` |
| QG-01–08, 10–11    | Applicable quality gates                   | DoR                                | actual gate runs when authorized                           | `PENDING_IMPLEMENTATION`   |
| QG-09              | Performance gate                           | DoR                                | `NOT_APPLICABLE` for DoR-only package                      | `NOT_APPLICABLE`           |
| QG-12              | Production readiness                       | DoR                                | separate pre-production proof                              | `PENDING_FUTURE_PHASE`     |
| QG-18–22           | Baseline governance gates                  | governance register                | formal baseline definition                                 | `UNDEFINED_IN_BASELINE`    |
