# Noema Context Map

## Status

This document separates protected behavior from the runtime-orchestration direction. Protected `main` remains the authority for what is shipped. A bounded context listed as a target does not become implemented merely because it appears here.

Noema currently owns an evidence-producing credential and maintenance control plane. Expansion into agent/application runtime orchestration must reuse those existing authority boundaries rather than turning Noema into a model router, a foreign product system of record, or an arbitrary command runner.

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

The following contexts are accepted decomposition targets for new runtime behavior. They are not claims that protected `main` already implements a general-purpose agent runtime.

### Agent Runtime

Owns the lifecycle of one Noema agent/application execution: accepted execution identity, lifecycle state, cancellation, completion, and recovery routing. It does not discover or route models.

### Workflow / Task Execution

Owns explicit workflow/task dependency and execution order, bounded concurrency, idempotent step identity, and side-effect classification. Recursive/unbounded task creation and implicit duplicate side effects are forbidden.

### Tool / Capability Boundary

Owns versioned allowlisted tool/capability descriptors, least-authority invocation, expiry, input/output bounds, and capability provenance. Arbitrary caller/model shell or network authority is not a Noema tool contract.

### State / Checkpoint

Owns versioned runtime checkpoint semantics needed for restart/cancellation/idempotency. Checkpoints contain only Noema runtime state and canonical foreign references; they must not copy another product's domain truth, provider credential state, or unrestricted reasoning/tool payloads.

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
