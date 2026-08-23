# ACS Phase 2 — Usage / Metering Definition of Ready

**Status:** `DETERMINISTIC_FOR_IMPLEMENTATION_PREPARATION`
**Implementation status:** `NOT_STARTED`
**ADR:** [ADR-0024](decisions/ADR-0024-tenant-scoped-usage-metering.md) (`PROPOSED`)

## 1. Authority and bounded model

The repository-owner disposition selects `USAGE_METERING` as one bounded
capability with separate internal concerns. Metering is trusted ingestion,
validation, normalization, and canonical recording of non-financial
measurements. Usage is canonical non-financial raw usage and reproducible
aggregation from accepted measurement history. Neither concern grants access or
creates an Entitlement.

## 2. Authoritative lineage and source trust

Each measurement belongs to exactly one server-resolved tenant and requires a
same-tenant Subscription and admissible Entitlement state. The implementation
must explicitly choose the admissible Entitlement states; no measurement may
independently create or grant access. Contract, Customer, Plan, Plan-line, and
Plan Feature references are snapshot facts only when immutable upstream evidence
already represents them. Body, query, JWT claims, and raw payloads cannot supply
authoritative tenant or commercial lineage.

Every source is identifiable and has server-authoritative tenant binding. The
source trust model distinguishes `REGISTERED_SOURCE`, `UNREGISTERED_SOURCE`,
`DISABLED_SOURCE`, and `REVOKED_SOURCE`. The implementation must select and
document whether source registration is local to Usage/Metering or references a
future integration/source registry; it must not create that separate domain by
assumption. Machine ingestion authentication/authorization is distinct from
human signed-OIDC operations.

## 3. Raw measurement, time, and lifecycle semantics

The future canonical immutable raw measurement must carry a measurement ID,
tenant, source ID, source-scoped deduplication identity, Entitlement and
Subscription references, type, value, unit, schema/version, ingestion status,
correction relationship where applicable, and three distinct UTC times:
`EVENT_TIME`, `RECEIVED_TIME`, and `PROCESSING_TIME`.

The implementation must define clock-skew, future-time, late-arrival, ordering,
and timezone-normalization policy. It must define a measurement-oriented state
model justified by evidence; lifecycle names such as `RECEIVED`, `ACCEPTED`,
`REJECTED`, and `CORRECTED` are candidate concepts, not pre-adopted aggregate
states.

Accepted raw records are append-only (`RAW_USAGE_IMMUTABILITY = REQUIRED`) with
no hard delete or silent replacement. A correction is an
`APPEND_ONLY_COMPENSATING_RECORD`: it references and preserves the original,
has its own reason/authorization/idempotency/concurrency/audit semantics, and
does not alter historic commercial origin.

## 4. Deduplication, aggregation, and concurrency

API idempotency protects command replay. Source-measurement deduplication
protects repeated source facts. They are distinct controls; deduplication is
source-scoped and tenant-scoped, never global. Duplicate simultaneous ingestion,
duplicate API command, simultaneous correction, correction versus aggregation,
late arrival versus aggregation, and replay versus correction must have
deterministic outcomes: no duplicate raw record, lost correction, double audit,
double outbox event, or inconsistent aggregate.

Aggregates are non-financial and reproducible exclusively from accepted raw
measurements plus explicit corrections. The implementation must choose canonical
dimensions from tenant, Subscription, Entitlement, authoritative Plan Feature,
measurement type, source, and time window. No aggregate may derive price, rate,
tariff, charge, tax, currency, or invoice amount.

## 5. Security, authorization, and transaction boundary

Human operations follow:

`signed OIDC → canonical identity → active membership → AuthorizationPort → trusted context → least-privilege PostgreSQL role → RLS/FORCE RLS → transaction → audit/outbox`.

The PostgreSQL role must be `NOSUPERUSER` and `NOBYPASSRLS`. Every tenant table
requires RLS, FORCE RLS, trusted context, server-side same-tenant source/origin
validation, and cross-tenant denial. The DoR must define least-privilege human
permissions for raw usage read, aggregation read, correction, ingestion replay,
and source management if local. It must explicitly disposition SoD for correction
submission/approval, rejected-ingestion replay, and source-trust management.

Ingestion fails closed for unauthenticated/unauthorized source, tenant mismatch,
invalid origin, malformed/oversized payload, invalid schema/type/unit/value,
timestamp violation, replay, duplicate divergent payload, revoked source, and
cross-tenant substitution. Audit excludes credentials, tokens, raw secrets,
unnecessary full payloads, and cross-tenant data. Aggregate/history/audit/outbox
and applicable idempotency writes are atomic; TEST_ONLY failure injection must
prove complete rollback.

## 6. Events, firewall, and governance gates

Authoritative domain events are emitted through Event Foundation's transactional
outbox; consumers require idempotency and controlled retry/DLQ/replay. Candidate
semantics are measurement accepted/rejected/corrected and usage aggregation
updated. Exact names and payloads require EDIM reconciliation and must contain
only tenant-safe identifiers and approved facts.

The following are immutable boundaries:

- `USAGE_METERING_FINANCIAL_AUTHORITY = NONE`
- `RATING_AUTHORITY = NONE`
- `BILLING_AUTHORITY = NONE`
- `FINANCIAL_SIDE_EFFECTS = NONE`
- `QUOTA_AUTHORITY = NONE`
- `ALLOWANCE_AUTHORITY = NONE`
- `CAPACITY_AUTHORITY = NONE`
- `SEAT_AUTHORITY = NONE`
- `LIMIT_ENFORCEMENT_AUTHORITY = NONE`

`RAW_MEASUREMENT_RETENTION`, `AGGREGATED_USAGE_RETENTION`, and
`AUDIT_RETENTION` are `PENDING_GOVERNANCE_APPROVAL`; production readiness is
conditional on them. Business, technical, security, and data owners remain
logical TBD categories with named persons `PENDING_GOVERNANCE_ASSIGNMENT`.
Formal SLO is pending; implementation must collect a local
`BASELINE_MEASUREMENT_NOT_SLO = TRUE` for single/duplicate ingestion, raw and
aggregation query, correction, outbox cost, and batch ingestion only if later
authorized.

## 7. Deterministic acceptance matrix

### Positive cases

| ID          | Required proof                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| USG-POS-001 | Valid trusted source ingests one same-tenant admissible Entitlement/Subscription measurement.           |
| USG-POS-002 | Server resolves tenant and immutable commercial origin; client lineage is ignored/rejected.             |
| USG-POS-003 | Same source event replay deduplicates to one authoritative raw record.                                  |
| USG-POS-004 | API idempotent command replay returns the canonical result independently of source deduplication.       |
| USG-POS-005 | Accepted record persists immutable raw facts with distinct UTC event/received/processing times.         |
| USG-POS-006 | Authorized append-only correction preserves and references its original record.                         |
| USG-POS-007 | Aggregate is reproducible from accepted raw history and corrections only.                               |
| USG-POS-008 | Authorized human raw/aggregate read succeeds through OIDC, AuthorizationPort, trusted context, and RLS. |
| USG-POS-009 | Audit and tenant-safe outbox event commit atomically with an authoritative mutation.                    |
| USG-POS-010 | Concurrent duplicate ingestion/correction has deterministic single-winner or safe conflict outcomes.    |

### Negative and security cases

| ID          | Required proof                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| USG-NEG-001 | Unauthenticated or unauthorized human operation is denied.                                                                                    |
| USG-NEG-002 | Unknown, disabled, revoked, or unauthorized source is denied.                                                                                 |
| USG-NEG-003 | Source-to-tenant mismatch or raw payload tenant substitution is denied.                                                                       |
| USG-NEG-004 | Cross-tenant Entitlement or Subscription reference is denied without disclosure.                                                              |
| USG-NEG-005 | Unknown, inactive, or otherwise inadmissible commercial origin is rejected.                                                                   |
| USG-NEG-006 | Malformed/oversized payload or invalid schema/version/type/unit/value is rejected.                                                            |
| USG-NEG-007 | Future timestamp and late-arrival policy violations are rejected deterministically.                                                           |
| USG-NEG-008 | Duplicate source identity with divergent payload conflicts; it cannot create a second fact.                                                   |
| USG-NEG-009 | Foreign-record correction, duplicate correction, and unauthorized correction are denied.                                                      |
| USG-NEG-010 | Concurrent correction/replay/aggregation cannot lose a correction or double-side-effect.                                                      |
| USG-NEG-011 | Missing/replaced trusted context and direct least-privilege session cannot bypass RLS/FORCE RLS.                                              |
| USG-NEG-012 | TEST_ONLY failure at raw/history/audit/outbox/idempotency write rolls back every partial artifact.                                            |
| USG-NEG-013 | Accepted raw record cannot be overwritten or hard-deleted.                                                                                    |
| USG-NEG-014 | Events/audit exclude secrets, tokens, unnecessary payload data, and cross-tenant facts.                                                       |
| USG-NEG-015 | No quota, allowance, capacity, pricing, rating, Billing, Invoice, Payment, Receipt, Collection, Accounting, or Commission side effect exists. |

## 8. Definition of Ready

Implementation requires a separately authorized vertical slice after source
registration ownership, admissible Entitlement states, lifecycle/state terms,
schema details, time tolerances, aggregation dimensions/windows, correction SoD,
permissions, event contracts, retention, named owners, and SLO gate are
resolved or explicitly bounded. This document authorizes neither implementation
nor publication.
