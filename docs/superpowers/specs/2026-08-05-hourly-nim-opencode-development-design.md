# Hourly NVIDIA NIM OpenCode Development Design

## Status

Implemented on PR #64 and updated after the runner-isolation security review. This specification supersedes the initial single-job and two-job packaging concepts. The authoritative design uses three ordered GitHub-hosted jobs so no runner that executes model-proposed code later receives publication credentials.

## Problem

Noema already has a deterministic commercial-readiness workflow that governs existing pull requests. When the queue is empty, beginning the next bounded commercial increment still depends on a person or an interactive agent. The new scheduler must safely create a reviewable proposal without combining model generation, untrusted execution, repository publication, independent review, or merge authority.

The principal trust-boundary risk is runner persistence. GitHub Actions steps in one job share a runner and filesystem. Removing credentials from one shell step does not prove that untrusted code cannot leave a resident process or modified runner state that observes credentials introduced later in the same job. Job separation, not environment cleanup alone, is therefore the security boundary.

## Goals

1. Start at most one bounded product-development proposal each hour and only when GitHub reports zero open pull requests.
2. Run checksum-pinned OpenCode with `NVIDIA_NIM_API_KEY`, explicit NVIDIA NIM fallback, and no reviewer-credential reuse.
3. Keep model execution unable to commit, push, create a pull request, approve, merge, release, or deploy.
4. Execute the proposal's complete release verification on a fresh runner that never receives publication credentials.
5. Reconstruct the exact verified proposal on a third fresh non-executing publisher before minting a least-privilege Maintainer App token.
6. Bind every cross-job handoff to exact artifact identity, workflow-run identity, archive digest, patch digest, base SHA, changed-file count, and byte count.
7. Preserve Noema standalone operation, modular MSA compatibility, exact-head review governance, and release restraint.

## Non-goals

- The workflow does not review, approve, merge, release, publish a release, deploy, or fabricate production or commercial evidence.
- It does not use GitHub Copilot, GitHub Models, the Noema reviewer App key, `NOEMA_LLM_API_KEY`, or production `contextual-orchestrator` reviewer credentials.
- It does not claim hostile-code microVM isolation or eliminate GitHub platform trust.
- It does not create a new repository or prematurely move the Noema-specific prompt into `ContextualWisdomLab/.github`.
- It has no user-facing visual flow; Figma and Product Design are not material to this increment.

## Control-plane separation

`.github/workflows/hourly-commercial-readiness.yml` remains authoritative for pull-request inventory, exact-head Checks, review evidence, unresolved threads, repository rules, and SHA-bound merge.

`.github/workflows/hourly-product-development.yml` is proposal-only. It schedules at minute 47, offset from the minute-17 governance loop, uses a non-cancelling repository concurrency group, and opens at most one pull request. A generated PR enters the normal review → repair → exact-head Checks → merge process.

## Three-runner architecture

### 1. `propose_product_increment`

This read-only job performs the queue gate, runs OpenCode, executes an initial complete release verification, and exports one bounded patch artifact.

Permissions are `contents: read` and `pull-requests: read`. Checkout uses `persist-credentials: false`. The OpenCode subprocess receives `NVIDIA_API_KEY` only and removes GitHub tokens, Actions OIDC variables, Actions artifact/cache runtime variables, and runner command-file variables.

A successful proposal is staged and serialized with:

```bash
git diff --cached --binary --full-index
```

The job rejects whitespace errors, symlink mode `120000`, gitlink mode `160000`, more than 40 changed files, or more than 500,000 patch bytes. It records the exact base SHA, patch SHA-256, changed-file count, and byte count.

The full-SHA-pinned upload action has `id: upload_proposal`. The job exports both:

- `artifact-id` — the immutable GitHub artifact object identity;
- `artifact-digest` — the upload action's SHA-256 archive digest.

The artifact name includes workflow run ID and attempt, retention is one day, compression is disabled for predictable handling, and overwrite is false.

### 2. `package_product_increment`

This fresh uncredentialed verifier depends on `propose_product_increment`. It has read-only repository, pull-request, and Actions permissions and receives neither the NIM credential nor Maintainer App credentials.

It downloads the proposal by exact `artifact-id`, queries the GitHub REST artifact object, and verifies:

- numeric artifact ID;
- deterministic artifact name;
- non-expired state;
- originating workflow-run ID;
- REST `sha256:` digest against the exported `artifact-digest`;
- patch SHA-256, byte count, file count, and exact base SHA;
- absence of symlink and gitlink modes.

After applying the patch, it installs dependencies without lifecycle scripts and runs `npm run release:verify` with GitHub, OIDC, Actions runtime/cache, and runner command-file channels removed and with an isolated temporary home. Verification must not mutate tracked or non-ignored untracked proposal files, and the post-verification staged patch digest and size must remain identical.

This job deliberately executes proposed code. It never contains `actions/create-github-app-token`, Maintainer App variables or secrets, `git push`, or `gh pr create`.

### 3. `publish_product_increment`

This third fresh runner depends on successful proposal and verification jobs. Its job-level `GITHUB_TOKEN` remains read-only. It receives no NIM credential and does not install dependencies or execute proposed tests, builds, package scripts, binaries, or shell commands.

Before applying the patch, it copies the trusted exact-base PR metadata parser into `RUNNER_TEMP`. It then downloads the same exact `artifact-id` and independently repeats artifact identity, workflow-run, `artifact-digest`, patch digest, base, file, byte, symlink, and gitlink checks.

The publisher applies the patch only as Git data. It parses `PR_MESSAGE.md` through the preserved trusted parser, removes the untrusted metadata source from the staged commit, and validates the resulting staged tree without executing proposed code.

Only after these non-executing checks does the full-SHA-pinned GitHub-maintained token action mint a short-lived repository-scoped Maintainer App token with metadata read, contents write, and pull-request write. Trusted shell steps then re-read the open-PR inventory and live `main` SHA, create a unique branch with hooks disabled, verify the remote branch is absent, push once, and call `gh pr create` once. An error trap removes an orphan branch if PR creation fails.

The third fresh publisher is the only write-capable runner, and publication authority appears only after the immutable proposal has been validated without executing it.

## Fail-closed queue and base policy

The proposal job does nothing when PR inventory is unreadable, an open PR exists, or the NIM secret is absent. Stable reasons are recorded for automation evidence.

The publisher repeats the queue and live default-branch checks immediately before remote mutation. A new PR, unreadable inventory, mismatched checkout, or advanced `main` fails before push. GitHub does not provide an atomic “create a PR only if none exists” transaction; the remaining narrow race is bounded by unique branches, branch protection, and exact-head governance rather than represented as eliminated.

## OpenCode and NVIDIA NIM boundary

The workflow downloads OpenCode 1.17.13 from the official release archive and verifies the reviewed SHA-256 before installation. The generated config enables only the NVIDIA NIM OpenAI-compatible provider, disables sharing, auto-update, MCP, LSP, external-directory access, subagents, interactive questions, web fetch, and web search, and denies common repository and network mutation commands.

Fallback order is:

1. `nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5`
2. `nvidia-nim/nvidia/nemotron-3-super-120b-a12b`
3. `nvidia-nim/deepseek-ai/deepseek-v4-pro`

Each candidate has a 900-second execution timeout and a separate 30-second forced-termination grace period. Candidate failure causes hard reset and ignored/untracked cleanup, followed by a dependency reinstall with its own 60-second timeout and 10-second kill grace. The fallback proceeds only after that reinstall succeeds. A failed or timed-out reinstall fails closed immediately, prevents every later candidate from running with an incomplete dependency tree, and creates no artifact, branch, or PR. The conservative proposer budget is `3 × (900 + 30 + 60 + 10) + 300 = 3,300 seconds`, matching the 55-minute job limit.

Command restrictions are defense in depth. The decisive repository-security properties are read-only job permissions, absent write credentials, non-persisted checkout credentials, immutable cross-job evidence, a credential-free verifier, and a non-executing publisher.

## Product-development contract

The model prompt requires one bounded buyer-visible increment, observed RED-to-GREEN evidence, realistic Noema-specific tests, 100% production statements, branches, functions, and lines, reviewer coverage/docstrings when reviewer Python changes, beginner-readable public documentation, APA 7 doctoring, modular compatibility with `ContextualWisdomLab/.github`, `naruon`, and `contextual-orchestrator`, descriptive two-word-or-longer `snake_case` database objects, `CHANGELOG.md`, and Semantic Versioning restraint.

It forbids merge, release, deployment, reviewer-key mutation, unrelated refactoring, weakened gates, and fabricated production KPI, customer, revenue, transfer, attestation, or acquisition evidence.

## Untrusted metadata contract

`PR_MESSAGE.md` is untrusted model output. The trusted base parser requires a regular non-symlink file, opens with `O_NOFOLLOW`, verifies inode stability, decodes strict UTF-8, rejects unsupported control and bidirectional characters, normalizes line endings, and enforces a 120-byte title and 20,000-byte body. Trusted outputs use owner-only permissions.

## Verification and evidence

Static tests prove the three job names and ordering, no credential action in the verifier, no release verification in the publisher, exact `artifact-id` and `artifact-digest` use, symlink/gitlink rejection at every boundary, token mint order, queue/base revalidation order, and alignment of this design and the implementation plan.

The complete PR head must pass `ci`, `reviewer-ci`, Security Scan, 100% production coverage, reviewer coverage/docstrings, dependency audit, independent exact-head approval, unresolved-thread checks, and repository rules. No predecessor-head or queued result is accepted.

## Modularity and extraction

The workflow remains locally owned because the prompt and evidence contract are Noema-specific. Its interfaces are intentionally extractable: repository identity, default branch, NIM secret mapping, model candidates, bounded prompt, patch evidence, Maintainer App identity, and governance handoff. A future central reusable workflow must be full-SHA pinned and preserve the same three-runner boundary; it must not make Noema dependent on central availability for standalone operation.

## Residual risk

The NIM credential necessarily exists in the model process, and repository content may be transmitted to NVIDIA NIM. Operators must assess confidentiality, retention, regional, and contractual requirements.

The verifier executes untrusted proposed code on an ephemeral GitHub-hosted runner with outbound network available under GitHub policy. The design limits the consequence by withholding publication, NIM, OIDC, artifact/cache runtime, and command-file credentials. It is not a hostile-code microVM.

The handoff trusts GitHub Actions artifact storage, artifact metadata, hosted runners, and pinned actions. Exact IDs, workflow-run binding, archive and patch digests, and independent reconstruction detect exposed mismatches but do not prove semantic correctness or eliminate platform compromise. Independent exact-head review and branch protection remain mandatory.
