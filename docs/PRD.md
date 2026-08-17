# Noema Product Requirements Document

## Status

**Proposed canonical PRD — In review on PR #71.** Until protected integration, protected source and live GitHub governance remain implementation authority. This PRD describes the current protected product boundary and marks active, external, or planned evidence explicitly.

Noema is an evidence-producing credential and maintenance control plane. Its protected runtime verifies GitHub Actions OIDC identity, exchanges that identity for repository-scoped GitHub App capability, and keeps check, status, scanner, model, review, merge, release, deployment, and buyer/legal authorities separate.

## 1. Users and jobs to be done

### Repository maintainer

- determine the exact current source head and independently resolved live base;
- distinguish CI/security/status/review/model evidence before privileged actions;
- repair a verified Noema-owned defect at its real source/test/control boundary;
- integrate only unchanged work that satisfies actual live governance.

### Security/platform operator

- configure and verify GitHub App, OIDC, Cloudflare Worker, Durable Object, network, deployment, and rollback boundaries;
- retain bounded evidence without exposing raw credentials;
- fail closed when environment/App/governance evidence is absent.

### CWL service owner

- consume Noema through versioned HTTP/OIDC/evidence contracts;
- compose with central `.github`, `contextual-orchestrator`, naruon, or another service without shared application tables or ambient credential inheritance.

### Reviewer / buyer / operator

- reconstruct product, architecture, evidence, transfer, and operating boundaries from GitHub without chat archaeology;
- distinguish repository technical evidence from independent approval, deployment, commercial, and legal authority.

## 2. Problems Noema must solve

1. Broad or long-lived repository credentials increase workflow-compromise blast radius.
2. Moving heads, historical PR-base snapshots, stale checks, and predecessor evidence can be mistaken for current authority.
3. Check runs, statuses, scanners, reviews, and model judgements can all look green while meaning different things.
4. Credential-bearing publishers must not execute untrusted PR/model output.
5. One blocked check, reviewer, dependency, or provider must not stall unrelated safe work.
6. Runtime/security decisions stored only in chat or stale PR prose cannot support operation or acquisition diligence.
7. Release, deployment, customer, revenue, ownership, or transfer claims can be overstated if documentation substitutes for real evidence.

## 3. Product principles

- **Least privilege:** capability is purpose-, repository-, role-, operation-, and lifetime-bounded.
- **Exact revision before authority:** mutable identities are refetched before decisions and writes.
- **Evidence is not authority:** checks, statuses, scanners, reviews, models, merge, release, deployment, and legal/commercial evidence remain distinct.
- **Fail closed:** missing, malformed, stale, predecessor, partial, pending, or ambiguous evidence is not passing.
- **Standalone first, composable second:** Noema works independently and integrates through versioned contracts.
- **Work conserving:** waiting blocks only the exact lane; another safe lane continues.
- **No self-repair privilege escalation:** no force push, synthetic approval, branch-patching repair workflow, or gate weakening substitutes for reviewed authority.
- **Evidence-backed commercial claims:** repository prose never fabricates customer, revenue, release, deployment, legal, or transfer evidence.

## 4. Protected product modes

### 4.1 Credential exchange

The Cloudflare Worker exposes `/health`, `/ready`, and `/exchange`.

Protected outer workflow trust uses `ALLOWED_WORKFLOW_REF_PREFIX` as one **exact full workflow ref** despite the legacy variable name. Cryptographic OIDC verification separately validates issuer/audience/repository and token semantics before GitHub App token exchange. A **stronger immutable workflow-source binding is not implemented on protected main** merely because historical documentation once described SHA-paired claims.

### 4.2 Independent review composition

A central reviewer can use Noema capability and separate Reviewer App authority to collect and publish review evidence. Model judgement cannot become formal approval by inference. `contextual-orchestrator` remains the preferred upstream model-routing ownership boundary when model-backed review is used.

### 4.3 Commercial-maintenance control plane

Repository-owned controls inventory exact heads, live bases, checks, statuses, formal reviews, threads, security, governance, and operational evidence. Mutation authority is separate from observation/model authority and must refuse stale targets.

### 4.4 Product-development proposal

Model-backed development may produce bounded proposals, but credential-bearing execution remains separated from untrusted/model execution. Deterministic verification, repository write authority, formal review, merge, release, and deployment remain separate gates.

### 4.5 Patch quarantine and image verification

Protected source includes the patch-quarantine/control family. **PR #407** is the current Draft owner for the patch-validator image/supply-chain lifecycle and must prove its dedicated image build/smoke/SBOM/vulnerability/receipt/final-head path before integration. Historical predecessor #67 remains evidence only until unique-work preservation/supersession is complete.

### 4.6 Acquisition evidence

Protected acquisition-integrity controls authenticate retained evidence and exact-release rights metadata instead of trusting persisted green booleans, mutable paths, ambiguous JSON, or bare URLs. Missing real production/customer/revenue/legal/transfer evidence remains correctly not-ready.

## 5. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | `/health`, `/ready`, and `/exchange` retain distinct liveness, readiness, and credential-exchange semantics. |
| FR-002 | Validate OIDC issuer, audience, repository/organization, and the configured exact full workflow ref using the protected runtime contract. |
| FR-003 | Do not claim workflow SHA fields or immutable workflow-source binding unless protected source and deployment configuration actually implement and prove them. |
| FR-004 | Restrict credential-bearing GitHub/OIDC requests by reviewed origin, path, method, redirect, timeout, and bounded body/response behavior. |
| FR-005 | Coordinate replay protection and pre-auth rate limiting through bounded cross-isolate state. |
| FR-006 | Distinguish exact source head, historical PR-base snapshot, independently resolved live base, stack predecessor, and synthetic integration identity. |
| FR-007 | Keep runner assignment, check runs, statuses, scanner evidence, formal reviews, and model judgement non-substitutable. |
| FR-008 | Fully paginate material evidence or classify the evidence set incomplete. |
| FR-009 | Immediately before mutation, refetch target head/base/ref/blob/review/writer state and refuse an irreconcilably moved target. |
| FR-010 | Classify findings as current-valid, stale, duplicate, incorrect, superseded, infrastructure, or policy before action. |
| FR-011 | Merge only an unchanged head satisfying actual live governance, applicable checks/security, and zero valid unresolved findings; require independent approval only where live policy genuinely requires it. |
| FR-012 | Keep model credentials and repository/reviewer/deployment credentials in separate trust domains; never substitute `COPILOT_GITHUB_TOKEN`. |
| FR-013 | Bind publication/cleanup to exact server-observed identities and conditional mutation. |
| FR-014 | Fail closed when release, deployment, legal, commercial, or transfer evidence is absent or contradictory. |
| FR-015 | Maintain one discoverable canonical PRD/TRD/Architecture/ADR/UML/ERD/traceability/security/test/operability/licensing graph. |
| FR-016 | Continue consuming the safe executable queue after one lane blocks or a scheduler/control-plane error occurs. |
| FR-017 | Treat prompt edits, inventory, RCA, tests, docs, commits, PRs, checks, merges, and handoffs as intermediate while another required executable boundary remains. |

## 6. Non-functional requirements

### Security and privacy

- no raw bearer/private-key material in retained diagnostics or model context unless explicitly required and authorized;
- realistic hostile JSON/UTF-8, oversized body, redirect, destination-confusion, replay, stale-identity, filesystem, and forged-evidence tests;
- reviewer, maintainer, model, release, deployment, and owner/legal identities remain separated.

### Reliability and observability

- liveness and readiness remain distinct;
- transient infrastructure failures are classified separately from source defects;
- retries are bounded and fail closed;
- writes use exact identity/CAS semantics where supported;
- delayed or retried Durable Object operations reread current state before destructive cleanup.

### Quality and accessibility

- owned production statements, branches, functions, and lines target exact 100% where exposed by tooling;
- public APIs require meaningful beginner-readable documentation;
- tests prefer real Request/Response, WebCrypto, GitHub/Cloudflare contracts, and adversarial fixtures over vacuous mocks or broad coverage exclusions;
- **issue #84 source repair is protected truth**: broad credential/security V8 exclusions are regressions, while #71 owns canonical documentation and post-merge proof for that invariant.

### Supply chain and acquisition

- immutable GitHub Action pins and deterministic Node/npm/install-script/lockfile controls are protected-source concerns;
- release evidence binds source, artifact, SBOM, provenance, dependency-license/NOTICE, and rights evidence without inventing legal authority;
- automation never chooses an outbound license or fabricates contributor/IP ownership.

## 7. Current active owners

Current open work is intentionally described narrowly so closed or integrated predecessor PRs are not revived as authority.

- **PR #71** — canonical documentation graph and documentation-contract convergence.
- **PR #407** / issue #66 — patch-validator image/supply-chain verification and current-main convergence.
- **PR #67** — historical patch-validator image predecessor retained only until #407 integration proves unique-work preservation/supersession.

Issue #27 remains the target-governance owner, but the observed-workflow implementation from merged PR #412 is protected-main truth rather than an active PR. Buyer/operator README and readiness/operator documentation from merged PR #413/#415 are likewise protected-main truth and are not separate current owners.

Transient current check conclusions belong to observation-scoped evidence; the durable rule is that non-terminal or predecessor evidence never transfers into passing authority.

## 8. Protected versus external evidence

Protected source can establish implementation contracts, deterministic tests, package/security checks, and machine-readable evidence structure. It cannot itself establish:

- stronger live `main` rules than GitHub currently enforces;
- independent reviewer eligibility/App installation when not provisioned;
- external scheduler activation/deduplication;
- protected production environment approval;
- 30-day production KPI evidence;
- immutable release publication and deployment success unless those events actually occur;
- customer/pilot, revenue/pipeline, support ownership, owner/legal rights, or contributor/IP transfer authority.

Those remain separate external or later-stage evidence and must fail closed when required but absent.

## 9. Acceptance stages

1. implementation exists on an active branch;
2. unchanged exact-head CI/security/review evidence is terminal and applicable;
3. protected integration completes under live governance;
4. protected-main operational acceptance completes where required;
5. immutable release/package/SBOM/provenance evidence completes;
6. production deployment/rollback/recovery evidence completes;
7. commercial/legal/acquisition evidence completes.

An earlier stage never proves a later stage.

## 10. Explicit non-goals

- treating model output, comments, statuses, or scanners as formal approval;
- weakening checks, coverage, security, provenance, or governance for automation convenience;
- inventing workflow SHA controls absent from protected runtime;
- creating direct cross-service application-database coupling;
- fabricating release, deployment, KPI, customer, revenue, licensing, ownership, or certification evidence;
- adding a physical relational ERD before Noema owns such persistence.

## 11. Related authority

- `docs/TRD.md` — technical requirements and evidence semantics.
- `ARCHITECTURE.md` — runtime, trust, MSA, and authority planes.
- `docs/adr/` — durable decisions and status.
- `docs/UML.md`, `docs/ERD.md` — behavior/state/data views.
- `docs/TRACEABILITY.md` — requirement → decision → source/test/evidence mapping.
- `docs/TEST_STRATEGY.md` — realistic validation and exact coverage policy.
- `docs/OPERABILITY.md` — activation, incident, recovery, and operational evidence.
- `docs/DOCUMENTATION_GAP_AUDIT.md` — design sufficiency versus protected-main operational sufficiency.
- runtime and automation threat models — distinct threat surfaces.
- `docs/LICENSING_AND_IP_TRANSFER.md` — owner/legal and exact-release rights boundary.
