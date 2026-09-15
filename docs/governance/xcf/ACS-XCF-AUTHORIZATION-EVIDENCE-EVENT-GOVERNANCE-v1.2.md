# ACS-XCF authorization, evidence and event governance v1.2

## Canonical authority reuse

`AuthorizationPort` is the protected-action decision authority. Canonical MPA supplies SoD,
dual-control and physical-human attestation where policy requires it. XCF creates neither a policy
engine nor an approval engine.

Future permission concepts, not registrations, include source administration/activation, release
approval, mapping create/approve/revoke, graph traversal, global administration, tenant knowledge
read, DecisionEvidence read/export, response recommend, authorization request, tenant-to-global
promotion and learning-proposal review. Least privilege and default assignment `NONE` are mandatory.

## DecisionEvidence

`DecisionEvidence` is a derived XCAP-005 evidence record. It references source evidence, tenant,
framework releases, mappings, provenance, confidence, AI/model binding when applicable, human
validation, recommendation, authorization, decision, execution owner and outcome. It never replaces
raw evidence and cannot create a parallel custody store.

```text
PARALLEL_EVIDENCE_STORE = PROHIBITED
RAW_EVIDENCE_MUTATION = PROHIBITED
```

## Event governance

Candidate event families are `xcf.framework_source.registered`, `xcf.framework_release.ingested`,
`.quarantined`, `.activated`, `xcf.mapping.proposed`, `.approved`, `.revoked`,
`xcf.knowledge_relation.created`, `xcf.risk_context.enriched`, `xcf.decision_evidence.derived`,
`xcf.recommendation.generated`, `xcf.authorization.requested`, `xcf.response_outcome.observed`, and
`xcf.learning_proposal.created`.

Every future event must use the Event Foundation envelope, semantic version, tenant ID where scoped,
correlation/causation IDs, bounded classification-safe metadata and transactional outbox. Raw
framework artifacts, raw evidence, secrets, prompts and unrestricted model output are prohibited in
normal events. Candidate names remain governance; this document creates no runtime event schema.

## XCAP-011 reuse

Direct reuse covers Fusion request/result, REFUSED/failure semantics, evidence references, tenant and
request/correlation context, AuthorizationPort, MPA, audit, outbox and transaction boundaries. Fused
context and provenance are extended only through versioned adapters. Future model execution uses the
AI Gateway and requires separate trusted-provider authorization.
