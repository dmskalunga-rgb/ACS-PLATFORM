# ADR-0008: AI Gateway boundary

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-IV-4.2-4.10`, `VOL-II-2.7`

## Context and alternatives

Direct model SDK use is quick but defeats centralized policy, classification, cost, safety,
evaluation, and audit. A gateway creates a governed boundary while preserving model portability.

## Decision

No ACS domain may call a model directly. All inference, embedding, retrieval, and tool requests
cross an AI Gateway contract that carries tenant, actor, purpose, classification, correlation,
policy, model capability, and audit metadata. Adapters isolate providers. Phase 0 supplies only
the boundary contract; engines, model selection, RAG, agents, and functional prompts are deferred.

## Consequences, risks, and validation

The gateway is a critical control and capacity point. Later implementation requires data-loss
controls, prompt/tool policy, evaluation, human oversight, explainability, fallback, cost limits,
and immutable audit evidence. Compile-time dependency rules and architecture review prohibit
direct provider dependencies.
