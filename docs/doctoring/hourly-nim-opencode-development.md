# Hourly NVIDIA NIM OpenCode development: evidence and trust boundaries

## Documentation standard

This doctoring note uses APA 7 reference form. It separates externally supported facts from Noema-specific engineering decisions, assumptions, and residual risks. The workflow applies risk-reduction practices from the cited sources but does not claim certification, formal NIST SP 800-218 conformance, or proof that model-generated code is correct.

## Source-supported facts

### OpenCode

OpenCode documents `opencode run` as non-interactive execution for automation. Its configuration supports custom OpenAI-compatible providers, environment-bound API keys, explicit model maps and limits, granular tool permissions, and disabled session sharing. These capabilities support a repository-local NVIDIA NIM provider without GitHub Copilot or the OpenCode GitHub integration.

Noema pins OpenCode 1.17.13 and the reviewed Linux x64 archive digest rather than following a mutable latest release. The pin is an organization reproducibility decision already used by CWL repositories; it is not represented as the newest available release. Any upgrade requires a newly reviewed exact version, official artifact, digest, compatibility test, and changelog entry.

### NVIDIA NIM

NVIDIA documents NIM large-language-model inference through OpenAI-compatible API surfaces. Chat completions, responses, streaming, and tool calling depend on the selected model and deployment profile. The workflow therefore treats each hosted model as a fallible candidate rather than a guaranteed capability. A candidate timeout or provider error triggers clean fallback; every candidate failure produces no PR.

### GitHub Actions runner lifetime

GitHub documents a job as a set of steps executed on the same runner. Every step has access to that runner's workspace and filesystem, and files created in one step remain available to subsequent steps in the job. GitHub-hosted jobs, by contrast, run in fresh runner instances. These facts make a job—not a shell step or environment block—the relevant isolation boundary for untrusted execution.

GitHub also documents that a compromised runner can attempt to access secrets or the job token when those credentials are made available. Removing environment variables after untrusted code has executed cannot prove that the runner has no resident process, modified executable, shell initialization, workspace hook, or other persistence mechanism. Consequently, credentials must not be introduced later on a runner that executed a model-proposed package or test command.

### GitHub Actions artifacts

GitHub workflow artifacts are designed to transfer files between jobs. The official `actions/upload-artifact` documentation states that v4 artifacts are immutable and exposes `artifact-id` and SHA-256 `artifact-digest` outputs. GitHub's REST artifact object reports the artifact ID, name, expiry state, `sha256:` digest, and originating workflow-run identity.

Noema uses those fields as handoff evidence. Exact artifact ID prevents a name-only lookup from selecting a different object; the upload output and REST digest are compared; and workflow-run identity prevents accepting an artifact from another run. Patch SHA-256, file count, byte count, base commit, and Git mode checks remain separate evidence because archive identity alone does not establish the intended Git diff.

### GitHub App tokens and workflow permissions

GitHub recommends explicit least-privilege `GITHUB_TOKEN` permissions and full-SHA action pinning. The official `actions/create-github-app-token` action creates a short-lived installation access token and supports explicit repository and permission restriction. Noema keeps all three jobs' repository `GITHUB_TOKEN` read-only and mints the dedicated Maintainer App token only in a fresh publisher that never executes proposed code.

GitHub documents that most events produced through a repository `GITHUB_TOKEN` do not start new workflow runs. Publishing through the repository-scoped Maintainer App instead preserves the normal pull-request event path into independent Checks.

### Secure development lifecycle

NIST SP 800-218 describes a high-level Secure Software Development Framework for reducing vulnerabilities, mitigating undetected defects, addressing root causes, and communicating supply-chain expectations. Noema's test-first contract, complete verification, retained RED-to-GREEN evidence, dependency/security gates, credential separation, and review-only handoff implement those risk-reduction ideas without claiming certification.

## Noema-specific decisions

### Proposal and merge are separate control planes

`hourly-commercial-readiness` is deterministic governance. It evaluates current-head checks, review state, rulesets, and mergeability. Mixing a model call into the same workflow that decides whether to merge would combine proposal generation with the control plane evaluating its own output.

`hourly-product-development.yml` is therefore proposal-only. The model may edit and verify a local tree, but cannot approve, merge, release, publish a release, or deploy. The resulting PR must pass the existing independent exact-head governance loop.

### Three-job runner isolation

The workflow uses three ordered GitHub-hosted jobs:

1. `propose_product_increment` runs OpenCode and initial verification without repository write credentials.
2. `package_product_increment` reconstructs and executes the proposal on a fresh uncredentialed verifier.
3. `publish_product_increment` reconstructs the same proposal without executing it and only then mints publication credentials on a third fresh runner.

The original two-job design executed `npm run release:verify` and later minted the Maintainer App token in the same second job. That design removed credentials during the test step but did not establish runner-level isolation. A malicious or compromised proposal could have left a resident process or modified runner state before the later secret-bearing action. CI run `30969603538` retained the RED contract requiring a third runner; the implementation removes the credential action and all remote mutation from the verifier job.

### Read-only model job

The model runs in `propose_product_increment`, which has only repository and pull-request read permissions. Its subprocess receives `NVIDIA_API_KEY` but removes GitHub tokens, Actions OIDC credentials, artifact/cache runtime tokens, and runner command-file paths. OpenCode command permissions deny common network and repository-mutation tools.

The successful working tree becomes a binary full-index `proposal.patch` bound to its exact base SHA, SHA-256, changed-file count, and byte count. Symlink mode `120000` and gitlink mode `160000` are rejected before artifact upload. The artifact expires after one day, cannot be overwritten under the same name, and exports exact ID and archive digest outputs.

### Fresh uncredentialed verifier

`package_product_increment` runs on a fresh runner and receives no NIM or Maintainer credential. Its job-level token is read-only. It downloads the artifact by exact ID and verifies the artifact REST object's ID, deterministic name, expiry state, originating workflow run, and digest. It separately verifies patch SHA-256, byte count, changed-file count, exact base, and forbidden Git modes.

The verifier then applies the patch and executes `npm run release:verify` with GitHub, OIDC, Actions runtime/cache, and runner command-file credentials removed, dependency lifecycle scripts disabled, and an isolated temporary home. It fails if verification mutates tracked or non-ignored untracked files or changes the staged patch digest.

This job deliberately executes untrusted proposed code, but no publication credential is ever introduced to its runner.

### Fresh non-executing publisher

`publish_product_increment` depends on successful proposal and verification jobs. It starts on a third fresh runner with a read-only job token and no NIM credential. It does not install dependencies or run proposed tests, builds, package scripts, binaries, or shell commands.

Before applying the proposal, the publisher copies the trusted base-branch metadata parser into `RUNNER_TEMP`. It downloads the exact same artifact ID and repeats artifact/run/digest and patch/base/file/byte/mode validation. It applies the patch only as data, then uses the preserved parser to transform bounded `PR_MESSAGE.md` input.

Only after those non-executing operations does the full-SHA-pinned GitHub-maintained action mint a short-lived Maintainer App token restricted to `ContextualWisdomLab/noema` with metadata read, contents write, and pull-request write. Trusted shell steps revalidate the zero-PR queue and exact live `main`, create one unique branch, commit with hooks disabled, push once, and open one PR.

This three-job boundary provides the intended claim: neither model execution nor proposed-code verification shares a runner with publication authority.

### Zero-open-PR gate

The model is invoked only when GitHub returns zero open pull requests. Unreadable inventory fails closed. The publisher repeats the inventory and default-branch checks immediately before remote mutation because another actor can open a PR or advance `main` while the model and verifier run.

GitHub provides no atomic “create a PR only if none exists” transaction. The remaining race is bounded by revalidation, unique branch names, branch protection, and exact-head governance rather than claimed to be eliminated.

### Dedicated development and publication credentials

The workflow maps `secrets.NVIDIA_NIM_API_KEY` to `NVIDIA_API_KEY` only in the model step. It does not use GitHub Copilot, GitHub Models, `NOEMA_LLM_API_KEY`, the reviewer App private key, or production `contextual-orchestrator` reviewer credentials. Reviewer credential names and routing remain unchanged.

Publication reuses the repository's existing dedicated Maintainer App variables and private-key secret. It does not repurpose the reviewer App identity or key contract. The separation preserves independent review evidence and gives generated PRs a normal event path into `ci`, `reviewer-ci`, and Security Scan.

### Clean model fallback

Each model candidate has a bounded timeout. Failure triggers hard reset, ignored/untracked cleanup, and dependency reinstall before the next candidate. Partial output from one model cannot contaminate fallback input. Fallback improves availability; it is not quality evidence.

### Executable product contract

The prompt requires one buyer-visible increment, test-first RED-to-GREEN evidence, realistic Noema-specific tests, 100% production coverage, 100% reviewer coverage/docstrings when touched, APA 7 doctoring, modular MSA compatibility, descriptive database naming, changelog/documentation updates, and Semantic Versioning restraint. Prompt instructions are not treated as enforcement by themselves; static workflow tests, proposal budgets, fresh-runner verification, branch protection, and exact-head review provide executable controls.

### Bounded proposal and metadata

The proposal is limited to 40 changed files and 500,000 patch bytes. Symlinks, gitlinks, whitespace errors, malformed patches, artifact identity or digest mismatches, patch digest mismatches, and post-verification mutations fail closed.

`PR_MESSAGE.md` is untrusted model output. A base-branch parser copied before patch application requires a regular non-symlink file, `O_NOFOLLOW`, stable inode, strict UTF-8, safe control characters, a 120-byte title, and a 20,000-byte body. Trusted output files use owner-only permissions and the source metadata file is excluded from the commit.

## Residual risks

### NIM credential exposure within the model process

The NIM key necessarily exists in the OpenCode process. Command denials are defense in depth, not a microVM egress boundary. A shell-capable process may construct behavior equivalent to a denied command. The security claim is deliberately narrower: the key is development-only, GitHub write credentials are absent, and model output crosses jobs only as a bounded immutable artifact.

A future stronger design should broker inference through a narrow proxy and keep the upstream NIM credential outside the model process.

### Repository data processing

OpenCode can send prompts and selected repository context to NVIDIA NIM. Operators must evaluate confidentiality, retention, regional, contractual, and data-processing requirements before enabling the secret. Production logs, customer evidence, reviewer secrets, deployment credentials, and revenue evidence are not intentionally provided, but committed repository content is readable.

### Untrusted executable verification

`npm run release:verify` executes proposed code. The verifier therefore has no Maintainer App secret, App token, NIM secret, GitHub write token, OIDC credential, Actions runtime/cache credential, or runner command-file channel. A fresh publisher starts only after the verifier completes successfully. This is materially stronger than same-job environment cleanup, but the verifier is still not a hostile-code microVM and can affect only its own ephemeral runner and outbound network accessible under GitHub-hosted runner policy.

### Artifact service trust

The handoff relies on GitHub Actions artifact storage and API metadata. ID, workflow-run, digest, patch digest, and exact-base validation detect substitution or mismatch within the exposed contract; they do not eliminate compromise of GitHub's platform or prove proposal semantics. Independent PR review and exact-head Checks remain mandatory.

### Publication credential scope and rotation

The Maintainer App token is short-lived and repository-scoped, but the App registration and stored private key remain privileged operational assets. Operators must maintain least-privilege App installation scope, rotate compromised keys, audit App ownership, and keep break-glass responsibilities independent from reviewer credentials. Failure to mint the token safely stops publication; it must not trigger fallback to a broader PAT or job-level write `GITHUB_TOKEN`.

### Model and scheduler instability

Hosted model availability, quotas, latency, tool behavior, and quality can change. GitHub schedules can be delayed, dropped, or disabled. Candidate success and workflow completion are not semantic quality guarantees. The system safely produces either no PR or one reviewable PR; it never self-approves or self-merges.

## Verification mapping

| Requirement or risk | Executable control |
|---|---|
| Existing PR | Read-only inventory gate before model and repeated gate before push |
| Missing NIM key | `nim_api_key_unavailable`, no model call |
| Mutable OpenCode binary | Exact version, official archive, SHA-256 verification |
| Reviewer-key reuse | Negative workflow assertions and dedicated secret mapping |
| Model repository mutation | Read-only job; no GitHub write token; mutation commands denied |
| Runner command-channel poisoning | Command-file and Actions runtime variables removed |
| Candidate contamination | Hard reset, `git clean -fdx`, clean reinstall |
| Artifact substitution | Exact artifact ID, name, workflow-run ID, archive digest, patch digest, exact base, file count, and byte count |
| Unverified proposal | Complete release verification in model job and fresh verifier |
| Verification mutation | Unstaged/untracked check and post-verification digest match |
| Write token during untrusted execution | Verifier contains no Maintainer credentials; publisher is a third fresh runner |
| Proposed-code persistence | Publisher never executes proposed code before or after token minting |
| Overbroad workflow token | All job-level `GITHUB_TOKEN` permission sets remain read-only |
| Generated PR lacks Checks | Dedicated App token, not repository `GITHUB_TOKEN`, authors publication |
| Oversized, symlink, or gitlink proposal | File/byte budget and modes `120000`/`160000` rejection at all three boundaries |
| Malformed PR metadata | Trusted strict parser and byte/control-character limits |
| Stale base or new PR | Live revalidation before push |
| Hooks, orphan branch, or collision | Hooks disabled, unique-branch absence check, and cleanup trap |
| Unauthorized merge/release/deploy | No corresponding workflow command; governance handoff |

## APA 7 references

GitHub. (2026). *Compromised runners*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/concepts/security/compromised-runners

GitHub. (2026). *Events that trigger workflows*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

GitHub. (2026). *REST API endpoints for GitHub Actions artifacts*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/rest/actions/artifacts?apiVersion=2026-03-10

GitHub. (2026). *Secure use reference*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/reference/security/secure-use

GitHub. (2026). *Understanding GitHub Actions*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/get-started/understand-github-actions

GitHub. (2026). *Use GITHUB_TOKEN for authentication in workflows*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/tutorials/authenticate-with-github_token

GitHub. (2026). *Workflow syntax for GitHub Actions*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

GitHub. (2026). *Create GitHub App token*. GitHub Marketplace. Retrieved August 5, 2026, from https://github.com/actions/create-github-app-token

GitHub. (2026). *Upload GitHub Actions artifacts*. GitHub. Retrieved August 5, 2026, from https://github.com/actions/upload-artifact

NVIDIA Corporation. (2026). *API reference—NVIDIA NIM for large language models*. NVIDIA Documentation. Retrieved August 5, 2026, from https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html

NVIDIA Corporation. (2026). *Tool calling and MCP integration*. NVIDIA Documentation. Retrieved August 5, 2026, from https://docs.nvidia.com/nim/large-language-models/2.0.2/advanced-use-cases/tool-calling-and-mcp.html

OpenCode. (2026). *CLI*. Retrieved August 5, 2026, from https://opencode.ai/docs/cli/

OpenCode. (2026). *Permissions*. Retrieved August 5, 2026, from https://opencode.ai/docs/permissions/

OpenCode. (2026). *Providers*. Retrieved August 5, 2026, from https://opencode.ai/docs/providers/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
