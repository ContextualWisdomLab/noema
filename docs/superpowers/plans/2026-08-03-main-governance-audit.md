# Main Governance Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fail closed before autonomous review dispatch or merge unless GitHub reports active, strict governance rules for `main`.

**Architecture:** A pure ESM evaluator validates the active branch-rules response. A shell-free GitHub adapter collects all pages, emits audit evidence, and exits nonzero on drift. The hourly workflow runs this audit before any write action.

**Tech Stack:** Node.js 24, ECMAScript modules, Vitest, GitHub CLI/API, GitHub Actions.

## Global Constraints

- Do not grant repository administration permission to the maintainer App.
- Use `GET /repos/{owner}/{repo}/rules/branches/main` with complete pagination.
- Fail closed on malformed, missing, or incomplete governance evidence.
- Require integration-pinned mandatory status checks.
- Preserve existing release, reviewer, security, and docstring gates.
- Do not claim bypass actors are verified when GitHub omits them.

---

### Task 1: Pure rules evaluator

**Files:**
- Create: `scripts/lib/main-governance-audit.mjs`
- Create: `test/main-governance-audit.test.ts`

**Interfaces:**
- Produces `REQUIRED_MAIN_CHECK_NAMES` and `evaluateMainGovernanceRules(rules)`.
- Returns `{ status, checks, failures }` with stable failure codes.

- [ ] Write failing tests for compliant and noncompliant rule arrays.
- [ ] Run `npx vitest run test/main-governance-audit.test.ts` and confirm RED.
- [ ] Implement the minimal evaluator.
- [ ] Re-run focused tests and confirm PASS.
- [ ] Commit with `feat(governance): evaluate active main rules`.

### Task 2: GitHub audit adapter

**Files:**
- Create: `scripts/main-governance-audit.mjs`
- Create: `test/main-governance-audit-script.test.ts`

**Interfaces:**
- Reads `GITHUB_REPOSITORY`, optional `NOEMA_GOVERNANCE_AUDIT_PATH`, `GITHUB_STEP_SUMMARY`, and `GITHUB_OUTPUT`.
- Writes bounded JSON evidence and exits 1 on audit failure.

- [ ] Write contract tests for shell-free `gh api --paginate --slurp`, endpoint, evidence path, summary, and exit behavior.
- [ ] Confirm RED.
- [ ] Implement adapter with strict repository validation and bounded errors.
- [ ] Run `node --check` and focused tests.
- [ ] Commit with `feat(governance): audit live main rules`.

### Task 3: Workflow and package integration

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/hourly-commercial-readiness.yml`
- Modify: `test/workflow-readiness.test.ts`

**Interfaces:**
- Adds `npm run governance:audit`.
- Runs audit before `hourly-commercial-readiness.mjs --apply` using the maintainer App token.
- Uploads governance evidence with the loop report.

- [ ] Add failing workflow/package assertions.
- [ ] Confirm RED.
- [ ] Wire the script and artifact path before write actions.
- [ ] Run focused tests and `npm run release:verify`.
- [ ] Commit with `ci(governance): gate maintainer loop on main rules`.

### Task 4: Documentation and traceability

**Files:**
- Create: `docs/main-governance-audit.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Update: issue #27 with implementation evidence after PR creation.

- [ ] Add failing documentation assertions.
- [ ] Confirm RED.
- [ ] Document rule contract, permissions, evidence, operator remediation, and bypass-visibility limitation.
- [ ] Run `npm run release:verify` and `git diff --check` through CI.
- [ ] Open a focused PR and request CodeRabbit review.
