# ADR-0013: Durable workflow execution authority and bounded transition provenance

- **Status:** Proposed
- **Scope:** Agent Runtime / Workflow & Task Execution / State & Checkpoint / Recovery
- **Supersedes:** none
- **Related:** ADR-0012, issue #541, active stacked PR #542

## Context

Noema's pure Workflow / Task selector can determine which admitted tasks are runnable, but a selector result is only a candidate. It cannot reserve a task, prove that an effect started, serialize cancellation against a claim, or make a checkpoint successor durable across process restarts. Treating an in-memory selector or process-local lock as execution authority would permit duplicate effects and divergent checkpoint histories after restart or concurrent scheduling.

Noema owns this runtime execution authority. It does not own LLM provider routing, quarantine/security verdicts, outbound policy, or foreign product state, so the durable record must stay limited to Noema execution identities and transitions.

## Constraints

- A task may start work only after an atomic durable claim for the exact admitted `executionId`, `planId`, `taskId`, attempt and claim identity.
- Checkpoint history uses compare-and-swap against the exact retained sequence and digest.
- A transport failure must not imply that a side effect is safe to retry.
- Failed or cancelled prerequisites must not leave descendants indefinitely pending.
- Cancellation must prevent new claims without erasing an already-running claim whose external outcome may still need reconciliation or compensation.
- Scheduling order must be explicit and versioned rather than an accidental array-order behavior.
- Runtime evidence must distinguish claim, effect start, completion, cancellation, recovery, blocked descendants and checkpoint commits without storing prompts, tool payloads, provider credentials, foreign domain data or security verdicts.
- Provenance retained in the execution record must be bounded; durable execution state is not an unbounded audit warehouse.

## Considered options

### Process-local reservation and checkpoint CAS

Rejected. It is inexpensive but loses authority on restart and cannot prevent two processes from acting on the same candidate.

### Introduce PostgreSQL for workflow execution state

Deferred. PostgreSQL can provide transactional claims and compare-and-swap, but selecting a new database solely for this boundary would expand Noema's deployment and recovery surface before there is evidence that the current Worker runtime cannot provide the required transaction semantics.

### Reuse another CWL product's persistence or workflow state

Rejected. It would create cross-service authority coupling or cross-service SQL and would move Noema's runtime truth into a foreign bounded context.

### Cloudflare Durable Object storage behind a Noema repository boundary

Selected for the current implementation candidate. It is already part of Noema's runtime technology, provides a transaction boundary, and can remain hidden behind the Noema-owned `DurableWorkflowStateRepository`. This decision is about the port and invariants, not permanent vendor lock-in; a future adapter may replace the storage technology while preserving the same domain/application contract.

## Decision

Noema will separate five authorities:

1. **Runnable candidate** — pure selector output; no execution authority.
2. **Durable claim** — one transaction changes a still-runnable pending task to running and returns the exact claim identity.
3. **Effect start** — the active claim explicitly records that execution crossed the effect boundary. This evidence is idempotent for the same claim and grants no retry authority.
4. **Terminal/recovery transition** — completion, cancellation, blocked-descendant classification or explicit interrupted-attempt recovery is recorded under the current claim/policy.
5. **Checkpoint commit** — an admitted successor wins only if the retained checkpoint still equals caller evidence.

The current scheduling policy is `workflow-execution-policy.v1` with deterministic `admission_order`. Pure/idempotent interrupted work has a bounded automatic recovery ceiling; once exhausted it fails so independent later work cannot be starved forever. Side-effecting interrupted work is never silently replayed and instead requires an explicit outcome or compensation decision.

The state record retains a monotonic transition sequence and at most `MAX_TRANSITION_RECEIPTS` payload-minimized receipts. Truncation is observable because the total sequence continues after old receipts are dropped. The retained receipt contains only transition type, task/claim/attempt/cancellation identities, resulting task state and checkpoint sequence/digest.

Legacy state records that predate the transition ledger remain readable only when the ledger is entirely absent. A partially present or malformed ledger fails closed. Missing historical effect-start evidence is exposed as unknown (`null`) rather than fabricated as false.

## State and authority sequence

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant R as DurableWorkflowStateRepository
    participant E as Effect executor
    participant C as Checkpoint admission

    S->>R: claimRunnableTask(plan, taskId, claimId)
    R-->>S: exact WorkflowTaskClaim
    S->>R: markEffectStarted(plan, claim)
    R-->>S: effect_started receipt
    S->>E: perform work under exact claim
    E-->>S: observed outcome
    S->>R: completeTask / recoverInterruptedTask
    R-->>S: terminal/recovery + blocked receipts
    S->>R: commitCheckpoint(expected, candidate)
    R->>C: admit successor against retained checkpoint
    C-->>R: accepted/replay or conflict
    R-->>S: checkpoint_committed receipt or conflict
```

## Consequences

- Concurrent scheduler processes cannot both acquire the same pending task when the storage transaction contract is honored.
- Restarted processes can reconstruct the active claim instead of minting a replacement claim for a possibly-started side effect.
- Operators can tell whether durable authority stopped at candidate selection, claim, effect start, terminal outcome, cancellation/recovery, or checkpoint commit.
- Evidence size is bounded, so this ledger is suitable for operational provenance but not a substitute for a separately governed long-term audit/event store.
- Adding an effect-start marker creates a caller obligation: production composition must call it immediately before crossing the actual effect boundary. Merely exposing the method is not production acceptance.

## Risks and rejected shortcuts

- A caller that claims a task but never records effect start still leaves an ambiguous running attempt. Production composition and tests must make the intended call order explicit.
- Durable Object transaction behavior must be verified in the deployed/runtime-compatible environment; an in-memory test double alone is insufficient commercial evidence.
- The transition ledger must not accumulate foreign payloads in future extensions. New receipt fields require a privacy/authority review.
- `queued` GitHub checks, predecessor-head results, or this ADR's existence do not make the implementation protected truth.

## Verification and acceptance

The current candidate is exercised by state-store tests for concurrent claims, checkpoint races, cancellation, bounded retry, blocked descendants, restart claim reconstruction and transition provenance. The provenance regression additionally requires distinct `task_claimed` and `effect_started` receipts and verifies bounded receipt retention.

Before this ADR can become `Accepted`:

- the exact implementation head must pass repository typecheck/tests, owned production statement/branch coverage, review, security and applicable image/SBOM/provenance gates;
- production composition must use durable claim → effect-start evidence → effect/outcome under the exact claim;
- restart/recovery and real Durable Object transaction behavior must have executable acceptance evidence;
- PRD/TRD/Architecture/UML/TEST_STRATEGY/OPERABILITY/TRACEABILITY/CHANGELOG and the product technical gap baseline must describe the same boundary without presenting the active PR as protected truth;
- the stacked foundation must integrate normally and this work must be non-force restacked/revalidated against the resulting protected base.
