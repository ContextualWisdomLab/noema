# ADR-0003: Bind acceptance evidence to exact head and live base

- **Status:** Proposed
- **Implementation owners:** PR #71, #76, #78, #80
- **Scope:** PR evidence, stacked changes, CI, lockfile provenance, protected merge

## Context

A pull request has more than one relevant revision identity:

- immutable current PR head;
- event-time base SHA;
- current live tip of the named base branch;
- GitHub synthetic merge revision;
- immediate predecessor branch for a stacked PR;
- workflow source revision that generated evidence.

These values can diverge without the PR head changing. Using only the event payload or a green check attached to a commit can therefore accept stale base provenance or misclassify synthetic-integration evidence as exact-head proof.

## Decision

Noema treats revision identities as separate first-class evidence.

### Exact PR head

Current PR source authority is GitHub's freshly read `head.sha`. Application/reviewer checks that claim exact-head evidence must explicitly checkout that SHA and prove `git rev-parse HEAD` equality before running repository code.

### Live base

When a decision depends on current integration ancestry, dependency content, lockfile source or stack state, Noema independently resolves the named base branch live tip. Event-time `base.sha` remains historical evidence and is not silently reused as current base authority.

### Synthetic merge

A GitHub `refs/pull/*/merge` revision is valid integration evidence. It is not labelled immutable-head evidence unless the specific scanner/test separately proves the PR head it consumed.

### Stacked PRs

The immediate stack predecessor's live tip is an explicit dependency. A stacked PR is not early-retargeted merely to create a required check if doing so duplicates predecessor changes or corrupts dependency order.

## Required read/write ordering

```text
read current PR head
→ independently read relevant live base/predecessor
→ collect evidence bound to those identities
→ decide
→ immediately re-read source-affecting identities
→ conditional mutation with expected identity
```

Any movement between decision and write causes abort/re-plan rather than blind retry.

## Consequences

### Positive

- stale-base lockfile and release evidence cannot silently pass.
- stack ancestry remains reviewable.
- scanner revision semantics stay truthful.
- concurrent writers are detected near the mutation boundary.

### Cost

- additional GitHub API reads and pagination are required.
- checks can be green but still insufficient if their executed revision is ambiguous.
- stacked PR integration may wait for predecessor merge before final acceptance.

## Verification

- `test/ci-exact-head-contract.test.ts` on PR #76.
- live-base preflight/post-verification contracts on PR #78.
- stack/base and Security Scan trigger semantics on PR #80.
- `ARCHITECTURE.md` exact-head/workflow-source invariants.
- issue #27 acceptance criteria for enforced revision-aware governance.

## Rationale sources

`docs/doctoring/architecture-trust-boundaries.md` records SLSA Source Track and GitHub OIDC primary-source rationale with APA 7 references.
