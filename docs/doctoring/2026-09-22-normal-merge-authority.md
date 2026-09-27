# Normal-merge authority for the commercial-readiness loop

Date: 2026-09-22
Owner: Noema repository-governance / commercial-readiness admission boundary
Status: Proposed source repair; live ruleset mutation remains issue #27

## Problem

The protected commercial-readiness loop still sent `merge_method: "squash"` to GitHub and the governance evaluator required `allowed_merge_methods` to include `squash`. That contradicted the current CWL execution contract, which preserves reviewed PR lineage through a normal merge and permits squash only when explicitly authorized by a separate decision.

The mismatch was operational, not cosmetic. A repository policy that allowed only squash could receive a governance `PASS`, after which the hourly loop would deliberately collapse the reviewed branch history. Conversely, changing only the loop to normal merge while leaving the governance audit on squash would let the audit approve a policy under which the intended merge operation could be rejected.

## Constraints

- Preserve exact-head admission: the merge request must still include the expected PR head SHA and must re-read the live PR and all exact-head evidence immediately before the write.
- Do not weaken required reviews, current-head checks, central Security Scan, strict-latest-base, non-fast-forward, deletion, or App identity controls.
- Do not grant administration authority to the Maintainer App. Live ruleset mutation remains an operator/control-plane action owned by issue #27.
- Do not reinterpret historical squash-merge records. Old specs and plans remain historical evidence of earlier behavior; current operational guidance and production code must identify normal merge as the active contract.
- Preserve single-writer semantics and use ordinary/non-force commits only.

## Primary authority

GitHub's current REST API documents `merge_method` values `merge`, `squash`, and `rebase`, and documents `sha` as the PR-head precondition for the merge request. GitHub's current rules API likewise documents `allowed_merge_methods` values `merge`, `squash`, and `rebase`.

- GitHub. (2026). *REST API endpoints for pull requests: Merge a pull request*. https://docs.github.com/en/rest/pulls/pulls
- GitHub. (2026). *REST API endpoints for rules*. https://docs.github.com/en/enterprise-cloud@latest/rest/repos/rules

## Decision

1. `scripts/hourly-commercial-readiness.mjs` uses `merge_method: "merge"` while retaining the expected head `sha` precondition and the immediate live-state revalidation.
2. `evaluateMainGovernanceRules()` requires every effective pull-request rule to permit `merge`. A squash-only rule set fails with `merge_commit_not_allowed`.
3. Current governance guidance states that normal merge commits are required by the commercial-readiness loop. This source change does not claim the live ruleset has already been reconfigured; issue #27 remains the control-plane authority.
4. Passing maintainer/reviewer fixtures use the same `merge` policy so test evidence matches the production admission contract.

## Alternatives rejected

**Keep squash because the old automation already used it.** Rejected because historical implementation does not override the current CWL execution contract and would continue collapsing reviewed branch ancestry.

**Change only the merge API call.** Rejected because governance could then return `PASS` for a squash-only policy that rejects the actual normal merge.

**Allow either squash or merge in governance.** Rejected because a squash-only live policy would still be admitted even though the production writer is required to perform a normal merge.

**Mutate the live ruleset from this PR.** Rejected. Repository source may define the target admission contract, but control-plane mutation remains issue #27 and requires separate operator evidence.

## Executable evidence

RED `8ae148cc57593330415ea615032ac88d5fd8d1b4` changes the hourly script contract test to require `merge_method: "merge"` and reject the predecessor squash call.

RED `3b48fc3443a8a28e4513abd40865c204533e31e7` adds a focused governance regression: `allowed_merge_methods: ["merge"]` must pass and squash-only policy must fail with `merge_commit_not_allowed`.

Production repair `1c5036c0ae21f3b134c8e1235530060b7e2f3dd7` switches the exact-head GitHub merge request to normal merge without removing the expected-head SHA precondition. Production repair `df3a9fee6f8cbc3332df99d5ae44368105a8c4ae` changes governance admission from squash to normal merge.

Subsequent ordinary-forward commits align the canonical governance test and maintainer/reviewer PASS fixtures with the same normal-merge policy. Hosted exact-head CI and independent review remain separate evidence classes and must be re-established for the final exact head.

## Risks and follow-up

The live ruleset may not yet allow normal merge. Until issue #27 supplies fresh live evidence that effective pull-request policy permits `merge`, the governance audit should fail closed rather than fall back to squash. That failure is the intended signal that source authority and control-plane authority have not yet converged.

After this source repair reaches a reviewed exact head and terminal hosted GREEN, issue #27 should capture fresh active-rule evidence. Only then may the normal-merge path become operational authority. Release, deployment, rollback, KPI, and acquisition evidence remain independent gates.

## TRACEABILITY

CWL normal-merge execution contract → `scripts/hourly-commercial-readiness.mjs` exact-head merge payload → `test/hourly-commercial-readiness-script.test.ts` source contract → `scripts/lib/main-governance-audit.mjs` `merge_commit_not_allowed` → `test/main-governance-normal-merge-authority.test.ts` hostile squash-only policy → `docs/main-governance-audit.md` operator contract → issue #27 live control-plane evidence.
