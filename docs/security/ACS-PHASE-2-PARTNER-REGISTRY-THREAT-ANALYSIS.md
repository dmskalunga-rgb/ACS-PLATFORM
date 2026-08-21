# ACS Phase 2 Partner Registry Threat Analysis

Status: `PRE_IMPLEMENTATION_SECURITY_PREPARATION`

This is a future implementation acceptance plan, not implementation or
production evidence. It applies the human-approved non-financial Partner
boundary and does not create an acceptance claim.

| Threat                                    | Required control / future evidence                                                                          | Residual disposition            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Forged tenant in body/query/header        | trusted context, AuthorizationPort, RLS/FORCE RLS and API negatives                                         | Must fail closed                |
| Cross-tenant Partner IDOR/BOLA            | tenant-scoped queries and list/detail/update negatives                                                      | Must fail closed                |
| JWT or client state used as authority     | current PostgreSQL permission decision through AuthorizationPort                                            | Must fail closed                |
| Partner Administrator privilege overreach | bounded Partner-only permissions; no Finance, Billing, Commission, Security or Auditor mutation inheritance | Must fail closed                |
| RLS or owner bypass                       | FORCE RLS, least privilege and direct tenant-escape tests                                                   | Must fail closed                |
| Mass assignment / financial expansion     | strict allowlists rejecting tenant, taxonomy, relationship, commission and financial keys                   | Must fail closed                |
| Lost update / replay divergence           | expected version, scoped idempotency and conflict tests                                                     | Controlled conflict             |
| Invalid inactive lifecycle use            | explicit version-bound status transition and negative E2E                                                   | Must fail closed                |
| Audit/outbox inconsistency                | same transaction, rollback proof and append-only audit                                                      | Atomic rollback                 |
| Data leakage                              | minimal internal events; no contact PII, credentials, grants or financial data                              | No sensitive leakage            |
| Supply-chain/configuration exposure       | existing CodeQL, secret, SCA/SBOM, filesystem/container and IaC gates                                       | Existing gate evidence required |

Production broker selection, retention, provider-specific assurance mapping,
production IdP/client registration, SLOs and named security ownership remain
`PENDING_GOVERNANCE_APPROVAL`.
