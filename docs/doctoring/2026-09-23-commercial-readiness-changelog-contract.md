# Commercial-readiness CHANGELOG contract repair

Date: 2026-09-23
Owner: Noema repository documentation / release-evidence boundary
Status: Proposed source repair; hosted exact-head GREEN and merge authority remain open

## Problem

`CONTRIBUTING.md` and `CLAUDE.md` require every behavior change to be recorded under `CHANGELOG.md` → `## Unreleased`. PR #730 had accumulated authority-bearing behavior changes in commercial-readiness admission without a corresponding Unreleased entry. The source, executable tests, operator guide and doctoring therefore described current behavior while the release-facing change ledger did not.

This is a release-evidence defect, not a reason to widen merge authority. A doctoring note, PR body or product-gap baseline cannot substitute for the repository's canonical changelog rule.

## Constraints

- Preserve the existing CHANGELOG byte content except for the required current entry and harmless text-file normalization observed by exact commit diff.
- Do not claim hosted GREEN from local/source inspection.
- Do not turn source/check evidence into immutable-release, deployment, production KPI or foreign-owner authority.
- Do not force-push, rewrite history or weaken review/check gates merely to make the documentation lane easier to merge.

## Alternatives

**Leave the changelog stale until merge.** Rejected because the repository explicitly requires `## Unreleased` to move with behavior changes, and release readiness must be reviewable on the candidate head.

**Treat the PR body or product-gap baseline as the change ledger.** Rejected because those artifacts have different authority and retention purposes.

**Introduce a new changelog-fragment convention inside this repair.** Rejected because the repository has no such canonical convention; inventing one here would widen the change surface instead of repairing the existing contract.

## Decision

Add an executable test that isolates the current `## Unreleased` section and requires the authority-bearing #730 entry to name the material contract: SHA-bound normal merge, target PR/head/base provenance, canonical required-workflow source, GitHub Actions App id `15368`, exact review `commit_id`, Noema review marker authority and fail-closed retry chronology.

The first test commit `dc0264c01c1ad8ad84647ec106a5322793cb1abc` used an unsuitable JavaScript end anchor and is not claimed as the valid RED. Ordinary-forward test-oracle correction `0a3a6eba9edb2e0804391275fa8346b8ae16c965` makes the section extraction deterministic; at that exact head the new assertions are RED because `CHANGELOG.md` contains no #730 Unreleased entry.

Repair `02d51ccd56c675cd8c432d3c6df63a10d37c430d` adds the #730 Unreleased entry. Exact commit-diff inspection confirms the intended entry plus two documentation-only normalizations introduced by the whole-file contents API: the existing #685 boundary sentence now says `release/deployment authority` explicitly, and the file gains a terminal newline. Neither changes executable behavior or owner scope. They are retained rather than performing another large whole-file replacement solely to remove semantically harmless documentation normalization.

## Evidence and residual risk

The new test prevents historical changelog text from satisfying the active Unreleased contract and binds the release-facing ledger to the current governance behavior categories. It does not prove that the full hosted suite passes; fresh exact-head CI/reviewer/security/image evidence is still required after this documentation mutation.

Because the connected contents API replaces complete UTF-8 files, exact commit-diff inspection is mandatory after future large-file edits. A line-oriented patch surface would reduce preservation risk but is not repository authority and is not assumed here.
