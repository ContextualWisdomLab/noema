# Noema Context Map

## Status

This document separates protected behavior from the runtime-orchestration direction. Protected `main` remains the authority for what is shipped. A bounded context listed as a target does not become implemented merely because it appears here.

Noema owns an evidence-producing credential and maintenance control plane plus a narrow protected runtime-orchestration foundation. Expansion into broader agent/application runtime orchestration must reuse those existing authority boundaries rather than turning Noema into a model router, a foreign product system of record, or an arbitrary command runner.

## Current protected contexts

### Credential Exchange

Owns GitHub Actions OIDC verification, exact reusable-workflow source identity, replay/rate controls, repository-scoped GitHub App capability minting, and the `/health`, `/ready`, `/exchange` HTTP boundary. Credential evidence is not review, merge, release, deployment, or legal authority.

### Maintenance Control

Owns exact-head/live-base observation, check/review/security evidence separation, short-lived maintainer capability handoff, stale-target refusal, work-conserving repository maintenance, and buyer/audit receipts. It does not own organization governance settings or foreign repository source.

### Isolation Integration

Owns Noema's caller-side contract for bounded quarantine and validator execution. Wardnet, EgressWeave, or another canonical isolation/security product remains authoritative for its own runtime when used. Noema consumes a versioned port/ACL and never copies the security owner's implementation.

### Policy / Approval

Owns the distinction between technical evidence and authority. Model judgement, scanner output, status/check results, sandbox evidence, and generated proposals cannot silently become formal approval or mutation authority.

### Observability

Owns bounded operational evidence for Noema behavior, exact source/run identity, readiness, KPI integrity, and buyer-verifiable receipts. Telemetry must not contain raw bearer tokens, App private keys, unnecessary reasoning payloads, or foreign product state.

### Recovery

Owns bounded retry/timeout/cancellation semantics, fail-closed recovery evidence, rollback preconditions, and stale-target revalidation. Silent retry of side-effecting operations is forbidden.

## Runtime-orchestration target contexts

The following contexts are the accepted decomposition for runtime behavior. Protected `main` already implements foundations in Agent Runtime, Workflow / Task Execution, and State / Checkpoint; the remaining behavior in each context is added only by separately verified slices. These boundaries do not claim that Noema is already a general-purpose agent runtime or that protected source proves production deployment.

### Agent Runtime

Owns the lifecycle of one Noema agent/application execution: accepted execution identity, lifecycle state, cancellation, completion, and recovery routing. It does not discover or route models.

Protected `main` includes the execution-lifecycle primitive introduced by #528: explicit accepted, running, cancellation-requested, and terminal transitions; exact duplicate delivery of the signal that established the current state is idempotent; contradictory or out-of-order signals fail closed; cancellation dominates late completion; retry/recovery uses a separate execution identity rather than inheriting implicit side-effect authority.

### Workflow / Task Execution

Owns explicit workflow/task dependency and execution order, bounded concurrency, idempotent step identity, claim authority, and side-effect classification. Recursive/unbounded task creation and implicit duplicate side effects are forbidden.

Protected `main` includes bounded task-plan admission and runnable-task selection. It accepts one canonical execution identity, a finite acyclic dependency graph, explicit `pure`/`idempotent`/`side_effecting` classification, and bounded concurrency. Declared task order is deterministic scheduling priority. Runtime state must account for every admitted task exactly once; foreign, malformed, duplicate, or incomplete state evidence fails closed. Failed or cancelled work is never selected as an implicit retry, and failed dependencies do not release descendants. Authority-bearing plan fields and nested dependencies are detached and frozen after one-time reads so caller accessors or aliases cannot change an admitted execution plan.

Protected `main` also includes the durable execution slice integrated through #542: Durable Object state binding/routing, complete execution-plan binding, atomic task claim and checkpoint CAS, effect-start/terminal transitions, cancellation/recovery authority, retained provenance, and hostile stored-record validation. A claim is explicit retained runtime authority, not evidence that an external side effect succeeded. ADR 0013 remains `Proposed` because source integration does not prove deployed Durable Object transaction compatibility or production runtime operation.

### Tool / Capability Boundary

Owns versioned allowlisted tool/capability descriptors, least-authority invocation, expiry, input/output bounds, and capability provenance. Arbitrary caller/model shell or network authority is not a Noema tool contract.

Protected `main` includes a local fail-closed admission port for external Claude community plugins (`src/tool-capability/external-extension-admission.ts`, ADR 0015, issue #545). Marketplace metadata, Anthropic review, mutable branch/tag refs, and plugin instructions are not admission authority. Exact repository/commit/path/digest identity, independently pinned AppGuardrail and quarantine receipts, product/role scope, expiry/rollback, and idempotent activation/invocation receipts are. Product-runtime execution of a Claude plugin wrapper is rejected. Until `context-graph-contracts` publishes an immutable shared artifact contract, this port is a local ACL/test double rather than a released shared-kernel dependency.

Protected `main` extends that boundary with append-only lifecycle evidence integrated through #574, operability/provenance admission through #577/#578/#579, and the SQLite-backed Worker Durable Object binding/runtime through #580. One lifecycle stream is partitioned by `external_extension_id` plus exact admitted repository/commit/path/artifact identity. Noema persists its own transition/version/head authority and immutable owner-issued references/digests only; AppGuardrail verdict bytes, quarantine execution truth, isolation policy, Egress authority, identity secrets, and contextual-orchestrator routing remain with their canonical owners. A genuinely new `active` transition must re-read fresh Policy / Approval and owner evidence before the CAS append. An exact transition already committed remains immutable historical evidence and replays without treating later owner-state drift as retroactive revocation. Protected source deliberately remains fail-closed for a genuinely new `active` transition until a production activation-authority adapter is injected; source integration is not production deployment or immutable release authority.

### State / Checkpoint

Owns versioned runtime checkpoint semantics needed for restart/cancellation/idempotency. Checkpoints contain only Noema runtime state and canonical foreign references; they must not copy another product's domain truth, provider credential state, or unrestricted reasoning/tool payloads.

Protected `main` includes checkpoint admission for one retained execution identity. Sequence zero initializes the checkpoint stream; an exact same-sequence/same-digest replay is idempotent; conflicting replay, stale or gapped sequence, cross-execution identity, non-canonical execution identity, and non-SHA-256 state evidence fail closed. Returned checkpoint metadata is detached and frozen so caller-owned aliases cannot mutate admitted authority after validation. The #542 durable state store binds persisted transitions to retained execution-plan and claim authority and rejects malformed, contradictory, stale, gapped, cross-execution, or provenance-invalid stored records. This does not grant foreign-domain truth or external side-effect success authority.

Protected `main` reuses the same Durable Object storage/transaction family for external-extension lifecycle State / Checkpoint evidence rather than introducing another database authority. Transition digests are computed outside the short write transaction; the serialized write rechecks expected version, prior state, and prior head digest before appending the event and updating the current projection. The current-state path verifies the compact head and its exact audit tail with O(1) storage cardinality, while audit/recovery verifies the complete retained digest chain. The lifecycle log is deliberately not the workflow store's bounded 128-receipt observability ring. The `NOEMA_EXTERNAL_EXTENSION_LIFECYCLE` → `NoemaExternalExtensionLifecycle` SQLite Durable Object binding/topology is protected source through #580. Real deployed Durable Object p95, contention, storage-growth, rebuild, and recovery evidence remain acceptance work and are not inferred from source or unit tests.

## Upstream and downstream boundaries

### contextual-orchestrator

`ContextualWisdomLab/contextual-orchestrator` owns model discovery, routing, test-time compute, provider failover, and upstream provider credentials. Noema consumes its versioned gateway contract. Noema must not add direct provider SDKs, provider keys, fallback lists, or model-routing policy as a local substitute.

### context-graph-contracts

`ContextualWisdomLab/context-graph-contracts` is the provider-neutral Shared Kernel for canonical object/authority references, truth status/origin, valid/system time, provenance, Context Assertion, CloudEvents/schema, conformance, and admission contracts.

Noema may integrate only against an immutable released contract package/profile. It must not import sibling repository implementation source or guess a future schema from an open Draft. Runtime/service/API/worker, integration technology, lifecycle/risk/ownership/remediation, and transformation changes can be projected only through the released versioned contract. Agent task/result/reasoning/tool payloads do not become authoritative architecture facts merely by being emitted as events.

### enterprise-architecture-core

`ContextualWisdomLab/enterprise-architecture-core` is the authoritative Enterprise Architecture Decision Plane. Noema publishes or exposes versioned evidence/proposals through the released Context Graph boundary; EA Core decides authoritative architecture state. Noema does not write EA application tables or reinterpret EA truth locally.

### Security and isolation owners

Wardnet, EgressWeave, AppGuardrail, governance-risk-compliance, and other dedicated products retain their own domain truth. Noema integrates via explicit released API/event/evidence contracts and an Anti-Corruption Layer where translation is required.

## Data and integration rules

- cross-service SQL is forbidden; another product's database is never a Noema integration API;
- foreign records are held as canonical references plus bounded provenance/evidence, not copied as Noema-owned truth;
- contract/profile version, provenance, truth status, valid time, and system time remain distinct where the released shared contract defines them;
- absent, unreleased, stale, or non-conformant shared-contract evidence fails closed rather than triggering a source-copy workaround;
- Noema runtime state, model/provider routing state, enterprise-architecture truth, and product-domain truth remain separately authoritative.

## Dependency direction

```text
Noema Agent Runtime / Workflow / Capability / Checkpoint
        |           |              |
        |           |              +--> canonical isolation/security ports
        |           +-----------------> contextual-orchestrator gateway
        +------------------------------> released context-graph-contracts
                                           |
                                           v
                              enterprise-architecture-core
                              (authoritative EA decisions)
```

No dependency arrow grants source-write authority to the upstream or downstream repository. Each repository retains its dedicated writer and release/governance process.

## Acceptance for a new runtime slice

A new runtime slice is acceptable only when it has a named owning context, realistic cancellation/restart/checkpoint/idempotency/tool-policy/concurrency/isolation tests as applicable, bounded side effects, exact observability, and an explicit foreign-authority contract. A feature that requires direct provider routing, arbitrary tool authority, ambient secret propagation, unbounded recursion, silent retry, cross-service SQL, or unreleased Context Graph source is outside the accepted Noema boundary.
