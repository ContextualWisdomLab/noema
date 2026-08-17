# ADR-0004: Use normal conditional writes; reject repair-workflow mutation

- **Status:** Proposed
- **Implementation owner:** active PR #80 and repository automation policy
- **Scope:** repository writes, autonomous proposal publication, concurrent writers

## Context

When a local checkout lacks network access or a connector lacks line-oriented patching, an automation can be tempted to create a temporary GitHub Actions workflow with `contents: write` that patches its own PR branch. That workaround creates a new privileged execution path, is hard to reason about under branch protection, and can outlive the incident it was meant to repair.

Conversely, a connector that replaces a whole file is not inherently unsafe if it requires the current blob SHA and the caller verifies an exact minimal transformation. Git/GitHub conditional mutations can serve as normal optimistic-concurrency controls.

## Decision

Noema maintenance uses **normal conditional repository write paths** only.

### Preferred paths

1. connector-backed create/update/delete bound to the current blob/ref identity;
2. trusted local checkout after verifying repository identity, clean worktree/index, exact head/base, credential scope, network and toolchain;
3. API mutation with an expected old SHA/ref or other compare-and-update semantic.

A complete-file replacement is acceptable only when:

- exact current PR head is freshly re-read;
- exact existing blob SHA is freshly fetched;
- the fetched bytes are the transformation input;
- one deterministic minimal transformation is applied;
- resulting diff contains no unrelated change;
- stale blob/ref identity makes the server reject an intervening-writer race.

### Prohibited substitute paths

- `.github/workflows/repair-*`;
- one-shot/finalizer/encoded-patch workflow;
- self-modifying GitHub Action;
- workflow with `contents: write` whose purpose is to patch its own branch;
- broad `GITHUB_TOKEN` write fallback;
- force update used merely to defeat an expected-old mismatch.

## Writer lease

Before every source-affecting write:

```text
fresh PR head
+ fresh live base/predecessor
+ fresh target blob/ref
+ active-writer check
→ conditional mutation
```

If another writer moved the same branch or source abstraction, the loop freezes only that branch and works elsewhere. It does not race or overwrite the other writer.

## Proposal publication

The same rule applies to agent-created proposal refs.

- branch creation must be authorized only while the destination is absent;
- cleanup may delete only while the destination still equals the exact commit created by the run;
- a newly created PR must be rebound to server-observed head/base identity before publication success;
- lost create responses must not cause broad branch/PR discovery and deletion;
- concurrent queue/base changes are publication failure, not permission to overwrite.

The detailed atomic publication implementation is developed in PR #80. Until protected merge and operational proof, this section is a proposed architecture decision rather than a deployed capability claim.

## Consequences

### Positive

- incident repair does not expand standing workflow authority.
- another writer's intervening work is preserved.
- large-file connector edits remain usable when they are actually safe instead of being rejected by assumption.
- publication cleanup is bounded to resources the run can prove it owns.

### Cost

- some mutations require extra exact-head/blob reads.
- stale-write rejection may force re-planning instead of automatic retry.
- whole-file transformations must be deterministic and diff-reviewed.

## Verification

- `AGENTS.md` realistic-remediation policy on PR #80.
- publisher lease regression tests and doctoring on PR #80.
- GitHub connector write calls use fetched blob SHA for existing files.
- no `.github/workflows/repair-*` path may remain in protected source.

## Rationale sources

Git and GitHub optimistic-concurrency rationale is recorded in `docs/doctoring/realistic-remediation-escalation.md` and `docs/doctoring/atomic-product-publisher-lease.md` on PR #80, with APA 7 references to Git and GitHub primary documentation.
