# Hourly NVIDIA NIM product-development operations

## Purpose

`.github/workflows/hourly-product-development.yml` starts one bounded, proposal-only Noema development session when the repository has zero open pull requests. It uses OpenCode 1.17.13 with the dedicated organization secret `NVIDIA_NIM_API_KEY`. It never reviews, approves, merges, releases, publishes, or deploys. `hourly-commercial-readiness` remains authoritative for exact-head review, Checks, ruleset audit, and SHA-bound merge.

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

## Credential-separated two-job boundary

### Read-only proposal job

`propose_product_increment` has only `contents: read` and `pull-requests: read`. Checkout does not persist credentials. The OpenCode subprocess receives only `NVIDIA_API_KEY` and removes GitHub tokens, Actions OIDC variables, artifact/cache runtime tokens, and runner command-file variables such as `GITHUB_ENV`, `GITHUB_OUTPUT`, and `GITHUB_PATH`.

The proposal job cannot push or open a PR. It runs `npm run release:verify`, rejects whitespace errors and symlinks, and enforces 40 changed files and 500,000 patch bytes. A successful proposal is serialized as `proposal.patch`, bound to SHA-256, file count, byte count, and exact base commit, then uploaded for one day.

### Fresh write-capable runner

`package_product_increment` is a separate fresh write-capable runner. It never receives `NVIDIA_API_KEY`. It checks out the exact base SHA, downloads `proposal.patch`, verifies the digest and byte count, applies it with `git apply --check --binary`, and confirms the reconstructed diff matches the read-only job evidence.

Before applying untrusted code, it copies the base branch's trusted PR metadata parser into `RUNNER_TEMP`. Dependency installation and `npm run release:verify` run without GitHub, OIDC, Actions runtime, cache, or runner command-file credentials and with an isolated temporary home. Lifecycle scripts are disabled during `npm ci`. Verification must not mutate tracked or non-ignored untracked files, and the staged patch digest must remain unchanged afterward.

Only after fresh-runner verification does a token-bearing step re-read the open-PR inventory and live `main` SHA. Any new PR, unreadable inventory, or advanced base fails closed before remote mutation.

## Untrusted PR metadata

`PR_MESSAGE.md` is model-generated input. `scripts/prepare-agent-pr-message.mjs` requires a regular non-symlink file, opens it with `O_NOFOLLOW`, verifies inode stability, decodes strict UTF-8, rejects unsupported control and bidi characters, normalizes line endings, and enforces a 120-byte title and 20,000-byte body. Trusted outputs `pr-title.txt` and `pr-body.md` use mode `0600`. The source file is deleted before commit.

## Trusted packaging

The packaging step creates one branch named `nim-agent/product-dev-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`, disables Git hooks for the commit, verifies that the remote branch does not already exist, pushes once, and calls `gh pr create` once against `main`. It never calls merge, release, or deployment commands.

The generated PR then enters the normal review → repair → exact-head Checks → merge loop. CodeRabbit, OpenCode review, Noema review, `ci`, `reviewer-ci`, Security Scan, branch rules, and unresolved-thread checks remain independent requirements.

## Product contract

The prompt requires one buyer-visible gap, test-first RED-to-GREEN evidence, realistic Noema traffic/security/operations/provenance tests, 100% production coverage, 100% reviewer coverage and docstring coverage when touched, APA 7 doctoring, modular MSA compatibility with `ContextualWisdomLab/.github`, `naruon`, and `contextual-orchestrator`, descriptive two-word-or-longer `snake_case` database objects, `CHANGELOG.md`, affected documentation, and Semantic Versioning restraint.

It forbids reviewer-key changes, gate weakening, unrelated refactors, merge, publish, release, deploy, and fabricated production KPI, customer, paid-pilot, revenue, transfer, attestation, or acquisition evidence.

## Residual risk

The NIM credential necessarily exists in the OpenCode process. Command denials are defense in depth, not a microVM egress boundary. The stronger security claim is narrower: no write-capable repository token co-resides with the model, and only a digest-bound patch crosses into a fresh write-capable runner. Operators must assess whether repository source may be processed by NVIDIA NIM.

GitHub cannot atomically create a PR only when no other PR exists. The final pre-push queue and base revalidation narrows this race; branch protection and exact-head governance remain the decisive control.

## Enablement and rollback

Before enabling the schedule, run a dry run, verify `NVIDIA_NIM_API_KEY` scope, confirm branch protection and `hourly-commercial-readiness`, and inspect the first generated PR's RED-to-GREEN and `npm run release:verify` evidence.

Disable **Hourly NVIDIA NIM Product Development** in Actions or revoke `NVIDIA_NIM_API_KEY` to stop model execution without changing reviewer credentials. Removing the workflow from `main` is the code rollback and does not affect `/exchange`, central review, release, deployment, or production traffic.
