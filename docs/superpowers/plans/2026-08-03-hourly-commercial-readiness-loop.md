# Hourly Commercial-Readiness Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an hourly, fail-closed GitHub maintenance loop that dispatches current-head Noema review, merges only fully validated pull requests, and refreshes readiness evidence when the PR queue is empty.

**Architecture:** A pure ESM decision engine evaluates normalized pull-request snapshots. A separate `gh api` adapter gathers fully paginated evidence and performs SHA-bound writes. A default-branch-only scheduled workflow runs the adapter with least privilege and preserves reports and readiness artifacts.

**Tech Stack:** Node.js 24, ECMAScript modules, Vitest, GitHub CLI/API, GitHub Actions, jq.

## Global Constraints

- Never check out or execute pull-request code in the privileged maintenance workflow.
- Require exact current-head evidence and fail closed on missing, pending, failed, stale, or unparseable inputs.
- Preserve the existing Security Scan, 100% test/docstring coverage, and release-verification gates.
- Never fabricate production KPI, revenue, customer, transfer, or acquisition evidence.
- Use descriptive nonnumeric identifiers and existing repository naming conventions.
- Keep all workflow permissions explicit and minimal.

---

### Task 1: Pure pull-request decision engine

**Files:**
- Create: `scripts/lib/commercial-readiness-loop.mjs`
- Create: `test/commercial-readiness-loop.test.ts`

**Interfaces:**
- Consumes: `evaluatePullRequest(snapshot: PullRequestSnapshot)` where the snapshot contains PR identity, merge state, normalized check runs/statuses, unresolved-thread count, latest review decisions, and current-head Noema review decision.
- Produces: `{ action: "merge" | "request_review" | "blocked", reasons: string[] }` and exported `REQUIRED_CHECK_NAMES`.

- [ ] **Step 1: Write failing evaluator tests**

Add focused tests that construct a fully passing snapshot and then vary one field at a time. Assert that a passing snapshot returns `merge`; an otherwise passing snapshot without Noema approval returns `request_review`; missing/pending/failed required checks, failed additional checks, failed statuses, unresolved threads, effective change requests, draft/cross-repository/non-main/stale merge state, and a current-head Noema negative decision return `blocked` with stable reason codes.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/commercial-readiness-loop.test.ts`

Expected: FAIL because `scripts/lib/commercial-readiness-loop.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure evaluator**

Export:

```js
export const REQUIRED_CHECK_NAMES = Object.freeze([
  "verify",
  "reviewer",
  "scorecard",
  "osv-scan",
  "trivy-fs",
  "dependency-review",
]);

export function evaluatePullRequest(snapshot) {
  // Validate identity/merge state, reviews, threads, checks, statuses,
  // then return merge, request_review, or blocked with stable reasons.
}
```

Use no network, filesystem, environment, or clock access.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run test/commercial-readiness-loop.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/commercial-readiness-loop.mjs test/commercial-readiness-loop.test.ts
git commit -m "feat(governance): add fail-closed PR decision engine"
```

### Task 2: Paginated GitHub adapter and SHA-bound orchestrator

**Files:**
- Create: `scripts/hourly-commercial-readiness.mjs`
- Create: `test/hourly-commercial-readiness-script.test.ts`

**Interfaces:**
- Consumes: `GITHUB_REPOSITORY`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, `--apply`, and optional `--report <path>`.
- Uses: `evaluatePullRequest(snapshot)` and `REQUIRED_CHECK_NAMES` from Task 1.
- Produces: a bounded JSON report with `repository`, `generatedAt`, `apply`, `openPullRequestCount`, and one result per PR.

- [ ] **Step 1: Write failing adapter contract tests**

Assert the script contains and uses complete pagination for open PRs, check runs, statuses, reviews, and GraphQL review threads; a current-head Noema marker parser; same-repository/main-base checks; exact-head revalidation; `repository_dispatch` for `noema-review`; and a merge request that includes both `merge_method=squash` and the expected `sha`.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npx vitest run test/hourly-commercial-readiness-script.test.ts`

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the GitHub adapter**

Use `spawnSync("gh", args, { shell: false, ... })`. Parse `gh api --paginate --slurp` output directly in Node. Bound error and report text. Normalize:

```js
{
  number,
  headSha,
  baseRef,
  headRepository,
  mergeable,
  mergeableState,
  draft,
  checkRuns,
  statuses,
  unresolvedThreadCount,
  latestReviewStates,
  noemaReviewDecision,
}
```

In apply mode, dispatch review only when the evaluator returns `request_review`. Merge only after a fresh PR read still matches the expected head and the evaluator returned `merge`. Treat write failures and `merged !== true` as fatal.

- [ ] **Step 4: Verify syntax and tests**

Run: `node --check scripts/hourly-commercial-readiness.mjs`

Expected: exit 0.

Run: `npx vitest run test/hourly-commercial-readiness-script.test.ts test/commercial-readiness-loop.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/hourly-commercial-readiness.mjs test/hourly-commercial-readiness-script.test.ts
git commit -m "feat(governance): orchestrate hourly PR maintenance"
```

### Task 3: Scheduled least-privilege workflow

**Files:**
- Create: `.github/workflows/hourly-commercial-readiness.yml`
- Modify: `test/workflow-readiness.test.ts`

**Interfaces:**
- Consumes: trusted default-branch repository code and the workflow `GITHUB_TOKEN`.
- Produces: hourly/manual maintenance runs, `commercial-readiness-loop-report` artifact, readiness artifacts when no PR is open, and a job summary.

- [ ] **Step 1: Add failing workflow contract tests**

Require:

- `cron: "17 * * * *"` and `workflow_dispatch`;
- explicit `actions: read`, `checks: read`, `contents: write`, `pull-requests: write`, `statuses: read`, and `security-events: read` permissions;
- non-overlapping concurrency;
- Node 24 and lockfile install;
- `node scripts/hourly-commercial-readiness.mjs --apply`;
- report artifact upload with `if: always()`;
- no-PR report-only `readiness:audit`, `acquisition:manifest`, and `acquisition:audit` steps;
- no PR-head checkout or `pull_request_target` trigger.

- [ ] **Step 2: Run the workflow test and verify RED**

Run: `npx vitest run test/workflow-readiness.test.ts`

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Add the workflow**

Create a single trusted job with `timeout-minutes: 30`, explicit concurrency, pinned actions, `npm ci`, apply-mode orchestration, conditional report-only audits, and artifact uploads. Use the script report's `openPullRequestCount` as the no-PR condition.

- [ ] **Step 4: Run workflow and full release tests**

Run: `npx vitest run test/workflow-readiness.test.ts`

Expected: PASS.

Run: `npm run release:verify`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/hourly-commercial-readiness.yml test/workflow-readiness.test.ts
git commit -m "ci: schedule hourly commercial-readiness maintenance"
```

### Task 4: Commercial documentation and release traceability

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/hourly-commercial-readiness-loop.md`

**Interfaces:**
- Consumes: the implemented workflow and report schema.
- Produces: operator-visible policy, manual run instructions, break-glass limitations, evidence interpretation, and buyer due-diligence traceability.

- [ ] **Step 1: Add documentation assertions**

Extend the workflow/script tests to require documentation references to the exact workflow, report artifact, mandatory check names, SHA-bound merge, issue #27 protected-branch dependency, and issue #9 sandbox boundary.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run test/hourly-commercial-readiness-script.test.ts test/workflow-readiness.test.ts`

Expected: FAIL on missing documentation references.

- [ ] **Step 3: Write operator and buyer documentation**

Document the decision table, permissions, report schema, manual invocation, expected blocked states, review dispatch behavior, no-PR audit behavior, and explicit non-substitution for real production/revenue evidence or branch protection.

- [ ] **Step 4: Run final verification**

Run: `npm run release:verify`

Expected: PASS.

Run: `git diff --check`

Expected: no output and exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md docs/hourly-commercial-readiness-loop.md test
git commit -m "docs: document hourly readiness governance"
```

### Task 5: Review and integration

**Files:**
- Review all files changed by Tasks 1-4.

**Interfaces:**
- Produces: one focused pull request after PR #26 is merged or otherwise safely closed.

- [ ] **Step 1: Rebase or update from `main`**

Ensure PR #26's pagination fix is present before opening this PR; resolve conflicts without weakening either pagination contract.

- [ ] **Step 2: Run complete verification**

Run: `npm run release:verify`

Run: `node --check scripts/hourly-commercial-readiness.mjs`

Run: `git diff --check`

Expected: every command exits 0.

- [ ] **Step 3: Request review**

Open a focused PR describing the fail-closed decision table, permissions, TDD evidence, operational limitations, and issue #27/#9 dependencies. Request CodeRabbit and current-head Noema review.

- [ ] **Step 4: Merge only after current-head policy passes**

Verify every required CI/security/reviewer check and all review threads on the current head. Squash-merge with the expected head SHA. Confirm the open PR count returns to zero.
