# ADR-XCF-003: Source trust and version activation

Status: `APPROVED`

## Context

External framework and advisory data can be stale, spoofed, revoked or corrupted.

## Decision

Every source, fetch, artifact, parser, release and activation has immutable identity, integrity
metadata, trust classification and lifecycle state. Download, validation and activation are
separate. Activation and revocation are protected, audited operations; failed artifacts are
quarantined and cannot become active.

## Consequences

Silent latest-version substitution and trust-on-first-use activation are prohibited.
