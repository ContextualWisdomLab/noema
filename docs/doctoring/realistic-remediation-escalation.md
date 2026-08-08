# Realistic remediation before blocker escalation

## Status

Accepted operational contract for the Noema hourly product-development scheduler.

## Problem

A scheduler run must not convert the first unavailable tool into a blocker report.
That behavior confuses an untried implementation path with a real permission,
policy, infrastructure, or scientific gate. It also encourages unsafe emergency
automation when a normal repository write path may already exist.

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

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development
framework (SSDF) version 1.1: Recommendations for mitigating the risk of software
vulnerabilities* (NIST Special Publication 800-218). National Institute of
Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
