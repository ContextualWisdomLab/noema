# Hourly NVIDIA NIM product-development operations

## Purpose

`.github/workflows/hourly-product-development.yml` starts one bounded, proposal-only Noema development session when the repository has zero open pull requests. It uses OpenCode 1.17.13 with the dedicated organization secret `NVIDIA_NIM_API_KEY`. It never reviews, approves, merges, releases, publishes a release, or deploys. `hourly-commercial-readiness` remains authoritative for exact-head review, Checks, ruleset audit, and SHA-bound merge.

## Schedule and single flight

The workflow runs at minute 47 of every hour and supports `workflow_dispatch` with `dry_run=true`. Its non-cancelling concurrency group permits only one run. The minute-47 offset avoids normal overlap with the minute-17 governance loop. GitHub scheduling is recurring intent rather than a wall-clock SLA; delayed or omitted runs are safe because each run re-evaluates the current queue.

A dry run reads the live PR inventory and renders the full task contract, but performs no checkout, OpenCode download, NVIDIA request, artifact upload, branch push, or PR creation.

## Fail-closed gate

Before checkout or model invocation, the read-only proposal job requires:

1. exact repository `ContextualWisdomLab/noema`;
2. a readable GitHub open-PR inventory;
3. zero open pull requests; and
4. `NVIDIA_NIM_API_KEY`, except during a manual dry run.

Stable no-op reasons are `pull_request_inventory_unavailable`, `open_pull_request`, `nim_api_key_unavailable`, and `ready_dry_run_without_nim`.

## OpenCode and model fallback

The workflow downloads the official OpenCode 1.17.13 Linux x64 archive and verifies SHA-256:

```text
157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348
```

OpenCode is configured only for `https://integrate.api.nvidia.com/v1`, with sharing, auto-update, MCP, LSP, external-directory access, subagents, interactive questions, web fetch, and web search disabled. Candidate fallback order is:

1. `nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5`
2. `nvidia-nim/nvidia/nemotron-3-super-120b-a12b`
3. `nvidia-nim/deepseek-ai/deepseek-v4-pro`

The small model is `nvidia-nim/meta/llama-3.3-70b-instruct`. Each candidate receives 2,400 seconds plus a 30-second forced-termination grace period. A failed candidate is followed by `git reset --hard HEAD`, `git clean -fdx`, and a clean dependency reinstall before fallback. Every candidate failure ends the run without a branch or PR.

## Credential-separated three-job boundary

GitHub executes all steps in one job on the same runner and filesystem. Therefore, environment cleanup inside a job is not sufficient after untrusted proposed code has executed: a background process or modified runner state could survive into a later credential-bearing step. Noema uses three separate GitHub-hosted jobs so model execution, proposal verification, and publication authority never share a runner.

### 1. Read-only proposal job

`propose_product_increment` has only `contents: read` and `pull-requests: read`. Checkout does not persist credentials. The OpenCode subprocess receives only `NVIDIA_API_KEY` and removes GitHub tokens, Actions OIDC variables, artifact/cache runtime tokens, and runner command-file variables such as `GITHUB_ENV`, `GITHUB_OUTPUT`, and `GITHUB_PATH`.

The proposal job cannot push or open a PR. It runs `npm run release:verify`, rejects whitespace errors, symlinks, and gitlinks, and enforces 40 changed files and 500,000 patch bytes. A successful proposal is serialized as a binary full-index `proposal.patch`, bound to its exact base SHA, patch SHA-256, file count, and byte count.

The full-SHA-pinned `actions/upload-artifact` action uploads one immutable one-day artifact and exports its exact `artifact-id` and archive `artifact-digest`. `overwrite: false` prevents replacement under the same name.

### 2. Fresh uncredentialed verification runner

`package_product_increment` is a fresh runner with read-only `contents`, `pull-requests`, and `actions` permissions. It receives neither `NVIDIA_NIM_API_KEY` nor Maintainer App credentials.

It downloads the artifact by exact numeric ID, obtains the exact artifact object through the GitHub REST API, and verifies:

- artifact ID and deterministic name;
- non-expired state;
- originating workflow-run ID;
- upload action digest against the REST `sha256:` digest;
- patch SHA-256, byte count, changed-file count, and exact base SHA;
- absence of symlink and gitlink modes.

It then applies the patch, installs dependencies without lifecycle scripts, and reruns `npm run release:verify` with GitHub, OIDC, Actions runtime/cache, and runner command-file credentials removed and with an isolated temporary home. Verification must not mutate tracked or non-ignored untracked files, and the staged patch digest must remain unchanged afterward.

This runner executes untrusted proposed code but never receives publication authority.

### 3. Fresh write-capable runner with late-bound Maintainer App

`publish_product_increment` runs only after the verification job succeeds. It is a third fresh write-capable runner whose job-level `GITHUB_TOKEN` remains read-only. It receives no NIM credential and does not install dependencies or execute proposed tests, build scripts, package scripts, or model-generated shell commands.

Before applying the proposal, it copies the exact base branch's trusted PR metadata parser into `RUNNER_TEMP`. It downloads the same artifact by exact ID, independently repeats artifact metadata, workflow-run, archive digest, patch digest, byte-count, file-count, symlink, and gitlink checks, and reconstructs the staged patch. It parses only bounded PR metadata with the preserved trusted parser.

Only after these non-executing checks does the full-SHA-pinned `actions/create-github-app-token` action mint a short-lived token from `NOEMA_MAINTAINER_APP_CLIENT_ID` and `NOEMA_MAINTAINER_APP_PRIVATE_KEY`. The token is scoped to `ContextualWisdomLab/noema` with metadata read, contents write, and pull-request write only.

The App token re-reads the open-PR inventory and live `main` SHA. Any new PR, unreadable inventory, mismatched checkout, or advanced base fails closed before remote mutation. Because proposed executable code never ran on this runner, it cannot leave a resident process or runner-state modification waiting for publication credentials.

## Untrusted PR metadata

`PR_MESSAGE.md` is model-generated input. `scripts/prepare-agent-pr-message.mjs` requires a regular non-symlink file, opens it with `O_NOFOLLOW`, verifies inode stability, decodes strict UTF-8, rejects unsupported control and bidi characters, normalizes line endings, and enforces a 120-byte title and 20,000-byte body. Trusted outputs `pr-title.txt` and `pr-body.md` use mode `0600`. The source file is deleted before commit.

## Trusted packaging

The Maintainer App-backed packaging step creates one branch named `nim-agent/product-dev-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`, disables Git hooks for the commit, verifies that the remote branch does not already exist, pushes once, and calls `gh pr create` once against `main`. If PR creation fails after a successful branch push, an error trap removes the orphan branch. It never calls merge, release, or deployment commands.

Using the dedicated Maintainer App ensures the generated branch and PR are not authored by the workflow's repository `GITHUB_TOKEN`, whose recursive workflow-trigger suppression would otherwise undermine the expected independent PR Checks.

The generated PR then enters the normal review → repair → exact-head Checks → merge loop. CodeRabbit, OpenCode review, Noema review, `ci`, `reviewer-ci`, Security Scan, branch rules, and unresolved-thread checks remain independent requirements.

## Product contract

The prompt requires one buyer-visible gap, test-first RED-to-GREEN evidence, realistic Noema traffic/security/operations/provenance tests, 100% production coverage, 100% reviewer coverage and docstring coverage when touched, APA 7 doctoring, modular MSA compatibility with `ContextualWisdomLab/.github`, `naruon`, and `contextual-orchestrator`, descriptive two-word-or-longer `snake_case` database objects, `CHANGELOG.md`, affected documentation, and Semantic Versioning restraint.

It forbids reviewer-key changes, gate weakening, unrelated refactors, merge, publish, release, deploy, and fabricated production KPI, customer, paid-pilot, revenue, transfer, attestation, or acquisition evidence.

## Residual risk

The NIM credential necessarily exists in the OpenCode process. Command denials are defense in depth, not a microVM egress boundary. The stronger security claim is narrower: no write-capable repository token co-resides with the model, untrusted verification occurs on a runner that never receives publication credentials, and the fresh publisher reconstructs only the same immutable ID- and digest-bound patch without executing proposed code. Operators must assess whether repository source may be processed by NVIDIA NIM.

GitHub cannot atomically create a PR only when no other PR exists. The final pre-push queue and base revalidation narrows this race; branch protection and exact-head governance remain the decisive control.

Artifact digest and workflow-run binding protect the handoff represented by GitHub's stored artifact object. They do not prove semantic correctness. The independent verifier, exact-head PR Checks, human or Reviewer App approval, and branch rules remain required.

## Enablement and rollback

Before enabling the schedule, run a dry run, verify `NVIDIA_NIM_API_KEY` scope, confirm the Maintainer App variables and secret are configured, confirm branch protection and `hourly-commercial-readiness`, and inspect the first generated PR's RED-to-GREEN and `npm run release:verify` evidence.

Disable **Hourly NVIDIA NIM Product Development** in Actions or revoke `NVIDIA_NIM_API_KEY` to stop model execution without changing reviewer credentials. Revoking the Maintainer App key stops publication while preserving read-only proposal and verification behavior. Removing the workflow from `main` is the code rollback and does not affect `/exchange`, central review, release, deployment, or production traffic.
