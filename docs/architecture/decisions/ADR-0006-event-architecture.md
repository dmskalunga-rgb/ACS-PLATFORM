# ADR-0006: Event architecture

Status: `ACCEPTED_ON_PHASE_0_BRANCH`

Date: 2026-08-08

## Baseline sources

`VOL-II-2.4`, `VOL-II-2.7`, `VOL-VII-7.7`

## Context and alternatives

Direct synchronous integration is simple but couples availability. Broker events decouple
producers while introducing ordering, replay, and duplicate-delivery concerns. The baseline
requires an Event Bus but does not choose a product.

## Decision

Define a broker-neutral versioned envelope containing `event_id`, `event_type`,
`schema_version`, `tenant_id`, `timestamp`, `correlation_id`, `causation_id`, `producer`,
`classification`, and `payload`. Delivery is at-least-once; consumers are idempotent, retries
are bounded with jitter, poison messages enter a DLQ, and replay requires authorization,
scope, audit, and rate controls. A broker selection is deferred until workload evidence exists.

## Consequences, risks, and validation

Consumers must tolerate duplicates and compatible evolution. Contract tests validate the
envelope now; EDIM ownership, compatibility tests, retry/DLQ evidence, and replay audit are
required before functional events.
