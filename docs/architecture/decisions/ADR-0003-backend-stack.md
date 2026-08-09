# ADR-0003: Backend stack

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-II-2.4-2.7`, `VOL-VII-7.3-7.10`, `VOL-VIII-8.3`

## Context and alternatives

The platform needs versioned APIs, modular boundaries, workers, events, high concurrency,
observability, security, Linux/Kubernetes deployment, and Windows developer interoperability.
Java/Spring and .NET offer mature enterprise platforms but introduce a second language beside
the web stack. Go provides efficient services but a smaller application ecosystem. TypeScript
on Node.js provides one contract language, a mature ecosystem, and strong I/O concurrency.

## Decision

Use Node.js 24 LTS, TypeScript, and Fastify for an initially modular platform API. Keep domain
logic independent from Fastify through ports and packages. Introduce workers or separately
deployed services only with an EDIM contract, operational evidence, and an ADR.

## Consequences, risks, and validation

CPU-heavy work must leave the request process. Runtime validation remains mandatory because
TypeScript types do not validate untrusted input. Exact versions, strict compilation, tests,
container builds, and health/readiness probes validate the choice. Node, TypeScript, and
Fastify use permissive open-source licenses; dependency review limits supply-chain risk.
