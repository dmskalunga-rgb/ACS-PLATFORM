# ACS AIGCP Policy and Authority Registry v1.0

**Document ID:** `ACS-AIGCP-PAR-001`\
**Status:** `GOVERNANCE_APPROVED_PENDING_PUBLICATION`\
**Scope:** `AIGOV-G0`\
**Runtime implementation:** `NOT_AUTHORIZED`

## 1. Governing invariant

```text
AI RECOMMENDATION != AUTHORIZATION != EXECUTION
```

AIGCP governs AI-specific inventory, risk, lifecycle metadata, evidence
linkage, and policy inputs. It does not replace any existing ACS tenant,
identity, authorization, approval, evidence, event, framework, or model
execution authority.

## 2. Canonical authority map

| Concern                             | Canonical authority                         | AIGCP relationship                                                |
| ----------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Identity and membership             | ACS Identity / active-membership foundation | Reference only                                                    |
| Tenant context                      | Server-issued trusted tenant context        | Mandatory reuse                                                   |
| Database isolation                  | PostgreSQL RLS and FORCE RLS                | Mandatory reuse and extension to AIGCP tables                     |
| Protected-operation authorization   | `AuthorizationPort`                         | Mandatory reuse                                                   |
| Independent/dual approval           | Platform MPA and human authority            | Mandatory reuse where policy requires                             |
| Model/provider execution            | XCAP-003 / AI Gateway                       | AIGCP governs metadata; it does not execute models                |
| Evidence/provenance/custody         | XCAP-005                                    | Typed references and governed derivations only                    |
| Cognitive fusion                    | XCAP-011                                    | Reuse decision, confidence, uncertainty, and provenance contracts |
| Framework sources/releases/mappings | XCF                                         | Reference/consume; no parallel mapping authority                  |
| Domain events                       | Event Foundation and transactional outbox   | Exclusive publication path                                        |
| AI-specific risks                   | AIGCP                                       | Canonical owner for AI-specific risk governance                   |
| Generic enterprise GRC              | Future separately governed authority        | AIGCP must remain aggregatable and non-competing                  |

## 3. AI-specific risk authority

AIGCP may govern:

- AI risk identity and classification;
- inherent and residual assessment;
- AI-specific controls and control evidence references;
- treatment decisions;
- accountable ownership;
- residual-risk acceptance; and
- monitoring and reassessment state.

AIGCP must not create a generic enterprise risk platform. Stable IDs,
typed references, and export/projection contracts must allow a future
enterprise GRC authority to aggregate AI risk without duplicating it.

## 4. Policy and authorization semantics

`Policy Engine` means policy evaluation that produces inputs to the
canonical authorization architecture. It is not a separate service or
authority.

```text
Policy evaluation
  -> AuthorizationPort
  -> MPA / human authority when policy requires
  -> authorized execution boundary
  -> transactional audit, outbox, and evidence references
```

Missing tenant context, authorization uncertainty, expired approval,
failed independence, failed attestation, replay, or policy ambiguity
must fail closed.

## 5. Protected-operation catalogue

The following are proposed protected-operation classes. Runtime
permissions, role composition, quorum, expiry, independence, and consume
policies require separate implementation authorization.

| Operation class                           | Authorization requirement                                       | MPA candidate    | AI self-approval |
| ----------------------------------------- | --------------------------------------------------------------- | ---------------- | ---------------- |
| Critical residual-risk acceptance         | `AuthorizationPort`                                             | Yes              | Prohibited       |
| Model approval                            | `AuthorizationPort`                                             | Yes              | Prohibited       |
| Model deployment approval                 | `AuthorizationPort`                                             | Yes              | Prohibited       |
| Model suspension override                 | `AuthorizationPort`                                             | Yes              | Prohibited       |
| Critical prompt promotion                 | `AuthorizationPort`                                             | Yes              | Prohibited       |
| Critical dataset approval                 | `AuthorizationPort`                                             | Yes              | Prohibited       |
| Agent activation                          | `AuthorizationPort`                                             | Yes              | Prohibited       |
| AI/agent kill-switch activation           | `AuthorizationPort`; emergency policy may be one-way permissive | Policy-dependent | Prohibited       |
| Kill-switch recovery/reactivation         | `AuthorizationPort`                                             | Yes              | Prohibited       |
| Evidence-affecting destructive transition | Existing evidence/destruction governance                        | Yes              | Prohibited       |

Open policy values, to be decided before runtime implementation:

- exact permission names;
- compatible and incompatible authority classes;
- required number of independent approvers;
- physical-human independence evidence;
- approval and consume expiry;
- emergency suspension authority;
- reactivation verification evidence; and
- whether some transitions require global governance context.

## 6. Data classification policy

Each governed AI asset must carry a classification and handling profile.
At minimum the profile must address residency, retention, redaction,
encryption, access, logging, evidence linkage, and event publication.

| Asset                     | Minimum governance                                                     |
| ------------------------- | ---------------------------------------------------------------------- |
| Prompt/prompt version     | Classification, immutable hash, access policy, redacted logging        |
| Dataset/dataset version   | Classification, provenance, permitted uses, residency and retention    |
| Model artifact/version    | Identity, hash, provenance, provider/source, trust and signature state |
| AI input/output           | Tenant binding, classification, retention, redaction, evidence policy  |
| Evaluation artifact       | Immutable result metadata, evidence references, restricted raw content |
| Embedding/vector material | Source lineage, tenant namespace, deletion/retention propagation       |

Secrets, credentials, sensitive prompt content, raw datasets, model
weights, sensitive model output, and raw evidence must not be copied into
ordinary audit or event payloads. Events should carry bounded metadata,
hashes, stable references, and classification-safe state transitions.

## 7. Model artifact trust

Where applicable, a governed model artifact must provide:

- stable model and version identity;
- cryptographic hash;
- source/provider identity;
- provenance and evidence references;
- trust state;
- signature algorithm and verification state;
- quarantine, suspension, and revocation state; and
- immutable lifecycle history.

XCF source-trust patterns and XCAP-005 provenance are reused. AIGCP must
not become a duplicate XCF artifact source or provider execution system.

## 8. Event authority

No `ai_events` event bus or parallel event authority is permitted.
AIGCP domain state may include explicit observation or evaluation records,
but publication occurs only through Event Foundation and the transactional
outbox.

## 9. Framework mapping authority

XCF owns framework identity, releases, and canonical mappings. AIGCP may
reference XCF IDs and add AI-specific applicability/evidence overlays only
after the relevant XCF mapping authority is governed. XCF-M2 is not
authorized by this package.

## 10. Kill-switch governance

The kill switch must be independent of the model or agent it controls,
tenant-aware, authorization-governed, auditable, evidence-producing, and
fail closed where policy requires.

Suspension must support bounded scope. Reactivation is a separate protected
transition and must follow:

```text
human or authorized request
  -> AuthorizationPort
  -> MPA where required
  -> reactivation
  -> independent verification
  -> audit and evidence
```

No agent runtime or kill-switch implementation is authorized by this
registry.

## 11. Status boundary

This registry closes governance semantics only. It does not establish
implemented, qualified, deployed, or production-ready capability.
