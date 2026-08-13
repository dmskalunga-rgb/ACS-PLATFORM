# ADR-0013: Production OIDC/JWT authentication

Status: `PROPOSED`

Decision class: `SECURITY_IMPLEMENTATION_DECISION`

Date: 2026-08-12

## Context and baseline drivers

VOL-I 1.4, VOL-II 2.7, VOL-VII 7.3-7.5/7.10 and VOL-VIII 8.2-8.4 require real
authentication, separate authorization, audit, observability and tests. The integrated Phase 1
tenant-context path is fail-closed but production identity is deliberately `not-configured`.

Owners remain `PENDING_GOVERNANCE_APPROVAL`: Platform Authentication technical owner, Identity
Security owner, and identity-mapping data owner/steward.

## Decision

Use a provider-neutral `ProductionIdentityProvider` boundary. The first adapter validates bearer
JWT access tokens with `jose` 6.2.8 against one explicitly configured HTTPS issuer, ACS audience,
allowlisted asymmetric algorithms and a configured HTTPS JWKS URI. The token header cannot choose
an issuer, JWKS location or algorithm policy.

The stable external identity key is `iss + sub`, encoded as an unambiguous compound subject for
the existing canonical user mapping. Email/profile claims are attributes only and are neither
persisted nor used for authorization. Unknown identities fail closed; JIT provisioning is not
part of this slice.

## Alternatives

1. Decode without signature validation: rejected.
2. Implement JWT cryptography locally: rejected in favor of a maintained JOSE implementation.
3. Couple the service to one vendor SDK: rejected to preserve provider neutrality.
4. Server-side/BFF session subsystem: deferred; it would exceed this slice.
5. Validate access-token bearer JWTs at the API boundary: selected.

## Validation policy

- signature: required; unsigned tokens and `alg=none` are rejected;
- algorithms: explicit configured allowlist, initially `RS256`, `PS256` and/or `ES256`;
- issuer and audience: exact configured validation, including JWT string/array audiences;
- time: `exp`, `nbf` and `iat` required and checked with bounded clock tolerance (default 60s,
  maximum 300s); future `iat` beyond tolerance is rejected;
- subject: non-empty `sub`, scoped by validated issuer;
- assurance: trusted `acr` and `amr` are parsed and exposed to the application boundary; this
  slice does not invent enterprise MFA administration. A future privileged action must declare
  and enforce its required assurance before delivery.

## JWKS and rotation

The JWKS URI is configured with the trusted issuer; token `jku`/`x5u` values are ignored. HTTPS is
mandatory outside tests. Retrieval has a bounded timeout, cooldown and cache lifetime. Cached
keys are used normally; a legitimate unknown `kid` triggers one bounded refresh through the JOSE
remote JWKS resolver. Failure to obtain a trusted key fails closed. Readiness is not permanently
coupled to the IdP; authentication dependency status is reported separately as available,
degraded or not configured.

## Session and replay implications

The API uses short-lived bearer access tokens and does not create a server-side session. The web
client accepts an access token only through an injected in-memory session boundary and never
persists it to localStorage/sessionStorage. Local logout clears memory only; IdP logout and token
revocation are not claimed. Bearer theft permits replay until expiry, mitigated by TLS, short token
lifetime, CSP/XSS controls, redaction, audience scoping and IdP revocation policy.

## Failure and audit policy

Malformed, expired, future, wrong issuer/audience, disallowed algorithm, invalid signature,
unknown-key and JWKS failures return one normalized unauthenticated response. Internally they are
classified into safe reason codes and durably audited without raw tokens, claims, keys or URLs.
Authentication metrics use only safe outcome/reason labels, never subject, token or tenant IDs.

## Operational and tenant implications

Production/staging startup fails if OIDC mode is selected with missing or invalid configuration;
it never falls back to development identity. Valid authentication still grants no tenant access:
canonical user, active membership, permission, transaction-bound context and RLS remain required.
Secret material, if a future confidential client needs it, must enter through runtime secret
interfaces; this bearer-validation slice requires no client secret.

Audit retention and the final owner assignments remain `PENDING_GOVERNANCE_APPROVAL`. This ADR
does not approve ADR-0011/0012, broad IAM, JIT provisioning, Phase 2 or production deployment.
