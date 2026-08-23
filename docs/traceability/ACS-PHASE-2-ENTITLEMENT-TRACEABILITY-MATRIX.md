# ACS Phase 2 — Entitlement Traceability Matrix

Status: `DOR_DEFINED`

| ID         | Authority                                    | Deterministic requirement                                                                                                            | Evidence target                     | State             |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------------- |
| ENT-TR-001 | Baseline §5.48; repository-owner disposition | Entitlement is a separate tenant-scoped aggregate created only explicitly from an `ACTIVE` Subscription.                             | ADR-0023; DoR; future migration/E2E | `DOR_DEFINED`     |
| ENT-TR-002 | Subscription DoR §§2, 6                      | Customer/Contract/Plan origin is server-derived and immutable; no automatic Subscription effect.                                     | DoR origin and negative matrix      | `DOR_DEFINED`     |
| ENT-TR-003 | Plan Catalog and Subscription DoR            | `PLAN_LINE_ACCESS` has no quantity, quota, capacity, metering or financial authority; absent historical feature facts remain absent. | DoR content model; negative matrix  | `DOR_DEFINED`     |
| ENT-TR-004 | Phase 1 / security baseline                  | Signed OIDC, AuthorizationPort, trusted context, least privilege and RLS/FORCE RLS are mandatory.                                    | Threat analysis; future E2E/RLS     | `DOR_DEFINED`     |
| ENT-TR-005 | Event/audit foundation                       | History, audit, outbox, idempotency and version mutation are atomic.                                                                 | DoR; future failure-injection proof | `DOR_DEFINED`     |
| ENT-TR-006 | Repository-owner disposition                 | Creator self-activation is denied; lifecycle transitions are explicit and terminal states immutable.                                 | DoR acceptance matrix               | `DOR_DEFINED`     |
| ENT-TR-007 | Subscription downstream boundary             | Usage and every financial/accounting/Commission side effect remains absent.                                                          | DoR firewall; future negative proof | `DOR_DEFINED`     |
| ENT-TR-008 | Governance baseline                          | Retention, SLO, owners, production step-up, QG-18–QG-22, custody and ACS-REQ gaps remain open.                                       | DoR governance section              | `OPEN_GOVERNANCE` |
