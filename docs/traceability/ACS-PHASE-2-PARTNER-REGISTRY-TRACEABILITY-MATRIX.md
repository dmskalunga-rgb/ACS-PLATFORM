# ACS Phase 2 Partner Registry Traceability Matrix

Status: `LOCAL_IMPLEMENTATION_EVIDENCE_CAPTURED`

No individual ACS-REQ identifiers are invented. Baseline references are
normative; human governance decisions and technical implementation decisions
are identified separately.

| Authority                         | Requirement / decision                                                                | Prepared artifact                  | Required future evidence                                    | State                     |
| --------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- | ------------------------- |
| VOL-V 5.48; VOL-VI 6.4.2          | Partners are Commercial concerns/canonical entity                                     | ADR-0018; Partner DoR              | scoped migration/rollback, uniqueness, RLS/FORCE RLS        | `LOCAL_VERIFIED`          |
| Human governance disposition      | tenant-scoped non-financial Partner boundary; taxonomy/contact/relationships deferred | DoR boundary and exclusions        | no financial/relationship fields or APIs                    | `LOCAL_VERIFIED`          |
| Human governance disposition      | `ACTIVE`/`INACTIVE`, no hard delete, bounded personas and no financial inheritance    | DoR lifecycle/permission matrix    | status, permission, SoD and denial evidence                 | `LOCAL_VERIFIED`          |
| VOL-VI 6.1/6.3/6.5                | controlled tenant data operations                                                     | DoR authorization boundary         | trusted context, AuthorizationPort, tenant-escape negatives | `LOCAL_VERIFIED`          |
| VOL-VII 7.3/7.4                   | versioned API, audit and safe responses                                               | DoR API/audit matrix               | API E2E, idempotency, concurrency and redacted audit        | `LOCAL_VERIFIED`          |
| VOL-VII 7.7                       | canonical events                                                                      | DoR event contract; EDIM candidate | atomic outbox and Event Foundation recovery                 | `LOCAL_VERIFIED`          |
| Technical implementation decision | cursor pagination, allowlists, idempotency and expected-version semantics             | DoR API consistency contract       | request/response, replay and stale-conflict tests           | `LOCAL_VERIFIED`          |
| Human governance disposition      | bounded accessible Partner UI and explicit financial/relationship exclusions          | DoR UI/exclusion boundary          | UI/accessibility and no-extra-scope evidence                | `LOCAL_VERIFIED`          |
| VOL-VIII 8.1–8.4                  | governed Phase 2 vertical delivery                                                    | DoR acceptance matrix              | UI, regression, CI and evidence                             | `LOCAL_EVIDENCE_CAPTURED` |
| QG-01–08, 10–11                   | applicable quality gates                                                              | DoR                                | actual gate results when separately authorized              | `PENDING_IMPLEMENTATION`  |
| QG-09                             | AI gate                                                                               | DoR                                | no AI in this slice                                         | `NOT_APPLICABLE`          |
| QG-12                             | production readiness                                                                  | DoR                                | separate pre-production proof                               | `PENDING_FUTURE_PHASE`    |
| QG-18–22                          | baseline governance gates                                                             | governance register                | formal definitions                                          | `UNDEFINED_IN_BASELINE`   |
