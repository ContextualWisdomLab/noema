# ADR-0002: Make autonomous maintenance work-conserving

- **Status:** Proposed
- **Implementation owner:** PR #80 and the external hourly Noema automation prompt
- **Scope:** scheduled PR maintenance, RCA, development continuation, exit criteria

## Context

A periodic automation can satisfy its schedule while still wasting most of each invocation: inspect one PR, notice a pending check or unavailable reviewer, report the blocker, then stop until the next hour. That behavior turns external latency into repository-wide idle time and repeatedly spends budget rediscovering the same unchanged blocker.

Noema has multiple independent work classes: merge-ready PRs, current defects, stack/dependency repairs, review threads, documentation, operational acceptance, security/reliability hardening and buyer-visible product gaps. Most blockers affect only one item.

## Decision

The Noema autonomous loop is **work-conserving**.

1. Each run maintains a live priority queue of safe executable work.
2. A blocked/pending item is deferred by its current identity and does not terminate the run.
3. After every mutation, merge, closure, proof or defer decision, the loop returns to the highest-value executable item.
4. Waiting for CI, reviewer latency, provider cooldown, rate limit, external dependency or active writer is local to the affected action.
5. Before any blocker escalation the loop performs bounded RCA, enumerates materially distinct remedies and empirically checks real-world feasibility.
6. A remedy is executed only when authority, tool capability, exact target, policy, dependency order, reversibility, time budget and a test oracle are verified.
7. Three materially distinct failed hypotheses trigger architecture/contract reassessment rather than a fourth speculative symptom patch.
8. A run may end only when practical invocation budget is exhausted or a second fresh exit sweep finds no actionable safe path.
9. Routine status narration is not counted as progress or an exit condition.

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

## Consequences

### Positive

- queued checks and reviewer latency no longer reserve an entire hourly invocation.
- external governance blockers do not prevent documentation, security or product work.
- repeated blocker prose is replaced by evidence-backed progress or a concrete continuation trigger.
- failed fixes generate information rather than uncontrolled patch accumulation.

### Cost

- the scheduler needs explicit writer-lease and branch-local concurrency awareness.
- state collection must be bounded to avoid spending the whole run on inventory.
- execution order can change after every fresh read, so stale plans cannot be followed mechanically.

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

- `AGENTS.md` realistic-remediation contract on PR #80.
- `test/hourly-product-development-remediation-policy.test.ts` on PR #80.
- external `Noema Commercial Loop` scheduler prompt includes no-early-stop and double-exit-sweep semantics.
- protected-main acceptance must be performed after implementation lands; this ADR does not claim that active PR code is already deployed.
