# Hourly NVIDIA NIM product-development operations

## Purpose

`.github/workflows/hourly-product-development.yml` starts one bounded, proposal-only Noema development session when the repository has zero open pull requests. It uses OpenCode 1.17.13 with the organization `NVIDIA_NIM_API_KEY` secret and opens, at most, one pull request against `main`.

The workflow never reviews, approves, merges, releases, publishes, deploys, or fabricates commercial evidence. The existing `hourly-commercial-readiness` workflow remains authoritative for review state, exact-head Checks, governance, and SHA-bound merge decisions.

## Schedule and single-flight behavior

The workflow is scheduled at minute 47 of every hour:

```yaml
schedule:
  - cron: "47 * * * *"
```

The deterministic commercial-readiness loop runs at minute 17, so the two normal schedules are offset by 30 minutes. GitHub scheduled events are recurring intent rather than a real-time SLA: runner load can delay or, under sufficiently high load, drop a scheduled run. The workflow-level concurrency group permits only one Noema development run at a time and does not cancel an active run.

Scheduled execution occurs only after this workflow exists on the default branch. A manual dry run is also available from the Actions page.

## Required secret

Create the organization or repository Actions secret:

```text
NVIDIA_NIM_API_KEY
```

The workflow maps that value to `NVIDIA_API_KEY` only for the OpenCode step. It does not reference or rename Noema reviewer credentials such as `NOEMA_LLM_API_KEY`, `NOEMA_GITHUB_APP_PRIVATE_KEY`, or the `contextual-orchestrator` review variables.

A missing NIM secret causes the scheduled run to record `nim_api_key_unavailable` and stop before checkout or model execution. Manual dry-run mode may proceed without the secret because it evaluates only the queue gate and task contract.

## Manual dry run

Use **Actions → Hourly NVIDIA NIM Product Development → Run workflow** and set `dry_run` to `true`.

A dry run:

1. verifies that the workflow is running in `ContextualWisdomLab/noema`;
2. queries the current open pull-request inventory;
3. requires zero open pull requests;
4. writes the complete bounded task contract to the job summary; and
5. performs no checkout, dependency install, OpenCode download, NVIDIA request, branch push, or pull-request creation.

The expected no-op reasons are:

| Reason | Meaning |
|---|---|
| `pull_request_inventory_unavailable` | GitHub did not return a trustworthy PR inventory; development failed closed. |
| `open_pull_request` | At least one PR is open; the review and merge loop owns the hour. |
| `nim_api_key_unavailable` | The dedicated development secret is absent during a non-dry run. |
| `ready_dry_run_without_nim` | The PR gate passed and the task contract was rendered without a model call. |

## Model and fallback contract

The workflow downloads the official Linux x64 OpenCode archive for version `1.17.13` and verifies SHA-256 digest:

```text
157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348
```

The checked binary is installed with mode `0755`; auto-update is disabled. Updating OpenCode requires a dedicated reviewed change containing the new exact version, official artifact URL, verified digest, compatibility tests, and `CHANGELOG.md` entry. The scheduler does not follow a mutable `latest` tag.

OpenCode uses only the custom `nvidia-nim` OpenAI-compatible provider at:

```text
https://integrate.api.nvidia.com/v1
```

Candidates run in this order:

1. `nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5`
2. `nvidia-nim/nvidia/nemotron-3-super-120b-a12b`
3. `nvidia-nim/deepseek-ai/deepseek-v4-pro`

The small model is `nvidia-nim/meta/llama-3.3-70b-instruct`.

Each candidate receives at most 2,400 seconds and a 30-second forced-termination grace period. After a failed or timed-out candidate, the workflow executes `git reset --hard HEAD` and `git clean -fd` before trying the next candidate. Partial output from one model cannot become input to the next fallback. If every candidate fails, the run fails and creates no branch or PR.

## Credential and network boundary

Checkout uses `persist-credentials: false`. The OpenCode subprocess receives `NVIDIA_API_KEY` but explicitly removes:

- `GH_TOKEN`;
- `GITHUB_TOKEN`;
- `REPOSITORY_TOKEN`;
- `ACTIONS_ID_TOKEN_REQUEST_TOKEN`; and
- `ACTIONS_ID_TOKEN_REQUEST_URL`.

OpenCode sharing, MCP, LSP, external-directory access, subagent delegation, interactive questions, web fetch, and web search are disabled. Shell policy denies common network clients and every reviewed GitHub or Git mutation command, including `gh`, `git clone`, `git fetch`, `git pull`, `git remote`, `git commit`, `git push`, and `git tag`.

These controls separate model-driven editing from repository mutation, but they are not a microVM or a complete network sandbox. The NIM credential necessarily exists in the OpenCode process, and arbitrary local interpreters can be dangerous when granted shell access. The decisive safeguards are a trusted default-branch checkout, no GitHub credentials in the agent subprocess, one bounded working-tree output, full local verification, exact-head PR review, and branch protection. A future stronger isolation plane may replace this runner without changing the proposal/verification/packaging interfaces.

## Product task contract

OpenCode must select one buyer-visible gap that fits a single PR. It must preserve standalone Noema operation and modular MSA compatibility with `ContextualWisdomLab/.github`, `naruon`, `contextual-orchestrator`, and other CWL services.

The task requires:

- test-first development with an observed failing executable contract;
- realistic Noema traffic, operational, security, provenance, or buyer tests;
- adversarial and failure paths where applicable;
- 100% production statement, branch, and function coverage;
- 100% reviewer line/branch and docstring coverage when reviewer Python changes;
- beginner-readable public documentation and trust-boundary descriptions;
- current authoritative standards, official primary documentation, or peer-reviewed research;
- APA 7 references in `docs/doctoring`;
- `contextual-orchestrator` for new product-runtime LLM paths;
- descriptive two-word-or-longer `snake_case` database object names if a database boundary is introduced;
- `CHANGELOG.md` and affected product, architecture, security, operations, API, support, and buyer-document updates; and
- `PR_MESSAGE.md` containing the title, design, RED-to-GREEN evidence, full verification, sources, version decision, and residual risks.

The task forbids merge, publish, release, deploy, gate weakening, unrelated refactoring, and fabricated production, KPI, customer, paid-pilot, revenue, transfer, attestation, or acquisition evidence.

## Trusted verification and proposal limits

After OpenCode exits successfully, a separate step without GitHub credentials removes the generated OpenCode configuration and runs:

```bash
npm run release:verify
git diff --cached --check
```

The step rejects proposed symlinks and enforces both limits:

```text
maximum changed files: 40
maximum staged binary diff: 500,000 bytes
```

An empty working tree is a successful no-op. A nonempty tree that fails release verification, whitespace checks, symlink policy, file-count bounds, or byte bounds is not pushed.

`npm run release:verify` includes type checking, the complete Vitest suite with the repository's 100% production coverage thresholds, dependency security audit, KPI gate behavior, and acquisition manifest generation. The proposal remains untrusted until the subsequent PR loop has independently reviewed its exact head.

## Trusted packaging step

Only the packaging step receives the job's scoped `GITHUB_TOKEN`. It:

1. reads and deletes `PR_MESSAGE.md` when present;
2. stages the already verified tree and repeats `git diff --cached --check`;
3. creates `nim-agent/product-dev-${GITHUB_RUN_ID}`;
4. commits as `github-actions[bot]`;
5. pushes that one branch; and
6. calls `gh pr create` once against `main`.

It does not approve or merge the PR. `hourly-commercial-readiness` subsequently owns review inspection, repair, exact-head CI and Security Scan verification, current-head independent review, branch-governance audit, and SHA-bound squash merge.

## Expected operational outcomes

| Outcome | Result |
|---|---|
| Existing open PR | No checkout or model call. |
| Missing or unreadable PR inventory | Fail-closed no-op. |
| Missing NIM secret | Scheduled no-op; manual dry-run remains available. |
| Candidate succeeds with no diff | No branch or PR. |
| Candidate produces invalid or oversized diff | Run fails; no branch or PR. |
| All candidates fail | Run fails; no branch or PR. |
| Verified bounded diff | One PR is opened; governance continues asynchronously through normal Actions events and future hourly loops. |

## Residual races and recovery

The zero-open-PR gate is a point-in-time observation. A human or another automation can open a PR after the gate and before packaging. The packaging step must therefore revalidate the open-PR inventory and default-branch head before it pushes. If either changed, it must fail closed rather than publish a proposal based on stale assumptions. GitHub does not offer an atomic “create this PR only if no other PR exists” transaction, so exact-head governance remains the final safety boundary.

If a run fails after a remote branch was pushed but before PR creation, a rerun uses the same `GITHUB_RUN_ID` and should fail visibly rather than overwrite unreviewed remote state. A maintainer must inspect and delete the orphan branch before retrying.

## Rollback and disablement

To stop autonomous proposals immediately, disable **Hourly NVIDIA NIM Product Development** in the Actions UI. Removing or revoking `NVIDIA_NIM_API_KEY` also turns scheduled runs into fail-closed no-ops without affecting the existing Noema reviewer key system.

A code rollback removes `.github/workflows/hourly-product-development.yml` from `main`. This does not affect `/exchange`, central reviews, `hourly-commercial-readiness`, releases, deployments, or production traffic.

## Operator checklist

Before enabling scheduled model execution:

- confirm `NVIDIA_NIM_API_KEY` is scoped to the organization/repository policy intended for development;
- run a manual dry run and inspect the complete task contract;
- confirm branch protection and `hourly-commercial-readiness` remain active;
- confirm no reviewer credential name appears in the workflow;
- verify OpenCode version and SHA-256 against the reviewed release artifact;
- confirm repository Actions policy permits only full-SHA actions;
- confirm the first generated PR contains a valid RED-to-GREEN record and complete `npm run release:verify` evidence; and
- disable the scheduler if model/provider behavior, cost, or proposal quality becomes unacceptable.
