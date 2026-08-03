# Hourly Commercial-Readiness Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement and verify this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an hourly, fail-closed GitHub maintenance loop that dispatches exact-head Noema review, merges only fully validated pull requests, preserves downstream workflow execution, and refreshes readiness evidence when the post-action PR queue is empty.

**Architecture:** A pure ESM decision engine evaluates normalized PR snapshots. A shell-free `gh api` adapter gathers every paginated evidence source, deduplicates current-head central reviews, and performs revalidated SHA-bound writes. A default-branch-only scheduled workflow mints a dedicated Maintainer GitHub App token, executes the adapter, and preserves audit artifacts.

**Tech Stack:** Node.js 24, ECMAScript modules, Vitest, GitHub CLI/API, GitHub Actions, jq.

## Global Constraints

- Never check out or execute pull-request code in the privileged maintenance workflow.
- Require exact current-head evidence and fail closed on missing, pending, failed, stale, or unparseable inputs.
- Preserve Security Scan and 100% reviewer line/branch/docstring coverage gates.
- Never fabricate production KPI, revenue, customer, transfer, or acquisition evidence.
- Use a dedicated Maintainer GitHub App token for PR writes; do not fall back to `GITHUB_TOKEN`.
- Keep the Maintainer App separate from the reviewer App and restrict it to this repository.
- Keep branch protection/rulesets in issue #27 and untrusted-code sandboxing in issue #9 as explicit external dependencies.

---

### Task 1: Pure pull-request decision engine

**Files:**
- Create: `scripts/lib/commercial-readiness-loop.mjs`
- Create: `test/commercial-readiness-loop.test.ts`

- [x] Define exact mandatory check names and review-dependent check names.
- [x] Add tests for clean merge, missing Noema review, required checks, statuses, review threads, change requests, mergeability, and same-repository/main-base identity.
- [x] Permit review dispatch when the only remaining blockers are missing current-head Noema approval and pending review-dependent checks.
- [x] Continue blocking final merge until review-dependent checks complete with an allowed conclusion.

### Task 2: Paginated GitHub adapter and SHA-bound orchestrator

**Files:**
- Create: `scripts/hourly-commercial-readiness.mjs`
- Create: `test/hourly-commercial-readiness-script.test.ts`

- [x] Use `spawnSync("gh", ..., { shell: false })` and bounded output/error handling.
- [x] Paginate open PRs, check runs, statuses, reviews, review threads, and central-review workflow runs.
- [x] Require exact-head Noema marker plus `Reviewer credential: noema-github-app` from a Bot review.
- [x] Reduce human reviews to the latest effective decision per reviewer.
- [x] Deduplicate active central-review runs by exact repository, PR, and head SHA.
- [x] Re-fetch the full snapshot immediately before merge and require the decision to remain `merge`.
- [x] Send the expected head SHA in GitHub's squash-merge request.
- [x] Recount the open PR queue after writes and expose both initial and remaining counts.

### Task 3: Mandatory reviewer and hourly workflows

**Files:**
- Modify: `.github/workflows/reviewer-ci.yml`
- Create: `.github/workflows/hourly-commercial-readiness.yml`
- Modify: `test/workflow-readiness.test.ts`

- [x] Remove reviewer path filters so the `reviewer` context exists on every PR.
- [x] Schedule the loop at minute 17 of every hour.
- [x] Use default-branch-only `repository_dispatch` for trusted manual invocation; exclude `workflow_dispatch`, `pull_request`, and `pull_request_target`.
- [x] Serialize runs with a repository-wide concurrency group.
- [x] Restrict the workflow token to `contents: read`.
- [x] Mint a dedicated Maintainer App token with Actions read, Checks read, Contents write, Metadata read, Pull requests write, and Statuses read.
- [x] Run report-only saleable/acquisition audits only when the post-action open PR count is zero.
- [x] Upload the loop report and no-PR evidence with pinned artifact actions and 90-day retention.

### Task 4: Documentation and release traceability

**Files:**
- Create: `docs/hourly-commercial-readiness-loop.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-03-hourly-commercial-readiness-loop-design.md`

- [x] Document decisions, required checks, review-dependent checks, SHA-bound merge behavior, artifacts, and reason codes.
- [x] Document Maintainer App installation, variables, secret, permissions, and separation from the reviewer App.
- [x] Document that production KPI, revenue, transfer, customer, ruleset, and sandbox evidence cannot be manufactured by this loop.
- [x] Record the feature and reviewer-gate expansion in the changelog.
- [x] Add the operator guide to the README commercial/operations package index.

### Task 5: Verification, review, and integration

- [x] Run local `node --check` on both ESM implementation files.
- [x] Run an isolated behavioral harness covering 31 evaluator/review/pagination assertions.
- [x] Parse the scheduled workflow as YAML and verify its trust, App-token, schedule, and no-PR audit contracts.
- [ ] Run repository `npm run release:verify` on the current head through GitHub Actions.
- [ ] Mark PR ready, request CodeRabbit review, address every actionable thread, and re-run checks.
- [ ] Merge PR #26 first after its current-head CI, reviewer, and Security Scan complete successfully.
- [ ] Revalidate PR #28 against updated `main`, then squash-merge only when all current-head policy gates succeed.
- [ ] Confirm the repository's open PR count returns to zero.
