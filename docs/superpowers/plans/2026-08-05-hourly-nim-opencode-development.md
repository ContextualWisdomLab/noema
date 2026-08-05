# Hourly NVIDIA NIM OpenCode Development Implementation Plan

> **Status:** Implemented and security-revised on PR #64. This plan replaces the initial same-job and two-job packaging sequence with a three-runner design. The retained RED evidence and exact-head CI remain the execution record.

**Goal:** Add an hourly, proposal-only OpenCode development loop that uses `NVIDIA_NIM_API_KEY`, creates at most one bounded pull request when the queue is empty, and leaves review, release, deployment, and merge decisions to existing exact-head governance.

**Architecture:** Minute-47 scheduling is separate from the deterministic minute-17 commercial-readiness loop. `propose_product_increment` runs the model and exports one immutable patch from a read-only runner. `package_product_increment` executes and verifies that patch on a fresh runner with no publication credentials. `publish_product_increment` reconstructs the same artifact without executing proposed code on a third fresh runner and only then mints the least-privilege Maintainer App token for one branch and one PR.

**Tech stack:** GitHub Actions, Bash, GitHub CLI, jq, OpenCode 1.17.13, NVIDIA NIM OpenAI-compatible API, Node.js 24, Vitest, GitHub Actions artifacts, and a repository-scoped Maintainer GitHub App.

## Global constraints

- Use `secrets.NVIDIA_NIM_API_KEY` only for the OpenCode proposal job; do not reference GitHub Copilot, GitHub Models, reviewer App credentials, or `NOEMA_LLM_API_KEY`.
- Do not change central reviewer variables, reviewer App identity, or `contextual-orchestrator` reviewer behavior.
- Do not merge, release, publish, deploy, approve, or fabricate production, KPI, customer, revenue, transfer, attestation, or acquisition evidence.
- Invoke the model only when open-PR inventory is readable and the open count is zero.
- Keep every job-level `GITHUB_TOKEN` read-only. Publication authority must be a late-bound repository-scoped Maintainer App token on a runner that never executed proposed code.
- Keep checkout credentials unpersisted and remove GitHub, OIDC, Actions runtime/cache, and runner command-file variables from untrusted execution.
- Bind the proposal handoff to exact base SHA, patch SHA-256, changed-file count, patch byte count, `artifact-id`, `artifact-digest`, artifact name, workflow-run ID, and expiry state.
- Reject symlink mode `120000` and gitlink mode `160000` at proposal, verification, and publication boundaries.
- Require test-first implementation, realistic Noema-specific tests, 100% production coverage, reviewer coverage/docstrings when touched, APA 7 doctoring, modular MSA compatibility, `CHANGELOG.md`, and release restraint.
- Use descriptive two-word-or-longer `snake_case` names for any new database object.
- Figma and Product Design are not used because this increment has no user-facing visual interface.

---

## Task 1 — Define the proposal-only product contract

**Files**

- `test/hourly-product-development-workflow.test.ts`
- `docs/superpowers/specs/2026-08-05-hourly-nim-opencode-development-design.md`
- this implementation plan

- [x] Write the failing workflow contract before implementation.
- [x] Require minute-47 scheduling, manual dry run, non-cancelling concurrency, exact repository binding, readable zero-open-PR gate, NIM-only credentials, checksum-pinned OpenCode, bounded fallback, no model write authority, one PR maximum, no merge/release/deploy command, product-quality prompt requirements, operations documentation, doctoring, and changelog traceability.
- [x] Retain the initial RED workflow run and do not weaken the contract.

**Evidence:** initial missing-workflow RED run `30966458223`.

## Task 2 — Implement the read-only proposal runner

**Job:** `propose_product_increment`

- [x] Grant only `contents: read` and `pull-requests: read`.
- [x] Query at most one open PR and record stable fail-closed reasons when inventory is unavailable, a PR exists, or the NIM secret is unavailable.
- [x] Check out exact `main` without persisted credentials and record the full 40-character base SHA.
- [x] Install dependencies without lifecycle scripts before model execution.
- [x] Download the official OpenCode 1.17.13 archive and verify SHA-256 `157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348`.
- [x] Configure only the NVIDIA NIM provider, disable sharing, auto-update, MCP, LSP, web access, external-directory access, task delegation, interactive questions, and repository mutation commands.
- [x] Run ordered NIM fallback with bounded timeout and hard reset, ignored/untracked cleanup, and clean reinstall after each failed candidate.
- [x] Remove GitHub tokens, Actions OIDC variables, artifact/cache runtime variables, and runner command-file variables from the OpenCode subprocess.
- [x] Run `npm run release:verify` before export.
- [x] Stage the complete proposal, reject whitespace errors, symlinks, gitlinks, more than 40 files, and more than 500,000 patch bytes.
- [x] Serialize `proposal.patch` with `--binary --full-index` and record exact patch SHA-256, file count, byte count, and base SHA.
- [x] Upload with the full-SHA-pinned artifact action, one-day retention, no overwrite, and `id: upload_proposal`.
- [x] Export both `artifact-id` and `artifact-digest` as job outputs.

**No remote mutation:** this job contains no Maintainer App action, `git push`, or `gh pr create`.

## Task 3 — Add a fresh uncredentialed verifier

**Job:** `package_product_increment`

- [x] Depend on `propose_product_increment` and use a new GitHub-hosted runner.
- [x] Grant read-only repository, pull-request, and Actions permissions.
- [x] Download by exact numeric `artifact-id` rather than mutable name selection.
- [x] Query the artifact REST object and validate ID, deterministic name, non-expired state, originating workflow-run ID, and REST `sha256:` digest against exported `artifact-digest`.
- [x] Validate patch SHA-256, patch byte count, changed-file count, exact base SHA, and forbidden Git modes.
- [x] Apply the patch and install dependencies without lifecycle scripts.
- [x] Execute `npm run release:verify` with GitHub, OIDC, Actions runtime/cache, and runner command-file channels removed and an isolated temporary home.
- [x] Fail when verification mutates tracked or non-ignored untracked files.
- [x] Recompute the staged patch and require the original SHA-256 and byte count after verification.
- [x] Keep `NVIDIA_NIM_API_KEY`, Maintainer App variables, Maintainer App private key, App token, `git push`, and `gh pr create` absent.

**RED evidence:** run `30969603538` proved the initial architecture failed the required runner-isolation contract because verification and later credential minting shared a job.

## Task 4 — Add a third fresh non-executing publisher

**Job:** `publish_product_increment`

- [x] Depend on both successful proposal and verifier jobs.
- [x] Start on a third fresh GitHub-hosted runner with a read-only job token and no NIM credential.
- [x] Do not install dependencies or execute proposed tests, builds, package scripts, binaries, or shell commands.
- [x] Copy the trusted exact-base PR metadata parser into `RUNNER_TEMP` before patch application.
- [x] Download the same exact `artifact-id` and independently repeat artifact name, workflow-run, expiry, `artifact-digest`, patch digest, base, file, byte, symlink, and gitlink checks.
- [x] Apply the patch only as Git data.
- [x] Parse `PR_MESSAGE.md` with the preserved strict parser, remove the untrusted source file, and stage only bounded outputs.
- [x] Mint the dedicated Maintainer App token only after all non-executing validation. Scope it to `ContextualWisdomLab/noema` with metadata read, contents write, and pull-request write.
- [x] Re-read open-PR inventory and live `main`; fail before push on unreadable inventory, any open PR, checkout mismatch, or advanced base.
- [x] Create a unique branch, disable hooks for commit, verify no remote branch collision, push once, and call `gh pr create` once.
- [x] Delete the orphan branch if PR creation fails.

The third fresh publisher is the only write-capable runner. Proposed code never executes before or after its Maintainer App token is minted.

## Task 5 — Treat model-generated PR metadata as untrusted input

**Files**

- `scripts/prepare-agent-pr-message.mjs`
- `test/agent-pr-message.test.ts`

- [x] Require a regular non-symlink file.
- [x] Open with `O_NOFOLLOW` and validate stable inode metadata.
- [x] Decode strict UTF-8 and reject malformed encoding, unsupported control characters, and bidirectional control characters.
- [x] Normalize line endings.
- [x] Enforce a 120-byte title and 20,000-byte body.
- [x] Write trusted title/body files with owner-only permissions.
- [x] Cover realistic Unicode, byte-budget, encoding, control-character, file-mode, and symlink cases.

**Evidence:** bounded metadata RED run `30967569870` and stale-base/metadata race run `30967373769`.

## Task 6 — Add immutable artifact and Git object boundary tests

**Files**

- `test/hourly-product-development-runner-isolation.test.ts`
- `test/hourly-product-development-git-mode-boundary.test.ts`

- [x] Prove the verifier contains release verification but no Maintainer App credential or remote mutation.
- [x] Prove the publisher depends on both prior jobs, downloads by `artifact-id`, validates without executing proposed code, parses metadata before token mint, and revalidates queue/base after token mint.
- [x] Prove both fresh jobs use the upload action's `artifact-id` and `artifact-digest` outputs.
- [x] Prove symlink and gitlink modes are rejected at all three boundaries.
- [x] Prove the design specification and this plan remain aligned with the implemented three-runner architecture and contain no superseded same-job write-permission claims.

## Task 7 — Document operations and scientific/standards rationale

**Files**

- `docs/operations/hourly-product-development.md`
- `docs/doctoring/hourly-nim-opencode-development.md`
- `README.md`
- `CHANGELOG.md`

- [x] Document schedule, dry run, zero-open-PR behavior, model fallback, exact evidence, three runner roles, late-bound App token, generated branch, PR handoff, no-op reasons, enablement, and rollback.
- [x] Record GitHub job/runner lifetime, compromised-runner threat, artifact immutability and digest outputs, GitHub App token scoping, recursive workflow trigger behavior, OpenCode, NVIDIA NIM, and NIST SP 800-218 sources in APA 7 form.
- [x] Separate source-supported facts, Noema decisions, assumptions, and residual risk.
- [x] Update `CHANGELOG.md` without a version bump because this PR does not publish immutable release, production deployment, strict KPI, customer, revenue, or transfer evidence.

## Task 8 — Exact-head review, repair, and merge

- [x] Mark the PR ready and inspect every open PR exact head.
- [x] Resolve the stale GitHub Advanced Security token-permission findings by keeping all job-level `GITHUB_TOKEN` permission sets read-only and using the late-bound repository-scoped Maintainer App token.
- [x] Retain and address the three-runner isolation RED contract.
- [x] Retain and address the Git symlink/gitlink boundary contract.
- [x] Run current-head `ci`, `reviewer-ci`, and Security Scan after every implementation change.
- [ ] Obtain substantive CodeRabbit review for the final exact head.
- [ ] Obtain independent OpenCode or Noema `APPROVE` for the final exact head.
- [ ] Confirm zero unresolved threads, current-head required Checks, repository rules, and mergeability.
- [ ] Squash-merge with `expected_head_sha` and verify the open PR count returns to zero.

Queued, cancelled, stale, predecessor-head, metadata-only, self-review, or model-status evidence is not accepted as success.

## Final verification commands

```bash
npx vitest run test/hourly-product-development-workflow.test.ts
npx vitest run test/hourly-product-development-runner-isolation.test.ts
npx vitest run test/hourly-product-development-git-mode-boundary.test.ts
npx vitest run test/agent-pr-message.test.ts
npm run release:verify
git diff --check
```

Expected result: every command exits zero; production statements, branches, functions, and lines remain 100%; reviewer line/branch and docstring gates remain 100%; dependency and security scans pass; no reviewer credential name changes; and no merge, release, or deployment authority exists in the product-development workflow.

## Residual risk and follow-up

- The NIM key necessarily exists in the OpenCode process. A future narrow inference broker could keep the upstream credential outside the model process.
- Repository source may be processed by NVIDIA NIM and requires operator confidentiality, retention, regional, and contractual review.
- The verifier executes untrusted code on an ephemeral hosted runner with outbound network access under GitHub policy, but it receives no publication, NIM, OIDC, artifact/cache runtime, or command-file credentials.
- The handoff trusts GitHub artifact storage, metadata, hosted runners, and pinned actions. Exact IDs and digests detect exposed mismatch but do not prove semantic correctness.
- GitHub cannot atomically create a PR only when no PR exists. Final queue/base revalidation, unique branches, branch protection, and exact-head governance bound the race.
- A future reusable `ContextualWisdomLab/.github` workflow must preserve this three-runner boundary and allow Noema to remain independently operable.
