# ADR-0010: Deployment architecture

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-II-2.6`, `VOL-VII-7.1`, `VOL-VIII-8.3`

## Context and alternatives

Hosted platform services improve speed but may constrain sovereignty and on-premises delivery.
VM-only delivery is portable but weaker for consistent orchestration. Containers plus
Kubernetes are supported across cloud and on-premises environments.

## Decision

Build non-root OCI containers from digest-pinned bases. Docker Compose provides a disposable
local environment. Kubernetes manifests use Kustomize bases and environment overlays; secrets
are external references, never manifests. Promotion is immutable artifact promotion through
development, test, staging, and production with evidence and rollback plans. No production
infrastructure is provisioned in Phase 0.

## Consequences, risks, and validation

Kubernetes adds operational cost, so manifests stay minimal until service needs are proven.
Container and IaC scans, manifest rendering, probes, resource limits, SBOMs, and later signing
and provenance validate the supply chain. Cloud-specific services require adapters and ADRs.
