# ACS-XCF source-trust and Framework Registry governance v1.2

## Trust rule

NIST, CISA, MITRE, CVE/CWE authorities and every future feed are `UNTRUSTED_DATA` until a registered
source, release and artifact pass validation. External intelligence is never ACS authorization.

## Source and artifact contract

Every approved source records `source_id`, `publisher_id`, framework, canonical URI, allowed URI
patterns, source format/version, authentication method, signature policy, trusted-key reference,
hash algorithm, ingestion actor class, license, redistribution constraints, status and review date.

Every artifact records immutable bytes-or-bounded-reference identity, size, media type, source hash,
signature result, retrieval time, correlation ID, classification, quarantine state and XCAP-005
evidence reference where policy requires custody.

States: `DISCOVERED → VALIDATING → QUARANTINED|VALIDATED → ACTIVE → SUPERSEDED|REVOKED|REJECTED`.
Only `ACTIVE` releases can provide current knowledge. Historical releases remain reproducible.

## Future Framework Registry objects

| Object            | Required governance                                                                 |
| ----------------- | ----------------------------------------------------------------------------------- |
| Publisher         | stable ID, legal identity, trust/revocation status                                  |
| Framework         | stable ACS ID, publisher binding, name and classification                           |
| FrameworkRelease  | unique framework+version, immutable source hash, temporal validity and supersession |
| FrameworkObject   | release-bound external ID, type, canonical payload hash and provenance              |
| Control           | FrameworkObject subtype with hierarchy and release binding                          |
| ExternalReference | typed URI/identifier and publisher ownership                                        |
| SourceArtifact    | content/reference identity, hash/signature/license and evidence reference           |
| Supersession      | old/new release binding, reason, approver and time                                  |
| Revocation        | target, scope, reason, authority, effective time and propagation state              |
| Provenance        | source, release, artifact, ingestion actor, validation policy and timestamps        |

## Determinism and concurrency

- Idempotency key: tenant-independent global source ID plus publisher release identity and artifact
  digest; replay with different bytes is conflict.
- Release activation uses expected version and serialization/locking.
- Active-release uniqueness and immutable history require database constraints.
- Partial ingestion remains inactive and invisible to consumers.
- Revocation and supersession never rewrite historical DecisionEvidence.

## Protected lifecycle authority

Source and release permissions, global custodian roles, activation/revocation MPA policies,
cardinality and transaction ordering are frozen in
`ACS-XCF-M1-AUTHORITY-SCOPE-AND-MPA-CATALOG-v1.0.md`. Registration, ingestion and validation never
imply activation. Activation and revocation require the canonical two-person MPA composition;
emergency suspension is an authorized fail-closed operation that cannot activate a replacement or
erase history.

No schema, migration, connector or ingestion runtime is authorized by this document.
