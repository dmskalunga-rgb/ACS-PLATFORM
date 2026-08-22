# ACS Phase 2 — Proposal / Quotation Local Evidence

Status: `LOCAL_IMPLEMENTATION_EVIDENCED`. This is local publication-review
evidence, not production readiness, release approval, or a governance disposition.

## Scope

The slice implements a tenant-scoped, versioned Proposal / Quotation aggregate,
its owned line items and immutable revision snapshots. It introduces no Contract,
Subscription, Pricing, Billing, Invoice, Payment, Commission, external broker,
or production identity configuration.

## Verified local controls

| Control                                               | Evidence               | Result             |
| ----------------------------------------------------- | ---------------------- | ------------------ |
| Signed OIDC / trusted context / RLS                   | Proposal E2E `PRP-POS` | 25/25 PASS         |
| Negative security matrix                              | Proposal E2E `PRP-NEG` | 59/59 PASS         |
| Concurrency and idempotency                           | Proposal E2E           | VERIFIED           |
| Atomic aggregate, audit and outbox rollback           | Proposal E2E           | VERIFIED           |
| Revision atomicity                                    | Proposal E2E           | VERIFIED           |
| Database migration, rollback/reapply and Proposal RLS | `pnpm db:validate`     | SUCCESS / VERIFIED |
| Accessible real API Web UI                            | Web suite              | 65/65 PASS         |
| Event Foundation regression                           | Event E2E              | 5/5 PASS           |

The Event Foundation E2E fixture now receives an explicitly overdue
`next_attempt_at` in the disposable database. This makes the fixture claimable
in a bounded shared backlog; it does not change publisher, broker or production
delivery semantics.

## Local performance characterization

`BASELINE_MEASUREMENT_NOT_SLO` on disposable local PostgreSQL through the signed
OIDC Proposal execution path:

| Operation                     |  Observed |
| ----------------------------- | --------: |
| Create + audit/outbox         |  49.61 ms |
| Draft construction with lines |  50.19 ms |
| Detail                        |  21.00 ms |
| List                          |  63.83 ms |
| Draft update                  |  38.91 ms |
| Line update                   |  40.01 ms |
| Submit                        |  31.82 ms |
| Approve                       |  37.05 ms |
| Revise                        |  37.98 ms |
| Send                          | 100.40 ms |
| Terminal transition           |  40.15 ms |
| Complete journey              | 511.19 ms |

These measurements are observations only. `FORMAL_PROPOSAL_SLO` remains
`PENDING_GOVERNANCE_APPROVAL`.

## CI and production boundary

`.github/workflows/phase-two-proposal.yml` provides a dedicated Proposal quality,
Web, database and regression workflow. Its URLs are ephemeral TEST_ONLY roles.
No production configuration, credential, rate-limit, trusted-context or RLS
semantic change is made.

## Remaining governance gaps

`ADR-0020` remains `PROPOSED`. Retention, formal SLO, named owners/approvers,
production step-up mapping, production broker/IdP, QG-18–QG-22, baseline custody,
global catalog completeness and individual ACS-REQ completeness remain pending.
