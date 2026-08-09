# ACS Phase 1 Focused Threat Analysis

Status: `IMPLEMENTATION_DEFINED`

| Threat                         | Attack path                                  | Mitigation                                                         | Required validation                       | Status           |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ---------------- |
| Tenant spoofing                | Client changes tenant header                 | Trusted identity plus active-membership resolver                   | Manipulated tenant UUID denied            | `DESIGNED`       |
| Cross-tenant read              | Tenant A principal requests Tenant B         | FORCE RLS and membership resolution                                | A→B and B→A denied                        | `DESIGNED`       |
| Cross-tenant write             | Crafted insert/update with another tenant    | No mutation API; RLS WITH CHECK; least-privilege grants            | Direct database write denied              | `DESIGNED`       |
| IDOR/BOLA                      | Enumerate tenant UUIDs                       | Generic denial and no existence disclosure                         | Error contract comparison                 | `DESIGNED`       |
| Privilege escalation           | Normal request assumes resolver/owner power  | Separate NOLOGIN roles and narrow grants                           | Unauthorized table/function access denied | `DESIGNED`       |
| Confused deputy                | Valid identity selects unauthorized tenant   | Resolver binds subject, membership, tenant, and status             | Cross-membership negative tests           | `DESIGNED`       |
| RLS bypass                     | Owner/service role used for ordinary query   | FORCE RLS and tenant app role inside transaction                   | Role and row-security tests               | `DESIGNED`       |
| Privileged credential exposure | Browser receives database/service credential | Server-only database URL; no privileged frontend secret            | Secret scan and frontend inspection       | `DESIGNED`       |
| Audit tampering                | Application updates/deletes audit rows       | Insert/select grants only; no update/delete                        | Direct update/delete denied               | `DESIGNED`       |
| Tenant-context injection       | Stale/malformed session setting              | UUID parser and `SET LOCAL` per transaction                        | Missing/invalid context denied            | `DESIGNED`       |
| Event tenant spoofing          | Forged tenant in emitted event               | No event for read-only slice; future events derive trusted context | Assert no event emitted                   | `NOT_APPLICABLE` |
| Identity header in production  | Client forges development subject            | Development adapter prohibited in staging/production               | Configuration tests fail closed           | `DESIGNED`       |

Residual risks: OIDC integration, MFA policy enforcement, production role provisioning, owners,
retention approvals, and comprehensive RBAC/ABAC remain pending governance or later scope.
