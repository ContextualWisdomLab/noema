# ADR 0012: Runtime orchestration bounded contexts

Status: Proposed

## Context

Protected `main` now contains the first runtime-orchestration foundation delivered through PR #528 while Noema continues to operate its credential and maintenance control plane. Expanding toward runtime Agent/application orchestration must not collapse CWL domain ownership into one service or turn Noema into a model-provider router.

`ContextualWisdomLab/contextual-orchestrator` owns model discovery, routing, test-time compute, provider failover, and provider credentials. `ContextualWisdomLab/context-graph-contracts` owns provider-neutral shared contracts for canonical references, Context Assertions, CloudEvents/schema, provenance, time, conformance, and admission. `ContextualWisdomLab/enterprise-architecture-core` is the authoritative EA Decision Plane. Dedicated security/isolation products retain their own runtime and policy truth.

Protected runtime primitives establish Agent Runtime lifecycle, State / Checkpoint admission, workflow-plan fitness, and a fail-closed Context Graph release-consumer boundary. They need an explicit architectural decision so future workflow, tool, persistence, and integration work cannot infer broader authority from their existence.

## Decision

Noema separates runtime orchestration into these bounded contexts:

- **Agent Runtime** owns one execution identity and its accepted, running, cancellation-requested, and terminal lifecycle. Exact duplicate delivery of the signal that established the current state is idempotent; contradictory or out-of-order lifecycle signals fail closed. Retry or recovery creates a separate execution identity rather than inheriting implicit side-effect authority.
- **Workflow / Task Execution** owns explicit task dependencies, bounded concurrency, idempotent step identity, and side-effect classification. It must not recursively manufacture unbounded work or silently retry a side-effecting task.
- **Tool / Capability Boundary** owns versioned allowlisted capability descriptors, least-authority invocation, expiry, bounded input/output, and capability provenance. Arbitrary model/caller shell, filesystem, network, or secret authority is outside this contract.
- **State / Checkpoint** owns Noema runtime checkpoint admission needed for restart, cancellation, and idempotency. The protected primitive accepts sequence zero as initialization, exact same-sequence/same-digest replay as idempotent, and only the immediately next sequence for the same canonical execution identity. Conflicts, stale/gapped sequence, cross-execution identity, malformed identity, and non-SHA-256 state evidence fail closed. Admitted state is detached and frozen so caller-owned aliases cannot mutate authority after validation.
- **Isolation Integration** owns Noema's caller-side versioned port/ACL to a canonical quarantine/security runtime; it does not copy the security owner's implementation.
- **Policy / Approval** owns the distinction between technical evidence, capability, human/organization authority, and mutation approval.
- **Observability** owns bounded execution/evidence telemetry and exact source/runtime identity without raw secrets or unrestricted reasoning/tool payloads.
- **Recovery** owns bounded retry, timeout, cancellation, restart, rollback preconditions, and stale-target revalidation.

Noema never treats model-provider routing state, another CWL product's domain records, EA architecture state, or security-runtime internals as Noema-owned truth. Foreign information is referenced through released versioned contracts and bounded provenance rather than copied into local authoritative tables. Cross-service SQL is forbidden.

Noema consumes `contextual-orchestrator` for model routing. It does not add direct provider SDKs, provider API keys, local provider fallback lists, or provider-routing policy.

Context Graph integration is fail closed. Noema may emit or consume shared architecture/context evidence only through an immutable released `context-graph-contracts` package/profile with its version, conformance/admission result, canonical references, provenance, and time semantics intact. Release admission also requires a separately authenticated protected-source binding: exact package/SBOM/provenance digests, exact protected source commit, a release-source manifest digest, independently retained attestation-verification digest, `refs/heads/main`, the canonical `supply-chain.yml` signer workflow, and a capability declaring release-source-manifest attestation. A self-asserted commit, mutable Draft source, or internally consistent manifest without independent attestation verification is not production authority. EA Core remains the authority that accepts or rejects architecture projection; Noema does not directly write EA application tables.

## Protected implementation boundary

Protected `main` currently provides:

- `src/agent-runtime/execution-lifecycle.ts` — pure Agent Runtime lifecycle transition authority;
- `src/state-checkpoint/checkpoint-admission.ts` — pure State / Checkpoint admission and immutable checkpoint metadata snapshots;
- `src/workflow-task-execution/` primitives that validate workflow-plan/runtime boundaries without granting foreign authority;
- `src/context-fabric/context-contract-release-admission.ts` — a consumer ACL that separates structural release evidence from independently pinned immutable release authority.

The Context Graph release-source-attestation strengthening remains candidate behavior until its exact branch integrates through protected governance. Durable workflow persistence/routing work on a separate active lane likewise remains candidate truth until protected integration; this ADR does not promote open PR source by reference.

No arbitrary tool executor, direct provider routing, Context Assertion publication authority, EA writer, or security-runtime implementation is implied by these modules. Runtime persistence or deployment evidence is claimed only where protected source and exact operational evidence establish it.

## Consequences

Runtime slices can evolve independently without sharing application tables or importing foreign implementation source. Model-routing and security responsibilities remain replaceable behind explicit ports. Idempotent lifecycle/checkpoint primitives provide a narrow base for restart/recovery without granting duplicate side-effect authority.

The Context Graph consumer boundary cannot treat package hashes plus a declared source SHA as sufficient provenance. The producer must publish an immutable source-bound manifest and independent attestation evidence, and the Noema trust anchor must pin those exact identities before production admission. This lets `context-graph-contracts` remain the canonical Shared Kernel while Noema verifies the released interface instead of copying producer source or trusting mutable branches.

This separation also forces later work to make missing boundaries explicit. A workflow engine must define task identity, concurrency, cancellation, and side-effect semantics before execution. A tool adapter must define a capability policy before invocation. Context Graph/EA projection cannot ship until an immutable released shared contract and conformance/source-provenance evidence exist.

## Rejected alternatives

- **Direct provider integration in Noema:** rejected because it duplicates contextual-orchestrator authority and couples runtime behavior to provider credentials/failover policy.
- **Shared database or cross-service SQL:** rejected because it bypasses published domain contracts and creates hidden ownership coupling.
- **Copying Context Graph or EA schemas from open PR source:** rejected because Draft source is mutable and not released integration authority.
- **Trusting a declared Context Graph source commit or unattested manifest:** rejected because internally coherent metadata does not independently authenticate which protected source produced the published package.
- **Persisting unrestricted task/result/reasoning/tool payloads as architecture truth:** rejected because runtime data is not equivalent to authoritative Context Graph or EA state.
- **Implicit retry of failed side effects:** rejected because repeated execution can duplicate externally visible mutations without idempotency authority.

## Acceptance

A runtime slice may move from candidate to protected truth only when its owning bounded context is named in the PRD/Context Map, public source contracts are documented, realistic tests cover relevant cancellation/restart/checkpoint/idempotency/tool-policy/concurrency/isolation behavior, exact owned production coverage remains complete, applicable exact-head CI/security/review evidence is terminal clean, and protected integration succeeds under live governance.

A Context Graph production dependency additionally requires an immutable release whose exact protected source, package/SBOM/provenance identities, release-source manifest, independent attestation verification, schema/profile, conformance/admission, compatibility/migration, licensing/NOTICE, and required capabilities all match Noema's separately authenticated trust anchor. Open PR heads, mutable branches, predecessor artifacts, or release metadata derived only from the candidate itself remain non-passing.

Any integration that requires unreleased Context Graph source, direct provider routing, ambient secret propagation, arbitrary tool authority, unbounded recursion, silent side-effect retry, or cross-service SQL is rejected at the architecture boundary.