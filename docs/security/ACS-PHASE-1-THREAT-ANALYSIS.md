# ACS Phase 1 Focused Threat Analysis

Status: `IMPLEMENTATION_DEFINED`

| Threat                         | Attack path                                  | Mitigation                                                                       | Required validation                       | Status                          |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| Tenant spoofing                | Client changes tenant header                 | Trusted identity plus active-membership resolver                                 | Manipulated tenant UUID denied            | `DESIGNED`                      |
| Cross-tenant read              | Tenant A principal requests Tenant B         | FORCE RLS and membership resolution                                              | A→B and B→A denied                        | `DESIGNED`                      |
| Cross-tenant write             | Crafted insert/update with another tenant    | No mutation API; RLS WITH CHECK; least-privilege grants                          | Direct database write denied              | `DESIGNED`                      |
| IDOR/BOLA                      | Enumerate tenant UUIDs                       | Generic denial and no existence disclosure                                       | Error contract comparison                 | `DESIGNED`                      |
| Privilege escalation           | Normal request assumes resolver/owner power  | Separate NOLOGIN roles and narrow grants                                         | Unauthorized table/function access denied | `DESIGNED`                      |
| Confused deputy                | Valid identity selects unauthorized tenant   | Resolver binds subject, membership, tenant, and status                           | Cross-membership negative tests           | `DESIGNED`                      |
| RLS/GUC bypass                 | Tenant role sets or replays context directly | Opaque one-use grant bound to backend PID, transaction, tenant, user, permission | Missing/malformed/spoof/replay tests      | `REMEDIATED_PENDING_VALIDATION` |
| Privileged credential exposure | Browser receives database/service credential | Server-only database URL; no privileged frontend secret                          | Secret scan and frontend inspection       | `DESIGNED`                      |
| Audit tampering                | Application or privileged path mutates audit | Privilege denial plus independent append-only triggers                           | Both layers tested separately             | `REMEDIATED_PENDING_VALIDATION` |
| Tenant-context injection       | Stale/malformed/spoofed token                | Privileged grant lookup and transaction binding                                  | Missing/invalid/altered/replayed denied   | `REMEDIATED_PENDING_VALIDATION` |
| Event tenant spoofing          | Forged tenant in emitted event               | No event for read-only slice; future events derive trusted context               | Assert no event emitted                   | `NOT_APPLICABLE`                |
| Identity header in production  | Client forges development subject            | Development adapter prohibited in staging/production                             | Configuration tests fail closed           | `DESIGNED`                      |

Residual risks: full service-process compromise, grant cleanup, OIDC integration, MFA policy
enforcement, production credential provisioning, owners, retention approvals, and comprehensive
RBAC/ABAC remain pending governance or later scope.
