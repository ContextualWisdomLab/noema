# Realistic remediation before blocker escalation

## Status

Accepted operational contract for the Noema hourly product-development scheduler.

## Problem

A scheduler run must not convert the first unavailable tool into a blocker report.
That behavior confuses an untried implementation path with a real permission,
policy, infrastructure, or scientific gate. It also encourages unsafe emergency
automation when a normal repository write path may already exist.

Naming a root cause is also insufficient. RCA is useful only when it produces
materially distinct corrective options, each option is tested against the
actual authority and execution environment, and the smallest safe option is
executed and verified. A technically imaginable action is not a realistic
remedy when the scheduler lacks the permission, tool, target identity, time,
rollback path, or observable oracle needed to complete it safely.

The triggering case involved a large workflow file. A trusted local checkout
could not reach GitHub, while the connector exposed complete-file replacement
rather than a line-oriented patch call. Treating that combination as an
unresolvable blocker was incorrect: GitHub's repository contents API requires
the current blob SHA when replacing an existing file, so an exact-head read,
deterministic in-memory transformation, diff review, and blob-SHA-bound write
provide a normal stale-writer rejection path without adding a write-capable
workflow.

## Candidate-path evaluation

| Candidate path | Evidence | Decision |
|---|---|---|
| GitHub-connected trusted checkout | DNS access to GitHub was unavailable in the execution environment. | Not viable for that run; retry only when connectivity is observed. |
| Temporary repair or self-modifying workflow | Would introduce branch-patching automation and a new privileged execution path. | Prohibited, even when other paths are inconvenient. |
| Connector-backed existing-file replacement | The connector can fetch exact bytes and blob SHA, then replace the file only when that SHA remains current. | Viable when the complete resulting file and diff are verified. |
| Connector-backed new contract file plus an already-consumed policy file | The hourly prompt reads `AGENTS.md` before selecting or implementing work. | Viable for scheduler policy that does not require executable workflow changes. |

The selected implementation updates the scheduler-consumed `AGENTS.md` policy
and adds an executable contract test. It does not add a repair workflow or grant
any new write permission to GitHub Actions.

## Required decision procedure

Before reporting a tooling or permission blocker, a scheduled agent must:

1. Re-read every affected pull request's exact current head.
2. Enumerate every safe write path exposed by the current connector and checkout.
3. Verify each candidate's prerequisites and failure mode with read-only,
   dry-run, or no-op evidence where possible.
4. Prefer the smallest normal write path that preserves least privilege.
5. For complete-file replacement, fetch the exact current bytes and blob SHA,
   apply one deterministic minimal transformation, and inspect the resulting
   diff for unrelated changes.
6. Re-read the exact pull-request head immediately before the write and bind the
   write to the fetched blob SHA. A changed head or stale blob requires abort and
   re-planning.
7. Escalate only when every safe candidate was attempted or concretely proven
   infeasible. Continue independent bounded work while a true external gate is
   open.

The procedure never permits `.github/workflows/repair-*`, self-modifying
Actions, workflow-based branch patching, protection bypass, synthesized review,
or reuse of stale-head evidence.

## Mandatory RCA-to-action protocol

For every failed, blocked, stale, or unexpected local result, the scheduler must
execute this bounded state transition:

```text
exact evidence
→ reproduction or isolation
→ falsifiable root-cause hypothesis
→ materially distinct remediation candidates
→ empirical feasibility gate
→ smallest safe action
→ observable verification
→ revised RCA or clean continuation trigger
```

The feasibility gate is evidence, not confidence language. Before an action is
classified as executable, the agent must verify:

- **Authority:** the current process is permitted to perform the transition.
- **Capability:** the required tool, API, dependency, target, and runtime exist.
- **Exact target:** the source state and intended object identity are current.
- **Policy:** security, review independence, coverage, and trust boundaries remain intact.
- **Reversibility:** failure is a no-op or has a bounded rollback path.
- **Time:** the action and its verification fit the remaining run budget.
- **Oracle:** an observable test or state read can prove the remedy worked.
- **Alternative:** no smaller, safer, or more probable remedy is available.

Each candidate is classified as `execute_now`, `defer_until_trigger`,
`external_only`, or `reject`. The scheduler executes the smallest safe
`execute_now` candidate test-first. A failed hypothesis returns to RCA with the
new evidence; after three failed hypotheses, the scheduler stops speculative
patch stacking and treats the architecture or governing contract as the
suspected cause.

## Realistic authority boundary

The OpenCode process runs in an uncredentialed proposal workspace. GitHub,
repository, OIDC, Actions-runtime, and runner command-file credentials are
removed before model execution, and `gh` is denied by the OpenCode command
policy. This boundary is intentional: proposed code cannot publish itself or
change counted governance state.

Consequently, the product-development scheduler can realistically repair local
source, tests, documentation, dependency material, and bounded tooling behavior.
It cannot clear GitHub approvals, required Checks, repository settings, secrets,
environment approvals, billing, runner capacity, provider outages, or other
external infrastructure. For those cases it records direct evidence and a
concrete continuation trigger in `PR_MESSAGE.md`, then continues bounded
non-conflicting work that cannot race another writer or invalidate the selected
slice. It never reports an external state transition that it could not perform
and re-read.

## Stacked pull-request Security Scan trigger boundary

A live RCA on pull request #80 exposed a mismatch between Noema's local policy
text and the organization workflow that actually creates the central
`Security Scan` evidence. At organization `.github` exact `main`
`6eb06cdd08c79a06f7b390069d4ffa49e2eb7dba`,
`.github/workflows/security-scan.yml` configures `pull_request.branches` as
`[main, master, develop]`. GitHub's workflow syntax defines those
`pull_request` branch filters against the pull request's **target/base branch**.
Therefore a stack whose immediate base is a feature branch does not trigger this
central workflow even though the eventual integrated pull request must pass the
gate.

The live symptom was PR #80, whose base branch is
`fix/nanoid-cve-2026-67213`. Exact head
`abd973a299ceec76148041a7cebe8a3ead32c20b` produced `ci` and `reviewer-ci`,
but no central `Security Scan` workflow run. The first failing boundary was not
a scanner failure; it was event selection before the workflow could start.

The immediate cause, root cause, and systemic cause are distinct:

- **Immediate cause:** the PR base does not match the central workflow's branch filter.
- **Root cause:** `AGENTS.md` incorrectly claimed the central scan runs on every PR base, including feature-base stacks.
- **Systemic cause:** the repository permits stacked PRs on feature branches while the organization gate currently admits only `main`, `master`, and `develop` targets.

Bounded remediation candidates were evaluated as follows:

| Candidate | Feasibility evidence | Classification |
|---|---|---|
| Remove or broaden the central `.github` branch filter | This would address the systemic coverage gap, but `.github` is a separate repository/writer lease and is read-only to the Noema loop. | `read_only_dependency` / defer to the owning loop |
| Retarget #80 directly to `main` now | #80 is stacked on #76. Retargeting before #76 integrates would fold the predecessor dependency remediation into #80's diff and violate dependency order. | `reject` |
| Add a second Noema-local copy of the organization Security Scan | This duplicates scanner policy and creates two authorities that can drift. It does not repair the central required-workflow trigger contract. | `reject` |
| Correct Noema's scheduler contract and wait for the legitimate stack transition | The branch can be updated with a blob-SHA-bound normal repository write; after #76 integrates, #80 can be refreshed onto an eligible base and the central scan can generate exact-head evidence. | `execute_now` for policy correction; scan itself `defer_until_trigger` |

The resulting scheduler rule is deliberately fail-closed. Missing Security Scan
evidence on a feature-base stack is `defer_until_trigger`, never success. The
continuation trigger is predecessor integration followed by a stack refresh onto
an eligible base and a terminal-success central Security Scan on the then-current
exact head. The scheduler must not manufacture the check by retargeting early
when doing so duplicates predecessor changes or violates stack order.

## Test-first evidence

- RED commit `97b9a2f5f604f9885c0c32e5204f6b2f9ccfed13` added only
  `test/hourly-product-development-remediation-policy.test.ts`. Exact-head CI
  run `31257139887` passed the existing 649 tests and failed the new contract
  because `AGENTS.md` lacked the remediation policy.
- Commit `a0d4ffea57cd832e28853d8ae10324a4d84f8d9b` added the policy through a
  blob-SHA-bound connector write. CI correctly exposed that two normative
  phrases were split by Markdown line wrapping.
- Commit `8649f6fe134f210b1e606b36cc60c8afaeb92624` changed only those line breaks.
  Exact-head CI run `31257306147` completed successfully, including the full
  `release:verify` chain and the new scheduler contract.
- RED commit `8ae32bbaa20d8da83b3d6ceff3300715ebd28667` added the RCA-and-feasibility
  contract. Exact-head CI run `31259335120` passed all 651 predecessor tests and
  failed only the new protocol assertion.
- Commit `2a120cb769f392ad45f895dc861c31fb07a20680` binds that assertion to the
  scheduler-consumed `AGENTS.md` boundary instead of duplicating the policy in
  the workflow here-document.
- Commit `13ea7eeb0dab8b33d70cb4bb6823e22484458ff9` implements the mandatory
  RCA-to-action sequence, empirical feasibility gate, action classifications,
  three-hypothesis limit, and the uncredentialed workspace authority boundary.
- RED commit `abd973a299ceec76148041a7cebe8a3ead32c20b` added the stacked Security
  Scan trigger contract. Exact-head CI run `31271083904` passed all 652
  predecessor tests and failed only the new policy assertion.
- Commit `9103c46b72485fe83b63ac84c2d2bf51d85a5ce3` replaces the false
  every-base claim with the observed base-filter boundary, fail-closed
  `defer_until_trigger` classification, and dependency-order continuation rule.

## Security rationale

Git's explicit lease form updates a remote ref only when its observed value
matches the expected value. GitHub's contents API similarly requires the blob
SHA of the file being replaced. These are optimistic concurrency controls, not
permission bypasses. They protect another writer only when the caller first
reads a precise identity, carries that identity into the write, and refuses to
retry blindly after rejection.

NIST SSDF requires secure development practices to be integrated into the
software lifecycle and emphasizes evidence, review, and protection of software
integrity. The scheduler contract applies that principle by making feasibility
claims observable and by refusing privileged workaround automation.

## References

Git Project. (2026). *git-push documentation*. https://git-scm.com/docs/git-push

GitHub. (2026). *REST API endpoints for repository contents*. https://docs.github.com/en/rest/repos/contents

GitHub. (2026). *Workflow syntax for GitHub Actions*. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development
framework (SSDF) version 1.1: Recommendations for mitigating the risk of software
vulnerabilities* (NIST Special Publication 800-218). National Institute of
Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
