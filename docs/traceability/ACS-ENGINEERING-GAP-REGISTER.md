# ACS Engineering Gap Register

Status: Initial Phase C register

Scope: Baseline-to-repository gaps observed before functional implementation

Gap IDs are local assessment identifiers. They are not normative requirements and do not
modify the ACS baseline.

Severity levels: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`. A blocking gap prevents the named
phase or dependent capability from being accepted; it does not necessarily prevent all
earlier foundation work.

| Gap ID | Category | Source | Description | Severity | Dependency | Roadmap phase | Blocking | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ACS-GAP-0001 | GOVERNANCE | VOL-VIII-8.4 | QG-18–QG-22 are undefined in the physical baseline | CRITICAL | Formal baseline authority | Phase 0 / Phase 38 | Yes for complete gate catalog and QG-34 | Obtain formal definitions or disposition; never infer them |
| ACS-GAP-0002 | GOVERNANCE | VOL-IX-v5.3 | Historical `FROZEN` wording conflicts with conditional candidate custody | HIGH | QG-34, authorities, custody hash | Phase 38 | Yes for formal freeze | Retain candidate status until formal evidence is registered |
| ACS-GAP-0003 | DOCUMENTATION | VOL-V / VOL-VIII | Historical counts reference 65/70 domains and Roadmap 0–32 | MEDIUM | v5.3 precedence | Phase 0 | No | Maintain approved consolidated catalogs for 75 domains and Phases 0–38 |
| ACS-GAP-0004 | GOVERNANCE | ANX-A ECOM | Ownership matrix is not exhaustive | HIGH | Domain-owner approvals | Phase 0 and every slice | Yes for affected slices | Complete owner records before implementation |
| ACS-GAP-0005 | ARCHITECTURE | ANX-B EDIM | Dependency/integration matrix is not exhaustive | HIGH | ECOM and contract owners | Phase 0 and every integration | Yes for affected integrations | Define producer, consumer, contract, SLA, failure policy, tests, and evidence |
| ACS-GAP-0006 | DATA | ANX-C EDOLM | Data ownership and lineage matrix is not exhaustive | HIGH | ECOM, data owners/stewards | Phase 0 and every data slice | Yes for affected data | Define authoritative source, classification, lineage, retention, deletion, and tests |
| ACS-GAP-0007 | TRACEABILITY | VOL-VIII-8.5/8.6 | Most prose requirements lack individual `ACS-REQ` IDs | HIGH | Governance approval | Phase 0 | Yes for complete traceability | Establish approved identifiers; use stable source references temporarily |
| ACS-GAP-0008 | API | VOL-VII-7.4 | API requirements are primarily descriptive; no OpenAPI exists | HIGH | Stack and domain boundaries | Phase 0/1 onward | Yes for API delivery | Approve API standards and versioned contracts per slice |
| ACS-GAP-0009 | ARCHITECTURE | VOL-VII-7.7 | Events are descriptive for many domains; no schemas or bus exist | HIGH | EDIM and service boundaries | Phase 0/1 onward | Yes for event delivery | Establish event catalog, schemas, ownership, idempotency, retry, DLQ, and compatibility |
| ACS-GAP-0010 | ARCHITECTURE | VOL-II / VOL-VII | No approved application, service, or repository architecture exists | CRITICAL | Architecture authority | Phase 0 | Yes | Create reviewed ADRs for boundaries, layout, runtime, integration, and deployment |
| ACS-GAP-0011 | ARCHITECTURE | VOL-VII | No language, framework, package manager, or reproducible toolchain is selected | CRITICAL | ADR approval | Phase 0 | Yes | Select versions and dependency-locking policy through ADRs |
| ACS-GAP-0012 | BACKEND | VOL-VII-7.3 | No backend source, domain layers, services, or workers exist | CRITICAL | Phase 0 architecture | Phase 1 onward | Yes | Implement only after Phase 0 entry/exit controls are defined |
| ACS-GAP-0013 | FRONTEND | VOL-VII-7.2 | No frontend source, routing, state, UI system, accessibility, or tests exist | CRITICAL | Phase 0 architecture and APIs | Phase 1 onward | Yes | Select frontend architecture and implement real-data slices only |
| ACS-GAP-0014 | DATA | VOL-VI | No PostgreSQL/Supabase schema, migration, constraint, index, or data test exists | CRITICAL | EDOLM and migration standard | Phase 1 onward | Yes | Establish canonical migration and rollback framework before entities |
| ACS-GAP-0015 | MULTI_TENANCY | VOL-I-1.4 / VOL-VI-6.5 | No tenant model, RLS policy, least-privilege model, or isolation test exists | CRITICAL | Platform Foundation data model | Phase 1 | Yes | Treat tenant isolation and RLS tests as Phase 1 acceptance blockers |
| ACS-GAP-0016 | SECURITY | VOL-III / VOL-V-5.23 | No application security architecture or enforceable control implementation exists | CRITICAL | Stack, threat model, environments | Phase 0/1 | Yes | Define threat model, control baseline, secure defaults, and verification |
| ACS-GAP-0017 | AI | VOL-IV-4.2 | No AI Gateway, model registry, policy, evaluation, audit, or fallback exists | HIGH | Platform foundation and AI governance | Phase 17 | Yes for AI capabilities | Prohibit direct model access; implement only through approved AI Gateway slice |
| ACS-GAP-0018 | INFRASTRUCTURE | VOL-II-2.6 / VOL-VIII | No Docker, Kubernetes, IaC, environment, deployment, or rollback artifact exists | CRITICAL | Stack and environment ADRs | Phase 0/20 | Yes for deployment | Define reproducible environment and deployment architecture |
| ACS-GAP-0019 | TESTING | VOL-VIII-8.3 | No unit, integration, contract, E2E, SQL, RLS, security, performance, or resilience tests exist | CRITICAL | Toolchain and implementation | Phase 0 onward | Yes for every slice | Establish test pyramid, environments, evidence, and gate integration |
| ACS-GAP-0020 | OBSERVABILITY | VOL-VII-7.10 | No logs, metrics, traces, health checks, SLOs, or correlation implementation exists | HIGH | Runtime/service architecture | Phase 0/1 onward | Yes for production-capable slices | Define telemetry conventions and minimum service instrumentation |
| ACS-GAP-0021 | DEVSECOPS | VOL-V-5.23 / Bootstrap | CI performs repository safety only; SAST, SCA, SBOM, container and IaC scanning are absent | HIGH | Selected stack and artifacts | Phase 0 | Yes for production pipeline | Add stack-appropriate scanners with pinned configuration and evidence |
| ACS-GAP-0022 | SECURITY | VOL-I-1.4 / Bootstrap | No runtime environment contract or secret-reference strategy exists | HIGH | Environment architecture | Phase 0 | Yes before runtime configuration | Define approved secret manager interfaces and safe `.env.example` only when variables exist |
| ACS-GAP-0023 | ARCHITECTURE | VOL-II-2.7 / VOL-VII-7.6–7.8 | Event Bus, Workflow Engine, Integration Gateway, agents, collectors, and connectors are absent | HIGH | Service boundaries and EDIM | Phase 1 onward | Yes for dependent capabilities | Define canonical transverse ownership before introducing components |
| ACS-GAP-0024 | TRACEABILITY | VOL-VIII-8.6 | Initial area-level traceability now exists, but implementation-level bidirectional traceability is incomplete | HIGH | Requirement catalog, ECOM, EDIM, EDOLM | Phase 0 onward | Yes for slice completion | Expand incrementally before each vertical slice and attach evidence |
| ACS-GAP-0025 | DOCUMENTATION | VOL-VIII / VOL-IX | Decision, requirement, evidence, operations, and Quality Gate execution records are absent | HIGH | Governance procedures | Phase 0 | Yes for gated completion | Define templates, ownership, review, approval, and immutable evidence handling |

## Summary by category

| Category | Current condition |
| --- | --- |
| GOVERNANCE | Baseline present but unresolved custody, gate, and matrix completeness gaps |
| ARCHITECTURE | No implementation architecture or selected stack |
| DATA | No canonical physical model or data governance implementation |
| SECURITY | Repository policy exists; runtime/application security is absent |
| MULTI_TENANCY | Entirely absent |
| BACKEND | Entirely absent |
| API | Entirely absent |
| FRONTEND | Entirely absent |
| AI | Entirely absent |
| DEVSECOPS | Minimal repository validation only |
| INFRASTRUCTURE | Entirely absent |
| TESTING | Entirely absent |
| OBSERVABILITY | Entirely absent |
| DOCUMENTATION | Normative bootstrap exists; engineering execution records are missing |
| TRACEABILITY | Initial assessment matrix exists; implementation-level mapping remains incomplete |

## Phase 0 disposition

The initial observations remain historical evidence. Phase 0 adds implementation for
ACS-GAP-0010, 0011, 0014, 0015, and 0018-0022, subject to local/CI verification and review.
It provides partial boundaries for 0008, 0009, 0016, 0017, and 0023-0025. It does not close
functional gaps 0012/0013 or authorize domains 5.x.

These conditions remain explicitly open:

- ACS-GAP-0001: QG-18 through QG-22 are `UNDEFINED_IN_BASELINE`;
- ACS-GAP-0002: baseline custody ambiguity;
- ACS-GAP-0004/0005/0006: ECOM, EDIM, and EDOLM are incomplete working catalogs;
- ACS-GAP-0007: individual `ACS-REQ` identifiers remain absent;
- signing/provenance, production secrets, broker selection, IAM, AI engines, production
  infrastructure, SLOs, and full performance/resilience/E2E suites remain pending.
