# Hourly NVIDIA NIM OpenCode Development Design

## Status

Approved for autonomous implementation by the maintainer instruction that Noema must continue commercial-quality development hourly, use OpenCode Agent with `NVIDIA_NIM_API_KEY` rather than GitHub Copilot for GitHub Actions development scheduling, preserve the existing review-agent credential boundary, and keep the PR queue governed to zero.

## Problem

Noema already has a deterministic hourly commercial-readiness workflow that inspects, reviews, and merges existing pull requests. When no pull request is open, however, product development still depends on a human or an external interactive agent starting the next bounded increment. A buyer evaluating operational maturity would notice that the repository can enforce a merge decision but cannot safely generate the next commercial improvement from its own default branch.

The new development scheduler must not weaken or replace the deterministic merge loop. It must not use GitHub Copilot, the Noema reviewer key, `contextual-orchestrator` reviewer credentials, or an unscoped user token. It must use a dedicated OpenCode session authenticated only with the organization `NVIDIA_NIM_API_KEY` secret and leave all merge decisions to the existing exact-head governance loop.

## Goals

1. Start at most one bounded Noema product-development session each hour, only when the repository has no open pull request.
2. Run OpenCode non-interactively against NVIDIA NIM with explicit model fallback and a checksum-pinned CLI.
3. Keep the coding agent unable to commit, push, create a pull request, merge, release, deploy, or access GitHub credentials.
4. Let a trusted packaging step create exactly one branch, commit, and pull request from the agent's reviewed working tree.
5. Preserve the existing reviewer agents and their credential names unchanged.
6. Require TDD, realistic product-specific tests, 100% production coverage and documentation gates, APA 7th doctoring, modular MSA boundaries, and `CHANGELOG.md` updates in the generated increment.
7. Do nothing rather than overlap with an existing PR, run without the NIM secret, publish an empty diff, or continue after every model candidate fails.
8. Provide a manual dry-run that records the gate and full task contract without sending source or prompts to a model.

## Non-goals

- The workflow does not merge pull requests. The existing hourly commercial-readiness loop and branch protection retain that responsibility.
- The workflow does not publish packages, releases, deployments, attestations, or production evidence.
- The workflow does not fabricate 30-day KPI, paid-pilot, revenue, customer, transfer, or acquisition evidence.
- The workflow does not replace Noema's production reviewer path through `contextual-orchestrator` or rename its secrets.
- The workflow does not introduce a user interface; Figma and Product Design are not applicable to this governance-only increment.
- The workflow does not centralize itself into `ContextualWisdomLab/.github` before the Noema prompt and package contract have demonstrated stable reuse. Its boundaries are designed for later extraction as a reusable workflow.

## Alternatives considered

### A. Separate hourly OpenCode development workflow — selected

A new workflow runs at minute 47, offset from the deterministic readiness loop at minute 17. It checks the PR queue, runs one credential-isolated OpenCode session, and packages a single PR. This keeps AI proposal generation separate from deterministic merge governance, provides a clear credential boundary, and follows the proven organization pattern in DiagramWeave and ThreadWeave.

### B. Add OpenCode to the existing hourly commercial-readiness workflow

This reduces workflow count but combines deterministic governance, repository write authority, and model-generated code in one control plane. Failures become harder to diagnose, permissions become broader, and an agent can accidentally influence the same run that decides whether to merge. Rejected because it violates separation of duties.

### C. External Cloudflare scheduled agent

A Worker, Workflow, or Durable Object could schedule development outside GitHub Actions. This could improve runtime isolation but requires a separate GitHub App, artifact transfer, scheduler state, deployment, monitoring, and acquisition evidence before it produces value. Rejected for this bounded increment because GitHub Actions already provides default-branch scheduling, repository context, permissions, and PR packaging.

## Architecture

### Existing deterministic loop remains authoritative

`.github/workflows/hourly-commercial-readiness.yml` remains unchanged. It continues to inspect and merge existing PRs. The new `.github/workflows/hourly-product-development.yml` is proposal-only and schedules at `47 * * * *`, preventing normal overlap with the deterministic minute-17 loop.

### Single-flight gate

Before checkout or model invocation, the workflow uses the GitHub CLI with a step-scoped `GITHUB_TOKEN` to query one open pull request. It fails closed to a no-op when inventory cannot be read, an open PR exists, or `NVIDIA_NIM_API_KEY` is absent. A workflow-level concurrency group permits only one Noema development run at a time and does not cancel an active run.

### Credential-separated execution

The repository job has only `contents: write` and `pull-requests: write` because the final packaging step must create a branch and PR. The token is not persisted by checkout and is passed only to the queue gate and packaging steps. The OpenCode step receives only `NVIDIA_API_KEY`, mapped exactly from `secrets.NVIDIA_NIM_API_KEY`. It explicitly removes GitHub, repository, and Actions OIDC token variables before invoking OpenCode.

The existing reviewer secrets and variables, including `NOEMA_LLM_API_KEY`, remain absent from the workflow.

### Pinned OpenCode runtime

The workflow downloads OpenCode `1.17.13` from the official release archive and verifies the organization-reviewed SHA-256 digest before installation. `opencode run` provides non-interactive execution. A generated, untracked `opencode.json` defines only the `nvidia-nim` provider at the NVIDIA OpenAI-compatible endpoint, disables sharing, disables MCP and LSP, and references the API key through `{env:NVIDIA_API_KEY}`.

The ordered model candidates are:

1. `nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5`
2. `nvidia-nim/nvidia/nemotron-3-super-120b-a12b`
3. `nvidia-nim/deepseek-ai/deepseek-v4-pro`

Each candidate receives a bounded 40-minute session. A failed candidate causes the working tree to reset and clean before the next candidate, preventing partial output from contaminating fallback. If every candidate fails, the workflow fails without creating a branch.

### Agent permission contract

OpenCode may read, search, edit, and run local verification within the checkout. Its configuration denies external-directory access, task delegation, web fetch/search, session sharing, `gh`, GitHub mutation commands, `git commit`, `git push`, `git tag`, and remote mutation. The prompt separately forbids merge, release, deployment, evidence fabrication, gate weakening, unrelated refactors, and more than one bounded increment.

The tool permission layer is defense in depth. The decisive controls are the absence of GitHub credentials in the agent subprocess, non-persisted checkout credentials, a clean default-branch checkout, and a separate trusted packaging step.

### Product-development prompt

The prompt requires the agent to inspect Noema's architecture, trust boundaries, operations, buyer evidence, issues, recent merged PRs, tests, and release state. It selects the single highest-impact buyer-visible gap that fits one PR. The increment must remain standalone and modular for integration with `ContextualWisdomLab/.github`, `naruon`, and other services.

The prompt requires:

- test-first development with an observed failing executable contract;
- realistic Noema-specific behavior and adversarial tests;
- 100% statements, branches, functions, and lines for production TypeScript;
- 100% reviewer line/branch and docstring coverage where reviewer code changes;
- beginner-readable public documentation and docstrings;
- APA 7th doctoring from current primary standards, official documentation, or peer-reviewed work;
- descriptive two-word-or-longer `snake_case` database identifiers if a database boundary is introduced;
- `contextual-orchestrator` for any new product-runtime LLM path, while keeping this development scheduler's NIM credential independent from reviewer credentials;
- `CHANGELOG.md` and affected operational/security/product documentation updates;
- no package version change unless the integrated repository is genuinely release-ready;
- one root `PR_MESSAGE.md` describing title, verification, sources, and residual risk.

### Trusted packaging step

After OpenCode exits successfully, the workflow removes generated configuration, confirms a nonempty diff, reads and deletes `PR_MESSAGE.md`, creates a unique `nim-agent/product-dev-<run-id>` branch, commits all remaining changes, pushes with the step-scoped repository token, and opens one PR against `main`. It does not mark the PR merged or approved. If the working tree is empty, it records a no-op.

## Error handling

- PR inventory API failure: record `pull_request_inventory_unavailable`, do not invoke the model.
- Existing open PR: record `open_pull_request`, do not invoke the model.
- Missing NIM secret: record `nim_api_key_unavailable`, do not invoke the model.
- OpenCode download checksum mismatch: fail before model execution.
- Candidate timeout or failure: reset and clean the worktree, then try the next candidate.
- Every candidate fails: fail without branch or PR creation.
- Empty working tree: successful no-op without PR creation.
- Missing `PR_MESSAGE.md`: use a bounded generic title/body while retaining the diff for review.
- Branch push or PR creation failure: fail visibly; do not retry a second branch in the same run.

## Testing

Static workflow contract tests will prove:

- hourly schedule at minute 47 plus manual dry-run;
- non-cancelling single-flight concurrency;
- exact repository and open-PR gate;
- NIM secret mapping with no Copilot or reviewer-secret reference;
- checksum-pinned OpenCode version and official archive;
- provider base URL, environment-key reference, sharing disabled, MCP/LSP disabled, and three NIM candidates;
- no persisted checkout credentials;
- removal of GitHub and OIDC credentials from the agent process;
- explicit denial of git/gh mutation and external-directory permissions;
- clean reset between candidate failures;
- one unique branch and one PR against `main`;
- no merge, release, or deployment command;
- prompt requirements for TDD, realistic tests, 100% coverage/docstrings, APA 7th doctoring, MSA boundaries, contextual-orchestrator, database naming, `CHANGELOG.md`, and release restraint;
- documentation and changelog traceability.

The complete `npm run release:verify` gate must pass on the PR head.

## Modularity and extraction boundary

The local workflow owns only Noema-specific prompt text and validation. Its scheduling, credential isolation, model fallback, and packaging contract deliberately match other CWL repositories. Once two or more active repositories share an identical input/output contract and security policy, the generic shell logic can move to a pinned reusable workflow in `ContextualWisdomLab/.github`, while each repository supplies a versioned product prompt. Until then, local ownership keeps Noema independently operable and avoids a premature cross-repository coupling.

## Research and standards basis

OpenCode's current documentation defines `opencode run` for non-interactive execution, custom OpenAI-compatible providers with environment-bound API keys, granular tool permissions, and `share: "disabled"`. GitHub Actions security guidance supports least-privilege tokens, non-persisted credentials, and full-SHA action pinning. NIST SP 800-218 supports integrating automated verification and recorded evidence into the secure development lifecycle. The workflow also follows the repository's already reviewed organization precedent for OpenCode `1.17.13`, NVIDIA NIM provider configuration, fallback cleanup, and PR-only packaging.

The implementation doctoring document will record these sources in APA 7th format and distinguish source-supported controls from project-specific design decisions.
