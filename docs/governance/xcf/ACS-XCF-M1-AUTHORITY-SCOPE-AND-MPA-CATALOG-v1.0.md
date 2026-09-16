# ACS-XCF M1 authority, scope and MPA catalog v1.0

Status: `APPROVED_GOVERNANCE_PRECONDITION`

This catalog closes the governance refinements that precede XCF-M1 implementation. It defines
policy identifiers and future registration contracts; it does not register runtime permissions,
roles, MPA policies, schemas or services. Runtime implementation requires a separate human
reconfirmation after this catalog is canonically integrated.

## 1. Canonical milestone boundary

```text
MAPPING_BOUNDARY_DECISION = FRAMEWORK_REGISTRY_PLUS_MAPPING_CONTRACT_ONLY
M1_SCOPE = Framework Registry, publisher/source trust, artifact validation, release ingestion,
           immutable history, activation, supersession and revocation
M2_SCOPE = mapping persistence/lifecycle, tenant overlays, CVE/CWE/CVSS/KEV and prioritization
M3_SCOPE = ATT&CK intelligence and relational graph projection
M1_MAPPING_RUNTIME = PROHIBITED
M1_TENANT_OVERLAY_RUNTIME = PROHIBITED
```

M1 may define stable framework-object identities needed by future mappings, but it must not create,
approve, activate, revoke or persist mappings or tenant overlays. This decision supersedes the
phrase `mapping foundation` in the earlier GEP M1 roadmap row. Mapping governance remains
normative for M2.

## 2. Authority context

Global XCF operations execute only in a server-issued `ACS_PLATFORM_GOVERNANCE_TENANT` context.
That context is configured by the platform and cannot be selected, supplied or overridden by a
client, source, connector, AI output or tenant payload. It scopes canonical `AuthorizationPort`,
MPA, audit and evidence records; it does not make global knowledge tenant-owned.

```text
CLIENT_SUPPLIED_TENANT = NOT_AUTHORITY
AI = NOT_AUTHORITY
GLOBAL_KNOWLEDGE_WRITE = PROTECTED_ACTION
GLOBAL_KNOWLEDGE_ACTIVATION = PROTECTED_ACTION
GLOBAL_MAPPING_APPROVAL = PROTECTED_ACTION
GLOBAL_REVOCATION = PROTECTED_ACTION
TENANT_TO_GLOBAL_PROMOTION = PROTECTED_ACTION
DEFAULT_ROLE_ASSIGNMENT = NONE
```

## 3. Frozen permission catalog

### 3.1 Global permissions

| Permission                          | Meaning                                                                | Milestone |
| ----------------------------------- | ---------------------------------------------------------------------- | --------- |
| `xcf.framework_source.read`         | Read registered source metadata and status                             | M1        |
| `xcf.framework_source.register`     | Propose/register a source without activating it                        | M1        |
| `xcf.framework_source.activate`     | Activate a validated source after protected approval                   | M1        |
| `xcf.framework_source.suspend`      | Fail closed by suspending an active source                             | M1        |
| `xcf.framework_source.revoke`       | Revoke a source through protected approval                             | M1        |
| `xcf.publisher.read`                | Read publisher identity and trust status                               | M1        |
| `xcf.publisher.administer`          | Create or amend publisher metadata without activation authority        | M1        |
| `xcf.framework_release.read`        | Read release metadata and immutable provenance                         | M1        |
| `xcf.framework_release.ingest`      | Ingest a release into a non-active validation state                    | M1        |
| `xcf.framework_release.approve`     | Record release validation approval without activation                  | M1        |
| `xcf.framework_release.activate`    | Activate exactly one approved release                                  | M1        |
| `xcf.framework_release.revoke`      | Revoke an active or approved release                                   | M1        |
| `xcf.mapping.read`                  | Read governed global mappings                                          | M2        |
| `xcf.mapping.create`                | Propose a versioned global mapping                                     | M2        |
| `xcf.mapping.approve`               | Approve/activate a global mapping                                      | M2        |
| `xcf.mapping.revoke`                | Revoke a global mapping without rewriting history                      | M2        |
| `xcf.global_knowledge.read`         | Read active global knowledge                                           | M1+       |
| `xcf.global_knowledge.administer`   | Administer non-destructive global catalog metadata                     | M1+       |
| `xcf.global_knowledge.export`       | Export authorized global knowledge                                     | M1+       |
| `xcf.global_knowledge.delete`       | Reserved destructive operation; prohibited until separately authorized | Future    |
| `xcf.tenant_to_global.approve`      | Approve governed promotion of tenant assertions                        | M2        |
| `xcf.decision_evidence.read_global` | Read authorized global DecisionEvidence projections                    | M5+       |

### 3.2 Tenant-overlay permissions

| Permission                          | Meaning                                                       | Milestone |
| ----------------------------------- | ------------------------------------------------------------- | --------- |
| `xcf.tenant.global_knowledge.read`  | Reference active global knowledge from trusted tenant context | M2        |
| `xcf.tenant.overlay.read`           | Read the current tenant's overlay                             | M2        |
| `xcf.tenant.overlay.create`         | Create a tenant-local annotation/assertion                    | M2        |
| `xcf.tenant.overlay.update`         | Version a tenant-local annotation/assertion                   | M2        |
| `xcf.tenant.overlay.revoke`         | Revoke a tenant-local assertion                               | M2        |
| `xcf.tenant.evidence.link`          | Link authorized tenant evidence by opaque reference           | M2        |
| `xcf.tenant.mapping.create`         | Create a tenant-local non-canonical mapping/projection        | M2        |
| `xcf.tenant.promotion.request`      | Request, but never approve, tenant-to-global promotion        | M2        |
| `xcf.tenant.decision_evidence.read` | Read authorized tenant DecisionEvidence                       | M5+       |
| `xcf.tenant.context.export`         | Export authorized tenant-scoped XCF context                   | M5+       |

Tenant permissions never imply any `xcf.framework_*`, `xcf.publisher.administer`,
`xcf.mapping.approve`, `xcf.mapping.revoke`, `xcf.global_knowledge.administer`,
`xcf.global_knowledge.delete` or `xcf.tenant_to_global.approve` permission.

## 4. Frozen governance role profiles

These are canonical least-privilege role profiles. Runtime registration and human assignment remain
future implementation and operations work. A role grants only the listed permissions.

| Role                                  | Permissions                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `XCF_GLOBAL_READER`                   | `xcf.framework_source.read`, `xcf.publisher.read`, `xcf.framework_release.read`, `xcf.global_knowledge.read`, `xcf.mapping.read` when M2 exists |
| `XCF_SOURCE_PROPOSER`                 | reader permissions plus `xcf.framework_source.register` and `xcf.framework_source.suspend`                                                      |
| `XCF_PUBLISHER_ADMINISTRATOR`         | `xcf.publisher.read`, `xcf.publisher.administer`; no activation or revocation                                                                   |
| `XCF_RELEASE_PROPOSER`                | reader permissions plus `xcf.framework_release.ingest`; no approval or activation                                                               |
| `XCF_RELEASE_REVIEWER`                | reader permissions plus `xcf.framework_release.approve`; cannot approve a release they proposed                                                 |
| `XCF_GLOBAL_CUSTODIAN`                | protected source/release activation and revocation permissions; no proposal-by-default                                                          |
| `XCF_MAPPING_CURATOR`                 | `xcf.mapping.read`, `xcf.mapping.create`; M2 only                                                                                               |
| `XCF_MAPPING_GOVERNOR`                | `xcf.mapping.read`, protected `xcf.mapping.approve` and `xcf.mapping.revoke`; M2 only                                                           |
| `XCF_GLOBAL_EXPORTER`                 | read permissions plus `xcf.global_knowledge.export`; high-impact export still requires MPA                                                      |
| `XCF_PROMOTION_GOVERNOR`              | protected `xcf.tenant_to_global.approve`; M2 only                                                                                               |
| `XCF_GLOBAL_ADMINISTRATOR`            | non-destructive `xcf.global_knowledge.administer`; no implicit activation, revocation, export or deletion                                       |
| `XCF_DECISION_EVIDENCE_GLOBAL_READER` | `xcf.decision_evidence.read_global`; M5+ only                                                                                                   |
| `XCF_TENANT_VIEWER`                   | tenant global-knowledge and overlay read permissions                                                                                            |
| `XCF_TENANT_CURATOR`                  | tenant viewer plus overlay create/update/revoke, evidence link and tenant mapping create                                                        |
| `XCF_TENANT_PROMOTION_REQUESTER`      | `xcf.tenant.promotion.request`; cannot approve promotion                                                                                        |
| `XCF_TENANT_DECISION_EVIDENCE_READER` | `xcf.tenant.decision_evidence.read`; M5+ only                                                                                                   |
| `XCF_TENANT_EXPORTER`                 | `xcf.tenant.context.export`; M5+ and policy-bound                                                                                               |

Role composition never bypasses `AuthorizationPort`, MPA, trusted context, SoD or physical-human
attestation. Governance ownership grants no operational role assignment.

## 5. Frozen MPA authority classes

| Authority class                     | Eligible role constraint                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| `xcf.knowledge_custodian_authority` | `XCF_GLOBAL_CUSTODIAN`                                       |
| `xcf.security_governance_authority` | separately assigned canonical security-governance approver   |
| `xcf.mapping_governance_authority`  | `XCF_MAPPING_GOVERNOR`                                       |
| `xcf.tenant_data_authority`         | separately assigned tenant data authority; not the requester |
| `xcf.data_export_authority`         | separately assigned data/export authority                    |
| `xcf.records_authority`             | separately assigned retention/records authority              |
| `xcf.response_authority`            | future M7 protected-response authority                       |

Assignments default to none. The same physical human cannot satisfy two required authority classes
on one authorization and cannot approve their own request.

## 6. Frozen MPA policies

All policies use version `1.0.0`, `SINGLE_USE` consumption, a 15-minute expiry, requester-independent
approvals, distinct physical humans, operation/target/version binding, canonical attestation,
append-only decisions and transactional consumption. Rejection, expiry or revocation fails closed.

| Policy ID / operation                                                        | Required authorities                                          | Runtime                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `xcf.framework_source.activate.standard` / `xcf.framework_source.activate`   | one knowledge custodian + one security-governance authority   | M1                                                |
| `xcf.framework_source.revoke.standard` / `xcf.framework_source.revoke`       | one knowledge custodian + one security-governance authority   | M1                                                |
| `xcf.framework_release.activate.standard` / `xcf.framework_release.activate` | one knowledge custodian + one security-governance authority   | M1                                                |
| `xcf.framework_release.revoke.standard` / `xcf.framework_release.revoke`     | one knowledge custodian + one security-governance authority   | M1                                                |
| `xcf.mapping.approve.standard` / `xcf.mapping.approve`                       | one mapping-governance authority + one knowledge custodian    | M2                                                |
| `xcf.mapping.revoke.standard` / `xcf.mapping.revoke`                         | one mapping-governance authority + one knowledge custodian    | M2                                                |
| `xcf.tenant_to_global.promote.standard` / `xcf.tenant_to_global.approve`     | one tenant-data authority + one knowledge custodian           | M2                                                |
| `xcf.global_knowledge.export.high_impact` / `xcf.global_knowledge.export`    | one data-export authority + one security-governance authority | M1+ policy-classified export only                 |
| `xcf.global_knowledge.delete.standard` / `xcf.global_knowledge.delete`       | one records authority + one security-governance authority     | Reserved; prohibited until separate authorization |
| `xcf.protected_response.activate.standard` / future protected operation      | one response authority + one security-governance authority    | Reserved for M7; not registered before M7         |

Source registration, publisher metadata administration, release ingestion, release review and
emergency source suspension require `AuthorizationPort`, audit and outbox but no MPA. Suspension is
fail-closed, cannot delete history and cannot activate a replacement. Release approval and
activation must be performed by different physical humans.

## 7. Protected transition composition

```text
REQUEST
→ VALIDATION
→ POLICY EVALUATION
→ MPA WHEN LISTED ABOVE
→ AUTHORIZATIONPORT
→ EXPECTED-VERSION STATE TRANSITION
→ CANONICAL AUDIT
→ TRANSACTIONAL OUTBOX
→ XCAP-005 EVIDENCE REFERENCE WHERE POLICY REQUIRES
→ COMMIT
```

No success event or active state is visible before commit. Audit or outbox failure rolls back the
state transition and MPA consumption.

Revocation records requester, independent approvers, policy and authorization identity, reason,
effective time, target version, evidence reference and downstream invalidation state. It prevents
future active use without deleting releases, mappings, decisions or evidence needed for historical
reproduction.

## 8. Tenant/global invariant

```text
TENANT_PRIVATE_ASSERTION != GLOBAL_CANONICAL_KNOWLEDGE

TENANT ASSERTION
→ PROMOTION REQUEST
→ POLICY VALIDATION
→ CANONICAL MPA
→ AUTHORIZATIONPORT
→ INDEPENDENT HUMAN APPROVAL
→ NEW GLOBAL CANONICAL VERSION
→ AUDIT / OUTBOX / EVIDENCE
```

No automated, AI-mediated or client-authoritative promotion exists. Tenant-scoped persistence uses
server-issued trusted tenant context, RLS, FORCE RLS and cross-tenant denial.

## 9. Governance closure

```text
GLOBAL_CUSTODIAN_ROLE_CATALOG = FROZEN
TENANT_OVERLAY_PERMISSION_CATALOG = FROZEN
XCF_MPA_POLICY = FROZEN
MPA_CARDINALITY = FROZEN
ACTIVATION_POLICY = FROZEN
REVOCATION_POLICY = FROZEN
M1_SCOPE = UNAMBIGUOUS
M2_SCOPE = UNAMBIGUOUS
RUNTIME_IMPLEMENTATION = NONE
DATABASE_RUNTIME_MIGRATION = NONE
ACS_XCF_M1_IMPLEMENTATION_AUTHORITY = REQUIRES_RECONFIRMATION_AFTER_GOVERNANCE_CLOSURE
```
