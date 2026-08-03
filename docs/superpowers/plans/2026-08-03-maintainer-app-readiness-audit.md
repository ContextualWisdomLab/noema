# Maintainer App Readiness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine-verifiable pre-activation audit for the dedicated Maintainer GitHub App, reviewer bot identity, live `main` governance, and no-write hourly-loop execution.

**Architecture:** A pure ESM evaluator validates normalized evidence. A shell-free GitHub adapter collects only bounded effective-token evidence and emits JSON plus workflow outputs. A default-branch-only repository-dispatch workflow mints the production-scoped token, runs governance, runs the new audit, and executes the existing hourly loop without `--apply`.

**Tech Stack:** Node.js 24, ECMAScript modules, Vitest, GitHub CLI/REST API, GitHub Actions.

## Global Constraints

- Never read or print the Maintainer App private key outside `actions/create-github-app-token`.
- Never use `GITHUB_TOKEN` for App evidence collection or write operations.
- Never dispatch review, merge, modify configuration, or execute PR-head code in the preflight workflow.
- Fail closed on missing, malformed, stale, or mismatched evidence.
- Preserve explicit production token permissions and do not add Administration permission.
- Bound all GitHub CLI output, error details, reports, and summaries.
- Do not claim that effective token scope proves the complete underlying App installation registration.
- Keep release, security, 100% reviewer coverage, and docstring gates unchanged.

---

### Task 1: Pure activation-evidence evaluator

**Files:**
- Create: `scripts/lib/maintainer-app-readiness.mjs`
- Create: `test/maintainer-app-readiness.test.ts`

**Interfaces:**
- Consumes: `evaluateMaintainerAppReadiness(evidence)` where `evidence` contains repository, installation id, App slug, bot account snapshots, accessible repositories, coarse repository permissions, API probe results, and governance report.
- Produces: `{ status: "PASS" | "FAIL", checks, failures }` plus exported expected probe names.

- [ ] **Step 1: Write failing evaluator tests**

Create a passing fixture, then vary one field at a time. Cover installation id, App slug, exact bot logins/types/suspension, identity separation, repository scope, pull/push/admin permissions, API probes, and governance repository/branch/status.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/maintainer-app-readiness.test.ts`

Expected: FAIL because `scripts/lib/maintainer-app-readiness.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure evaluator**

Export:

```js
export const REQUIRED_API_PROBES = Object.freeze([
  "actions_read",
  "checks_read",
  "statuses_read",
  "pull_requests_read",
  "contents_read",
]);

export function evaluateMaintainerAppReadiness(evidence) {
  // Return stable checks and fail-closed reasons.
}
```

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run test/maintainer-app-readiness.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/maintainer-app-readiness.mjs test/maintainer-app-readiness.test.ts
git commit -m "feat(operations): evaluate maintainer App readiness"
```

### Task 2: Shell-free GitHub evidence adapter

**Files:**
- Create: `scripts/maintainer-app-readiness.mjs`
- Create: `test/maintainer-app-readiness-script.test.ts`

**Interfaces:**
- Consumes: `GITHUB_REPOSITORY`, `NOEMA_MAINTAINER_APP_SLUG`, `NOEMA_MAINTAINER_INSTALLATION_ID`, `NOEMA_REVIEWER_LOGIN`, `NOEMA_GOVERNANCE_AUDIT_PATH`, optional `NOEMA_MAINTAINER_READINESS_PATH`, and `GH_TOKEN` inherited by `gh`.
- Uses: Task 1 evaluator.
- Produces: `artifacts/operations/maintainer-app-readiness.json`, `maintainer_app_readiness_status`, `maintainer_app_readiness_report_path`, and a job summary.

- [ ] **Step 1: Write failing adapter contract tests**

Require `spawnSync("gh", ...)`, `shell: false`, bounded buffers, `--paginate --slurp` for `/installation/repositories`, exact bot-user lookups, repository/default-branch reads, all named API probes, governance report loading, bounded report output, workflow outputs, and absence of private-key/token logging.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/maintainer-app-readiness-script.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement evidence collection**

Implement exported helpers for page flattening and bounded text. Collect only normalized fields. Discard probe response bodies. Emit a `collection_failed` report and nonzero exit on any collection or parse failure.

- [ ] **Step 4: Verify syntax and tests**

Run: `node --check scripts/maintainer-app-readiness.mjs`

Run: `npx vitest run test/maintainer-app-readiness-script.test.ts test/maintainer-app-readiness.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/maintainer-app-readiness.mjs test/maintainer-app-readiness-script.test.ts
git commit -m "feat(operations): collect maintainer App evidence"
```

### Task 3: Default-branch pre-activation workflow

**Files:**
- Create: `.github/workflows/maintainer-app-readiness.yml`
- Modify: `test/workflow-readiness.test.ts`
- Modify: `package.json`

**Interfaces:**
- Trigger: `repository_dispatch` type `maintainer-app-readiness` only.
- Produces: `main-governance-audit`, `maintainer-app-readiness`, and `commercial-readiness-loop-dry-run` artifacts.

- [ ] **Step 1: Add failing workflow contract tests**

Require trusted default-branch checkout, `contents: read` job token, pinned token action, exact production permissions, `installation-id` and `app-slug` outputs passed to the audit, Node 24, lockfile install, governance before App audit, App audit before dry-run loop, no `--apply`, no `workflow_dispatch`, no PR triggers, and artifact upload with `if: always()`.

- [ ] **Step 2: Run workflow test and verify RED**

Run: `npx vitest run test/workflow-readiness.test.ts`

Expected: FAIL because the workflow and package script do not exist.

- [ ] **Step 3: Add workflow and package command**

Add `"operations:preflight": "node scripts/maintainer-app-readiness.mjs"`. Create the workflow using the same pinned actions and exact permissions as production. Pass `steps.maintainer_app.outputs.app-slug` and `steps.maintainer_app.outputs.installation-id`. Run the existing loop without `--apply`.

- [ ] **Step 4: Run workflow and release verification**

Run: `npx vitest run test/workflow-readiness.test.ts`

Run: `npm run release:verify`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/maintainer-app-readiness.yml test/workflow-readiness.test.ts package.json
git commit -m "ci: add maintainer App pre-activation audit"
```

### Task 4: Operator and buyer documentation

**Files:**
- Create: `docs/maintainer-app-readiness-audit.md`
- Modify: `docs/hourly-commercial-readiness-loop.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `test/maintainer-app-readiness-script.test.ts`

**Interfaces:**
- Produces: a precise runbook, decision table, evidence interpretation, trigger example, and limitations.

- [ ] **Step 1: Add failing documentation assertions**

Require references to the workflow, `operations:preflight`, three artifact names, exact identity separation, effective-token limitation, issue #29, and no-write dry run.

- [ ] **Step 2: Run documentation tests and verify RED**

Run: `npx vitest run test/maintainer-app-readiness-script.test.ts`

Expected: FAIL on missing documentation.

- [ ] **Step 3: Write documentation and changelog**

Document prerequisites, repository-dispatch invocation, pass/fail meanings, exact checked evidence, administrator-only facts that remain external, activation sequence, rollback, and buyer due-diligence use.

- [ ] **Step 4: Run final verification**

Run: `npm run release:verify`

Run: `git diff --check`

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add docs README.md CHANGELOG.md test/maintainer-app-readiness-script.test.ts
git commit -m "docs: document maintainer App readiness evidence"
```

### Task 5: Review, PR, and merge

**Files:**
- Review all changed files.

- [ ] **Step 1: Confirm current `main` ancestry**

Update the branch if `main` moved. Do not overwrite concurrent work.

- [ ] **Step 2: Run complete verification**

Run: `npm run release:verify`

Run: `node --check scripts/maintainer-app-readiness.mjs`

Run: `git diff --check`

Expected: every command exits 0.

- [ ] **Step 3: Open a focused pull request**

Describe the buyer-visible gap, effective-token model, exact limitations, TDD evidence, workflow identity, and issue #29 relationship.

- [ ] **Step 4: Inspect every review and check**

Address all actionable human, CodeRabbit, security, and CI findings. Resolve addressed threads. Re-run checks on the current head.

- [ ] **Step 5: SHA-bound squash merge**

Merge only after every required current-head check succeeds, no effective change request remains, and no unresolved actionable thread remains. Confirm the open PR count returns to zero.
