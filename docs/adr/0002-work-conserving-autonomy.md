# ADR-0002: Make autonomous maintenance work-conserving

- **Status:** Proposed
- **Implementation owner:** PR #80 and the external hourly Noema automation prompt
- **Scope:** scheduled PR maintenance, RCA, development continuation, deliverable handoff, exit criteria

## Context

A periodic automation can satisfy its schedule while still wasting most of each invocation: inspect one PR, notice a pending check or unavailable reviewer, report the blocker, then stop until the next hour. That behavior turns external latency into repository-wide idle time and repeatedly spends budget rediscovering the same unchanged blocker.

Noema has multiple independent work classes: merge-ready PRs, current defects, stack/dependency repairs, review threads, documentation, operational acceptance, security/reliability hardening and buyer-visible product gaps. Most blockers affect only one item.

A second premature-stop pattern occurs when an intermediate artifact is mistaken for the outcome. A prompt update, documentation assessment, design, RCA, test, commit, review request, merge or blocked lane can be useful, but each still has a next authority or acceptance boundary. Ending there leaves safe product, security, review or operational work unperformed.

## Decision

The Noema autonomous loop is **work-conserving**.

1. Each run maintains a live priority queue of safe executable work.
2. A blocked/pending item is deferred by its current identity and does not terminate the run.
3. After every mutation, merge, closure, proof or defer decision, the loop returns to the highest-value executable item.
4. Waiting for CI, reviewer latency, provider cooldown, rate limit, external dependency or active writer is local to the affected action.
5. Before any blocker escalation the loop performs bounded RCA, enumerates materially distinct remedies and empirically checks real-world feasibility.
6. A remedy is executed only when authority, tool capability, exact target, policy, dependency order, reversibility, time budget and a test oracle are verified.
7. Three materially distinct failed hypotheses trigger architecture/contract reassessment rather than a fourth speculative symptom patch.
8. Every intermediate artifact must hand off to its next executable authority or acceptance boundary.
9. A run may end only when practical invocation budget is exhausted or a second fresh exit sweep finds no actionable safe path.
10. Routine status narration is not counted as progress or an exit condition.

## Priority order

```text
merge genuinely clean exact-head PR
→ fix valid current defect
→ remove repository-owned blocker
→ resolve addressed thread / close duplicate
→ finish Draft or stack
→ advance another open PR/issue
→ protected-main operational proof
→ authoritative documentation repair
→ buyer-visible bounded increment
→ quality/security/operability/acquisition hardening
```

## RCA-to-action state machine

```text
symptom
→ exact evidence
→ reproduce/isolate
→ falsifiable hypothesis
→ distinct remediation candidates
→ feasibility classification
→ execute_now OR defer/reject
→ exact proof
→ queue top
```

Candidate classifications are `execute_now`, `defer_until_trigger`, `read_only_dependency`, `external_only`, and `reject`.

## Deliverable handoff invariant

A prompt update, documentation assessment, design, RCA, test, commit, review request, protected merge or blocked lane is always intermediate while a safe next boundary exists. The required handoff chain is:

```text
prompt update → repository-consumed contract and executable verification
RCA → feasible action
 design → implementation
 test → production code
 documentation assessment → canonical repository files
 local changes → intentional commit → pull request
 pull request → exact-head checks → review remediation → protected merge
 protected merge → protected-main operational acceptance → queue top
```

Leading spaces in the diagram are presentation only; every arrow is a mandatory progression rule. If one handoff cannot proceed, the loop defers only that lane and rotates to another non-conflicting item. Documentation repair is intermediate and must be followed by the highest-value executable non-documentation work in the same invocation when practical budget and writer lease permit it.

Before termination the loop performs a **double exit sweep** over PRs, issues, changed branches, reviews/checks, current defects, documentation drift, operational acceptance, release evidence and buyer-visible gaps. If either sweep finds safe work, the loop executes it and sweeps again. A user-visible report is not a handoff target or completion condition.

## Consequences

### Positive

- queued checks and reviewer latency no longer reserve an entire hourly invocation.
- external governance blockers do not prevent documentation, security or product work.
- repeated blocker prose is replaced by evidence-backed progress or a concrete continuation trigger.
- failed fixes generate information rather than uncontrolled patch accumulation.
- prompt, documentation and design work can no longer silently replace implementation, review or operational acceptance.
- protected merges are followed by operational proof rather than treated as incident closure by themselves.

### Cost

- the scheduler needs explicit writer-lease and branch-local concurrency awareness.
- state collection must be bounded to avoid spending the whole run on inventory.
- execution order can change after every fresh read, so stale plans cannot be followed mechanically.
- handoff state must be visible in traceability and tests so the loop can distinguish a completed artifact from a completed outcome.

## Safety boundary

Work-conserving does **not** mean bypassing a gate. A required approval, ruleset, security check or credential that cannot safely be created remains external. The loop simply rotates to other safe work.

The policy never authorizes:

- self-approval or impersonation;
- weakening required checks/coverage/security;
- temporary write-capable repair workflows;
- racing another writer;
- treating pending evidence as success;
- fabricating release, production or commercial evidence.

## Verification

- `AGENTS.md` realistic-remediation and deliverable-handoff contract on PR #80.
- `test/hourly-product-development-remediation-policy.test.ts` on PR #80.
- `docs/PRD.md` FR-018 and FR-019.
- `test/documentation-architecture-contract.test.ts` on PR #71.
- external `Noema Commercial Loop` scheduler prompt includes no-early-stop and double-exit-sweep semantics.
- protected-main acceptance must be performed after implementation lands; this ADR does not claim that active PR code is already deployed.
