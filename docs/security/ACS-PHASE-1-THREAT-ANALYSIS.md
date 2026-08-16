# ACS Phase 1 Focused Threat Analysis

Status: `IMPLEMENTATION_DEFINED`

| Threat                         | Attack path                                         | Mitigation                                                                                          | Required validation                             | Status                          |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------- |
| Tenant spoofing                | Client changes tenant header                        | Trusted identity plus active-membership resolver                                                    | Manipulated tenant UUID denied                  | `DESIGNED`                      |
| Cross-tenant read              | Tenant A principal requests Tenant B                | FORCE RLS and membership resolution                                                                 | A→B and B→A denied                              | `DESIGNED`                      |
| Cross-tenant write             | Crafted insert/update with another tenant           | No mutation API; RLS WITH CHECK; least-privilege grants                                             | Direct database write denied                    | `DESIGNED`                      |
| IDOR/BOLA                      | Enumerate tenant UUIDs                              | Generic denial and no existence disclosure                                                          | Error contract comparison                       | `DESIGNED`                      |
| Privilege escalation           | Normal request assumes resolver/owner power         | Separate NOLOGIN roles and narrow grants                                                            | Unauthorized table/function access denied       | `DESIGNED`                      |
| Confused deputy                | Valid identity selects unauthorized tenant          | Resolver binds subject, membership, tenant, and status                                              | Cross-membership negative tests                 | `DESIGNED`                      |
| RLS/GUC bypass                 | Tenant role sets or replays context directly        | Opaque one-use grant bound to backend PID, transaction, tenant, user, permission                    | Missing/malformed/spoof/replay tests            | `REMEDIATED_PENDING_VALIDATION` |
| Privileged credential exposure | Browser receives database/service credential        | Server-only database URL; no privileged frontend secret                                             | Secret scan and frontend inspection             | `DESIGNED`                      |
| Audit tampering                | Application or privileged path mutates audit        | Privilege denial plus independent append-only triggers                                              | Both layers tested separately                   | `REMEDIATED_PENDING_VALIDATION` |
| Tenant-context injection       | Stale/malformed/spoofed token                       | Privileged grant lookup and transaction binding                                                     | Missing/invalid/altered/replayed denied         | `REMEDIATED_PENDING_VALIDATION` |
| Event tenant spoofing          | Forged tenant in emitted event                      | No event for read-only slice; future events derive trusted context                                  | Assert no event emitted                         | `NOT_APPLICABLE`                |
| Identity header in production  | Client forges development subject                   | Development adapter prohibited in staging/production                                                | Configuration tests fail closed                 | `DESIGNED`                      |
| JWT forgery                    | Attacker fabricates or alters bearer token          | Cryptographic signature verification with explicit algorithm allow-list and JWKS                    | Invalid signature/algorithm/key tests           | `IMPLEMENTED`                   |
| Token replay                   | Stolen bearer token is reused                       | Short expiry, TLS, audience binding; bearer access token never persisted by ACS UI                  | Expiry and logout tests; IdP revocation remains | `PARTIALLY_MITIGATED`           |
| Algorithm confusion            | Token selects weak/unexpected algorithm             | `RS256`/`PS256`/`ES256` allow-list; token headers cannot expand trust                               | Disallowed algorithm test                       | `IMPLEMENTED`                   |
| Key substitution / `jku` abuse | Attacker directs verification to own key set        | Only configured HTTPS JWKS endpoint is used; token `jku` is ignored                                 | Unknown key/signature tests                     | `IMPLEMENTED`                   |
| Stale signing key              | Rotation occurs while JWKS is cached                | Bounded cache/cooldown and refresh on unknown `kid`; failures close access                          | Cache, unknown key, timeout tests               | `IMPLEMENTED`                   |
| Issuer/audience confusion      | Valid foreign token reaches ACS                     | Exact configured `iss` and `aud` checks and immutable `iss` + `sub` identity                        | Wrong issuer/audience tests                     | `IMPLEMENTED`                   |
| Token leakage                  | Logs, metrics, URL, or browser storage expose token | Logger redaction, safe reason labels, Authorization header only, in-memory UI boundary              | Redaction/storage tests                         | `IMPLEMENTED`                   |
| IdP/JWKS outage                | Identity dependency becomes unavailable             | Timeout, cached keys, degraded status, generic 401/503 handling, fail closed                        | Timeout and UI unavailable tests                | `IMPLEMENTED`                   |
| Logout misconception           | Local logout assumed to revoke bearer token         | UI drops in-memory access and delegates provider logout; docs require IdP revocation/session policy | Logout integration test                         | `PARTIALLY_MITIGATED`           |

Residual risks: full service-process compromise, stolen-token replay until expiry/provider
revocation, MFA enforcement policy (although `acr`/`amr` are exposed), production IdP tenancy and
client registration, grant cleanup, named owners, retention approvals, and comprehensive RBAC/ABAC
remain pending governance or later scope.

## Tenant administration runtime delta

| Threat                                  | Control and runtime result                                                               | Status           |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------- |
| Self-escalation / limited administrator | Actor-target equality and current `roles.manage` evaluation deny mutation                | `VERIFIED_LOCAL` |
| IDOR/BOLA / cross-tenant UUIDs          | Composite tenant FKs, permission-bound grants, FORCE RLS, generic denial                 | `VERIFIED_LOCAL` |
| Stale or concurrent write               | Row lock plus membership version produces one winner and one 409 loser                   | `VERIFIED_LOCAL` |
| Retry replay                            | Tenant/idempotency key/request hash returns one logical result; divergent payload is 409 | `VERIFIED_LOCAL` |
| Revoked role/permission                 | Current role graph is resolved before every grant; revocation denies immediately         | `VERIFIED_LOCAL` |
| JWT authorization-claim injection       | JWT tenant/role/permission claims are ignored; PostgreSQL remains authoritative          | `VERIFIED_LOCAL` |
| Audit/outbox tampering or split commit  | Mutation, audit and event share one transaction; event trigger rejects mutation          | `VERIFIED_LOCAL` |

Complete organizational separation of duties and global MFA/step-up policy remain
`GOVERNANCE_PENDING`; no corporate policy is inferred from `acr`/`amr`.
