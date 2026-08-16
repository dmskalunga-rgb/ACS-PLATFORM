# ACS Phase 1 Focused Threat Analysis

Status: `VERIFIED_INTEGRATED_WITH_RESIDUAL_GOVERNANCE_RISK`

| Threat                         | Attack path                                         | Mitigation                                                                                          | Required validation                             | Status                |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------- |
| Tenant spoofing                | Client changes tenant header                        | Trusted identity plus active-membership resolver                                                    | Manipulated tenant UUID denied                  | `VERIFIED_INTEGRATED` |
| Cross-tenant read              | Tenant A principal requests Tenant B                | FORCE RLS and membership resolution                                                                 | A-to-B and B-to-A denied                        | `VERIFIED_INTEGRATED` |
| Cross-tenant write             | Crafted insert/update with another tenant           | RLS WITH CHECK and least-privilege grants                                                           | Direct database write denied                    | `VERIFIED_INTEGRATED` |
| IDOR/BOLA                      | Enumerate tenant UUIDs                              | Generic denial and no existence disclosure                                                          | Error contract comparison                       | `VERIFIED_INTEGRATED` |
| Privilege escalation           | Normal request assumes resolver/owner power         | Separate NOLOGIN roles and narrow grants                                                            | Unauthorized table/function access denied       | `VERIFIED_INTEGRATED` |
| Confused deputy                | Valid identity selects unauthorized tenant          | Resolver binds subject, membership, tenant, and status                                              | Cross-membership negative tests                 | `VERIFIED_INTEGRATED` |
| RLS/GUC bypass                 | Tenant role sets or replays context directly        | Opaque one-use grant bound to backend PID, transaction, tenant, user, and permission                | Missing/malformed/spoof/replay tests            | `VERIFIED_INTEGRATED` |
| Privileged credential exposure | Browser receives database/service credential        | Server-only database URL; no privileged frontend secret                                             | Secret scan and frontend inspection             | `VERIFIED_INTEGRATED` |
| Audit tampering                | Application or privileged path mutates audit        | Privilege denial plus independent append-only triggers                                              | Both layers tested separately                   | `VERIFIED_INTEGRATED` |
| Tenant-context injection       | Stale/malformed/spoofed token                       | Privileged grant lookup and transaction binding                                                     | Missing/invalid/altered/replayed denied         | `VERIFIED_INTEGRATED` |
| Event tenant spoofing          | Forged tenant in emitted event                      | Events derive tenant from trusted context                                                           | Integrated tenant administration event tests    | `VERIFIED_INTEGRATED` |
| Identity header in production  | Client forges development subject                   | Development adapter prohibited in staging/production                                                | Configuration tests fail closed                 | `VERIFIED_INTEGRATED` |
| JWT forgery                    | Attacker fabricates or alters bearer token          | Cryptographic signature verification with explicit algorithm allow-list and JWKS                    | Invalid signature/algorithm/key tests           | `VERIFIED_INTEGRATED` |
| Token replay                   | Stolen bearer token is reused                       | Short expiry, TLS, audience binding; bearer access token never persisted by ACS UI                  | Expiry and logout tests; IdP revocation remains | `PARTIALLY_MITIGATED` |
| Algorithm confusion            | Token selects weak/unexpected algorithm             | `RS256`/`PS256`/`ES256` allow-list; token headers cannot expand trust                               | Disallowed algorithm test                       | `VERIFIED_INTEGRATED` |
| Key substitution / `jku` abuse | Attacker directs verification to own key set        | Only configured HTTPS JWKS endpoint is used; token `jku` is ignored                                 | Unknown key/signature tests                     | `VERIFIED_INTEGRATED` |
| Stale signing key              | Rotation occurs while JWKS is cached                | Bounded cache/cooldown and refresh on unknown `kid`; failures close access                          | Cache, unknown key, timeout tests               | `VERIFIED_INTEGRATED` |
| Issuer/audience confusion      | Valid foreign token reaches ACS                     | Exact configured `iss` and `aud` checks and immutable `iss` + `sub` identity                        | Wrong issuer/audience tests                     | `VERIFIED_INTEGRATED` |
| Token leakage                  | Logs, metrics, URL, or browser storage expose token | Logger redaction, safe reason labels, Authorization header only, in-memory UI boundary              | Redaction/storage tests                         | `VERIFIED_INTEGRATED` |
| IdP/JWKS outage                | Identity dependency becomes unavailable             | Timeout, cached keys, degraded status, generic 401/503 handling, fail closed                        | Timeout and UI unavailable tests                | `VERIFIED_INTEGRATED` |
| Logout misconception           | Local logout assumed to revoke bearer token         | UI drops in-memory access and delegates provider logout; docs require IdP revocation/session policy | Logout integration test                         | `PARTIALLY_MITIGATED` |

Residual risks: full service-process compromise, stolen-token replay until expiry/provider
revocation, MFA enforcement policy (although `acr`/`amr` are exposed), production IdP tenancy and
client registration, grant cleanup, named owners, retention approvals, and comprehensive RBAC/ABAC
remain pending governance or later scope.

## Tenant administration runtime delta

| Threat                                  | Control and runtime result                                                               | Status                |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------- |
| Self-escalation / limited administrator | Actor-target equality and current `roles.manage` evaluation deny mutation                | `VERIFIED_INTEGRATED` |
| IDOR/BOLA / cross-tenant UUIDs          | Composite tenant FKs, permission-bound grants, FORCE RLS, generic denial                 | `VERIFIED_INTEGRATED` |
| Stale or concurrent write               | Row lock plus membership version produces one winner and one 409 loser                   | `VERIFIED_INTEGRATED` |
| Retry replay                            | Tenant/idempotency key/request hash returns one logical result; divergent payload is 409 | `VERIFIED_INTEGRATED` |
| Revoked role/permission                 | Current role graph is resolved before every grant; revocation denies immediately         | `VERIFIED_INTEGRATED` |
| JWT authorization-claim injection       | JWT tenant/role/permission claims are ignored; PostgreSQL remains authoritative          | `VERIFIED_INTEGRATED` |
| Audit/outbox tampering or split commit  | Mutation, audit and event share one transaction; event trigger rejects mutation          | `VERIFIED_INTEGRATED` |

Complete organizational separation of duties and global MFA/step-up policy remain
`GOVERNANCE_PENDING`; no corporate policy is inferred from `acr`/`amr`.

Integrated-state evidence for the promoted rows is the Phase 1 and Phase 0 regression run set
`31936812713` and `31936812776` on
`develop@8698fe43ae7c4a1f2e3d2d86ae5f1e9dda60d7a2`, together with the detailed OIDC and Tenant
Administration evidence records. Token replay, provider revocation/global logout, MFA policy,
production IdP registration, retention, and organizational separation of duties remain open.
