# ADR 0012: Runtime orchestration bounded contexts

Status: Proposed

## Context

Protected `main` is an evidence-producing credential and maintenance control plane with a narrow runtime-orchestration foundation. Noema is expanding toward broader runtime Agent/application orchestration, but that expansion must not collapse CWL domain ownership into one service or turn Noema into a model-provider router.

`ContextualWisdomLab/contextual-orchestrator` owns model discovery, routing, test-time compute, provider failover, and provider credentials. `ContextualWisdomLab/context-graph-contracts` owns provider-neutral shared contracts for canonical references, Context Assertions, CloudEvents/schema, provenance, time, conformance, and admission. `ContextualWisdomLab/enterprise-architecture-core` is the authoritative EA Decision Plane. Dedicated security/isolation products retain their own runtime and policy truth.

The protected runtime foundation introduced by PR #528 includes an Agent Runtime lifecycle, State / Checkpoint admission, bounded Workflow / Task plan admission, and runnable-task selection. These primitives require an explicit architectural decision so future workflow, tool, persistence, and integration work cannot infer broader authority from their existence.

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

Context Graph integration is fail closed: Noema may emit or consume shared architecture/context evidence only through an immutable released context-graph-contracts package/profile with its version, conformance/admission result, canonical references, provenance, and time semantics intact. Open Draft source in the sibling repository is not an integration contract. EA Core remains the authority that accepts or rejects architecture projection; Noema does not directly write EA application tables.

## Protected implementation foundation

Protected `main` currently includes the following bounded runtime behavior:

- `src/agent-runtime/execution-lifecycle.ts` — pure Agent Runtime lifecycle transition authority;
- `src/state-checkpoint/checkpoint-admission.ts` — pure State / Checkpoint admission and immutable checkpoint metadata snapshots;
- `src/workflow-task-execution/task-plan.ts` — immutable finite DAG admission, bounded concurrency policy, and runnable-task candidate selection without reservation or side-effect authority.

No checkpoint payload persistence, durable workflow scheduler, arbitrary tool executor, provider routing, Context Assertion publisher, EA writer, or security-runtime implementation is implied by these modules. Those remain separate future slices and must satisfy their own owner, contract, test, exact-head, and protected-integration gates.

This ADR remains `Proposed` because the repository-wide runtime-orchestration decision is broader than the already protected foundation. Protected source must not be described as candidate merely because the ADR lifecycle has not yet advanced to `Accepted`.

## Consequences

Runtime slices can evolve independently without sharing application tables or importing foreign implementation source. Model-routing and security responsibilities remain replaceable behind explicit ports. Idempotent lifecycle/checkpoint primitives provide a narrow base for restart/recovery without granting duplicate side-effect authority.

This separation also forces later work to make missing boundaries explicit. A workflow engine must define task identity, concurrency, cancellation, and side-effect semantics before execution. A tool adapter must define a capability policy before invocation. Context Graph/EA projection cannot ship until an immutable released shared contract and conformance evidence exist.

## Rejected alternatives

- **Direct provider integration in Noema:** rejected because it duplicates contextual-orchestrator authority and couples runtime behavior to provider credentials/failover policy.
- **Shared database or cross-service SQL:** rejected because it bypasses published domain contracts and creates hidden ownership coupling.
- **Copying Context Graph or EA schemas from open PR source:** rejected because Draft source is mutable and not released integration authority.
- **Persisting unrestricted task/result/reasoning/tool payloads as architecture truth:** rejected because runtime data is not equivalent to authoritative Context Graph or EA state.
- **Implicit retry of failed side effects:** rejected because repeated execution can duplicate externally visible mutations without idempotency authority.

## Acceptance

A runtime slice may move from candidate to protected truth only when its owning bounded context is named in the PRD/Context Map, public source contracts are documented, realistic tests cover relevant cancellation/restart/checkpoint/idempotency/tool-policy/concurrency/isolation behavior, exact owned production coverage remains complete, applicable exact-head CI/security/review evidence is terminal clean, and protected integration succeeds under live governance.

ADR 0012 itself may move from `Proposed` to `Accepted` only when the repository-wide decision is stably applied across the runtime-orchestration surface and its acceptance evidence is code-current. Integrating one or more slices does not require premature ADR acceptance, and keeping the ADR Proposed does not downgrade already protected source back to candidate status.

Any integration that requires unreleased Context Graph source, direct provider routing, ambient secret propagation, arbitrary tool authority, unbounded recursion, silent side-effect retry, or cross-service SQL is rejected at the architecture boundary.