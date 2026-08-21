# ACS Phase 2 Plan Catalog Pre-Implementation Threat Analysis

Status: `PRE_IMPLEMENTATION_SECURITY_PREPARATION`

This document identifies required security evidence for a separately authorized
Plan Catalog implementation. It does not claim that an implementation exists.

| Threat                                        | Required control/evidence                                                                                       | Residual disposition            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Forged tenant in body/query/header            | AuthorizationPort plus trusted transaction-bound context; RLS/FORCE RLS; API E2E negative                       | Must fail closed                |
| Cross-tenant Plan or Feature IDOR/BOLA        | tenant-scoped queries and child-parent tenant checks; read/write negatives                                      | Must fail closed                |
| JWT/client state used as permission authority | PostgreSQL current permission decision via AuthorizationPort                                                    | Must fail closed                |
| RLS bypass or owner bypass                    | FORCE RLS, least privilege, no application bypass and isolation tests                                           | Must fail closed                |
| Mass assignment / financial expansion         | strict request schemas and allowlists; negative keys for tenant, price, currency, tax, limits and subscriptions | Must fail closed                |
| Lost update / replay divergence               | expected version, tenant-scoped idempotency, replay/conflict tests                                              | Controlled conflict             |
| Inactive-parent feature mutation              | aggregate lifecycle enforcement and negative E2E                                                                | Must fail closed                |
| Audit/event inconsistency                     | same-transaction authoritative row, append-only audit and outbox; rollback tests                                | Atomic rollback                 |
| Sensitive content in telemetry/events         | `INTERNAL` minimal payload, redaction and safe changed-field metadata                                           | No PII/secrets/financial data   |
| Supply-chain/configuration exposure           | existing SCA/SBOM, secret, CodeQL, filesystem/container and IaC gates                                           | Existing gate evidence required |

Production broker choice, retention, provider-specific acr/amr mapping,
production IdP/client registration, SLOs and named security ownership remain
`PENDING_GOVERNANCE_APPROVAL`; this analysis does not accept them.
