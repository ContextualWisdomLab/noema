# Hourly NVIDIA NIM OpenCode Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-branch hourly OpenCode development workflow that uses only `NVIDIA_NIM_API_KEY`, creates at most one bounded pull request when the queue is empty, and leaves all review and merge decisions to existing governance.

**Architecture:** A new schedule at minute 47 is separate from the deterministic minute-17 commercial-readiness loop. The same trusted job gates on zero open PRs, runs a checksum-pinned OpenCode session without GitHub credentials, then uses a step-scoped repository token to package a nonempty working tree as one PR. A focused static contract test makes permissions, provider configuration, credential separation, fallback cleanup, prompt policy, and no-merge behavior release-gated.

**Tech Stack:** GitHub Actions, Bash, GitHub CLI, jq, OpenCode 1.17.13, NVIDIA NIM OpenAI-compatible API, Vitest, Node.js 24.

## Global Constraints

- Use `secrets.NVIDIA_NIM_API_KEY` only through the OpenCode development workflow; do not reference GitHub Copilot or reviewer credentials.
- Do not change `NOEMA_LLM_API_KEY`, central reviewer variables, or `contextual-orchestrator` reviewer behavior.
- Do not merge, release, publish, deploy, or fabricate production, KPI, customer, revenue, transfer, or acquisition evidence.
- Invoke the model only when the open PR count is zero and PR inventory is readable.
- Keep checkout credentials unpersisted and remove GitHub, repository, and Actions OIDC credentials from the OpenCode subprocess.
- Allow exactly one bounded PR against `main`; existing exact-head review and merge governance remains authoritative.
- Require test-first implementation, realistic Noema-specific tests, 100% production coverage, 100% reviewer coverage/docstrings when touched, APA 7th doctoring, modular MSA boundaries, and `CHANGELOG.md` traceability.
- Use descriptive two-word-or-longer `snake_case` names for any new database object.
- Figma and Product Design are not used because this increment has no user-facing visual interface.

---

### Task 1: Define the scheduled-agent security and product contract

**Files:**
- Create: `test/hourly-product-development-workflow.test.ts`

**Interfaces:**
- Consumes: `.github/workflows/hourly-product-development.yml`, `docs/operations/hourly-product-development.md`, `docs/doctoring/hourly-nim-opencode-development.md`, and `CHANGELOG.md` as UTF-8 text.
- Produces: an executable release-gate contract that rejects missing scheduling, NIM-only credentials, OpenCode pinning, permission isolation, fallback cleanup, PR-only packaging, prompt requirements, or documentation.

- [ ] **Step 1: Write the failing workflow contract test**

Create Vitest assertions equivalent to:

```ts
const workflow = readFileSync(
  ".github/workflows/hourly-product-development.yml",
  "utf8",
);

expect(workflow).toContain('cron: "47 * * * *"');
expect(workflow).toContain("workflow_dispatch:");
expect(workflow).toContain("cancel-in-progress: false");
expect(workflow).toContain("github.repository == 'ContextualWisdomLab/noema'");
expect(workflow).toContain("gh pr list");
expect(workflow).toContain("pull_request_inventory_unavailable");
expect(workflow).toContain("open_pull_request");
expect(workflow).toContain("nim_api_key_unavailable");
expect(workflow).toContain(
  "NVIDIA_API_KEY: ${{ secrets.NVIDIA_NIM_API_KEY }}",
);
expect(workflow).not.toContain("copilot");
expect(workflow).not.toContain("NOEMA_LLM_API_KEY");
expect(workflow).toContain('OPENCODE_VERSION: "1.17.13"');
expect(workflow).toContain(
  "157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348",
);
expect(workflow).toContain('"share": "disabled"');
expect(workflow).toContain('"baseURL": "https://integrate.api.nvidia.com/v1"');
expect(workflow).toContain('"apiKey": "{env:NVIDIA_API_KEY}"');
expect(workflow).toContain('"external_directory": "deny"');
expect(workflow).toContain('"webfetch": "deny"');
expect(workflow).toContain('"websearch": "deny"');
expect(workflow).toContain('"git commit *": "deny"');
expect(workflow).toContain('"git push *": "deny"');
expect(workflow).toContain('"gh *": "deny"');
expect(workflow).toContain("persist-credentials: false");
expect(workflow).toContain("env -u GH_TOKEN -u GITHUB_TOKEN");
expect(workflow).toContain("git reset --hard HEAD");
expect(workflow).toContain("git clean -fd");
expect(workflow).toContain("gh pr create");
expect(workflow).not.toMatch(/gh pr merge|gh release create|wrangler deploy/);
```

Add prompt assertions for `AGENTS.md`, buyer-visible gap selection, TDD, realistic tests, 100% coverage/docstrings, APA 7th doctoring, `contextual-orchestrator`, `.github`, `naruon`, MSA modularity, two-word `snake_case`, `CHANGELOG.md`, Semantic Versioning restraint, `PR_MESSAGE.md`, and prohibition on merge/release/deploy/evidence fabrication.

Add documentation assertions for the exact workflow, NIM secret, OpenCode pin, no-open-PR gate, credential separation, model fallback, and existing governance handoff.

- [ ] **Step 2: Open a draft PR and verify RED**

Open a draft PR from `feat/hourly-nim-opencode-development` to `main` after committing only the design, plan, and failing test.

Expected exact-head `ci / verify`: FAIL because `.github/workflows/hourly-product-development.yml` and required documentation do not exist.

- [ ] **Step 3: Record the expected failure**

Add the failing Actions run ID and the missing-file failure to the PR body. Do not weaken or skip the test.

- [ ] **Step 4: Commit**

```bash
git add test/hourly-product-development-workflow.test.ts
git commit -m "test(automation): define NIM OpenCode development contract"
```

### Task 2: Implement the isolated hourly OpenCode proposal workflow

**Files:**
- Create: `.github/workflows/hourly-product-development.yml`
- Test: `test/hourly-product-development-workflow.test.ts`

**Interfaces:**
- Consumes: `secrets.NVIDIA_NIM_API_KEY`, the default branch, GitHub's repository token in gate/packaging steps only, and optional `workflow_dispatch.inputs.dry_run`.
- Produces: no-op reason outputs or exactly one `nim-agent/product-dev-${GITHUB_RUN_ID}` PR against `main` containing the agent's bounded working-tree increment.

- [ ] **Step 1: Add schedule, concurrency, and fail-closed queue gate**

Create the workflow header:

```yaml
name: Hourly NVIDIA NIM Product Development

on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: Evaluate the gate and prompt without running OpenCode
        required: false
        default: false
        type: boolean
  schedule:
    - cron: "47 * * * *"

concurrency:
  group: hourly-nim-product-development-${{ github.repository }}
  cancel-in-progress: false

permissions:
  contents: read
```

Create one repository-pinned job with `contents: write`, `pull-requests: write`, Node 24, a 55-minute timeout, and no `id-token` permission. In the gate step pass `GH_TOKEN: ${{ github.token }}` and a boolean `NIM_CONFIGURED: ${{ secrets.NVIDIA_NIM_API_KEY != '' }}`. Use `gh pr list --state open --limit 1 --json number,url`; write `dispatch=false` plus one stable reason when the query fails, a PR exists, or the NIM secret is absent.

- [ ] **Step 2: Add the bounded Noema product prompt and dry-run summary**

Write the prompt to `${RUNNER_TEMP}/noema-agent-prompt.md`. Require one highest-impact buyer-visible gap, local architecture/issues/recent PR inspection, TDD, realistic tests, 100% coverage/docstrings, APA 7th sources in `docs/doctoring`, modular standalone/MSA compatibility, product-runtime LLM routing through `contextual-orchestrator`, no review-key mutation, database naming, changelog/docs, release restraint, and one `PR_MESSAGE.md`.

The dry-run path appends the complete prompt to `GITHUB_STEP_SUMMARY` but performs no checkout, download, or model call.

- [ ] **Step 3: Install checksum-pinned OpenCode and generate an untracked NIM-only config**

Checkout `main` with `persist-credentials: false`. Download the official `opencode-linux-x64.tar.gz` for `1.17.13`, verify SHA-256 `157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348`, install with mode `0755`, and print the version.

Generate `opencode.json` with:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "share": "disabled",
  "lsp": false,
  "mcp": {},
  "enabled_providers": ["nvidia-nim"],
  "model": "nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "small_model": "nvidia-nim/meta/llama-3.3-70b-instruct",
  "permission": {
    "external_directory": "deny",
    "task": "deny",
    "webfetch": "deny",
    "websearch": "deny",
    "bash": {
      "*": "allow",
      "git commit *": "deny",
      "git push *": "deny",
      "git tag *": "deny",
      "git remote *": "deny",
      "gh *": "deny"
    }
  },
  "provider": {
    "nvidia-nim": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "NVIDIA NIM",
      "options": {
        "baseURL": "https://integrate.api.nvidia.com/v1",
        "apiKey": "{env:NVIDIA_API_KEY}"
      }
    }
  }
}
```

Include explicit model entries and limits for the three ordered candidates plus the small model. Add `/opencode.json` to `.git/info/exclude`.

- [ ] **Step 4: Run bounded model fallback without GitHub credentials**

Set `NVIDIA_API_KEY: ${{ secrets.NVIDIA_NIM_API_KEY }}` only on the OpenCode step. Iterate the three candidate identifiers. Invoke:

```bash
timeout --kill-after=30s "${OPENCODE_RUN_TIMEOUT_SECONDS}s" \
  env -u GH_TOKEN -u GITHUB_TOKEN -u REPOSITORY_TOKEN \
  -u ACTIONS_ID_TOKEN_REQUEST_TOKEN -u ACTIONS_ID_TOKEN_REQUEST_URL \
  opencode run "$prompt" --model "$model"
```

On failure, run `git reset --hard HEAD` and `git clean -fd` before the next candidate. Fail after every candidate fails.

- [ ] **Step 5: Package one PR in a separate trusted step**

Remove `opencode.json`. Exit successfully when `git status --porcelain` is empty. Read the first line of `PR_MESSAGE.md` as the title and the remainder as the body when present, then delete the file. Configure the GitHub Actions bot identity, create `nim-agent/product-dev-${GITHUB_RUN_ID}`, commit all remaining changes, push with the step-scoped `GH_TOKEN`, and call `gh pr create --base main --head "$branch"`. Do not call merge, release, or deploy commands.

- [ ] **Step 6: Verify GREEN**

Run through PR CI:

```bash
npx vitest run test/hourly-product-development-workflow.test.ts
npm run release:verify
```

Expected: focused contract PASS; complete release verification PASS with 100% production coverage.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/hourly-product-development.yml
git commit -m "ci(automation): schedule NVIDIA NIM OpenCode development"
```

### Task 3: Document operations, security, research, and release traceability

**Files:**
- Create: `docs/operations/hourly-product-development.md`
- Create: `docs/doctoring/hourly-nim-opencode-development.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Test: `test/hourly-product-development-workflow.test.ts`

**Interfaces:**
- Consumes: the workflow contract from Task 2 and current primary OpenCode, GitHub Actions, NVIDIA NIM, and NIST sources.
- Produces: operator runbook, buyer-facing trust-boundary rationale, APA 7th references, and release notes.

- [ ] **Step 1: Write the operator runbook**

Document schedule offsets, manual dry-run, zero-open-PR behavior, NIM secret setup, candidate order, timeout/reset behavior, credential isolation, generated branch naming, PR handoff, no-op/error reasons, rollback by disabling the workflow, and the explicit prohibition on changing reviewer credentials.

- [ ] **Step 2: Write the doctoring document with APA 7th references**

Separate source-supported controls from Noema-specific decisions. Include APA 7th entries for current OpenCode CLI/provider/permission documentation, NVIDIA NIM's OpenAI-compatible API documentation, GitHub Actions security hardening and scheduled-workflow documentation, NIST SP 800-218, and the organization precedent used for the pinned OpenCode binary and fallback structure. State that the workflow follows these controls without claiming certification.

- [ ] **Step 3: Update README and CHANGELOG**

Add the operator runbook to the operations package and describe the proposal-only scheduler, NIM-only credential, and governance handoff in `CHANGELOG.md`. Do not bump `package.json` because no immutable production release, strict KPI, or deployment evidence is being published by this PR.

- [ ] **Step 4: Verify documentation contracts and full release gate**

Run through PR CI:

```bash
npx vitest run test/hourly-product-development-workflow.test.ts
npm run release:verify
git diff --check
```

Expected: every command exits zero; no placeholder, stale secret name, Copilot reference, or unsupported product claim remains.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md docs/operations/hourly-product-development.md docs/doctoring/hourly-nim-opencode-development.md test/hourly-product-development-workflow.test.ts
git commit -m "docs(automation): document hourly NIM development loop"
```

### Task 4: Exact-head review, repair, and merge

**Files:**
- Review every file changed in Tasks 1-3.

**Interfaces:**
- Produces: one merged PR and an open PR count of zero.

- [ ] **Step 1: Mark the PR ready and request exact-head review**

Update the PR body with the RED run, model/credential boundary, focused/full verification, sources, and residual risk. Request CodeRabbit, OpenCode, and Noema review for the exact current head.

- [ ] **Step 2: Address every actionable review thread**

Inspect thread-aware review state, implement valid findings test-first, reply or resolve only after the exact fix is present, and reject suggestions that would expose credentials, mix reviewer secrets, weaken gates, or grant the agent merge authority.

- [ ] **Step 3: Re-run exact-head checks**

Require current-head `ci`, `reviewer-ci`, Scorecard, OSV, Trivy, dependency review, CodeRabbit status, no change-request review, and zero unresolved threads. Cancelled, queued, stale, predecessor, metadata-only, or self-approval evidence is insufficient.

- [ ] **Step 4: Merge with a SHA precondition**

Squash-merge using the exact reviewed head SHA. Verify the merge result, main commit, and that `repo:ContextualWisdomLab/noema is:pr is:open` returns zero.
