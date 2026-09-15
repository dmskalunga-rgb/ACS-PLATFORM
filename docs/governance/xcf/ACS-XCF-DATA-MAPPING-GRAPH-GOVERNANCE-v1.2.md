# ACS-XCF data, mapping and graph governance v1.2

## Scope classes

```text
GLOBAL_KNOWLEDGE = approved public frameworks, releases, CVE/CWE/KEV, ATT&CK/D3FEND and canonical public mappings
TENANT_KNOWLEDGE = tenant assets, identities, incidents, evidence, assertions, decisions, responses and outcomes
GLOBAL_WITH_TENANT_OVERLAY = global objects referenced by private tenant assertions without modifying global truth
TENANT_TO_GLOBAL_PROMOTION = PROHIBITED_WITHOUT_GOVERNED_REVIEW
```

Global knowledge is not tenant-writable by default. Tenant overlays carry `tenant_id`, trusted context,
RLS/FORCE RLS and separate identity from the referenced global object.

## Mapping contract

Every future mapping records `mapping_id`, versioned source/target identities, governed relationship,
source/target versions, mapping class, system-derived confidence when applicable, authoritative source,
curator, approver, human-validation state, validity, supersession, revocation and provenance.

Classes: `AUTHORITATIVE`, `CURATED`, `INFERRED`, `AI_ASSISTED`, `HUMAN_VALIDATED`.

Precedence is authoritative publisher mapping, approved human-validated mapping, curated mapping,
inferred mapping, then AI-assisted proposal. Lower precedence cannot silently override higher
precedence. Conflicts coexist as explicit contested assertions until governed resolution. Missing
provenance, unresolved versions or revoked endpoints make a mapping ineligible for activation.

## PostgreSQL-first graph

Initial persistence is a relational node/edge model in PostgreSQL with stable IDs, typed relations,
source/target versions, temporal validity, provenance, scope class, tenant ID where applicable,
expected version, indexes and constraints. JSONB is allowed only for bounded versioned metadata.

Traversal requires trusted context, authorization, maximum depth, maximum result count, time budget,
cycle handling and bounded telemetry. Tenant inference leakage and timing/cardinality side channels are
mandatory negative tests.

A different graph database requires benchmark evidence, recovery/operations analysis, a separate ADR
and explicit human approval. This document authorizes no runtime graph.
