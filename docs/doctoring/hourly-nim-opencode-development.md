# Hourly NVIDIA NIM OpenCode development: evidence and trust boundaries

## Documentation standard

This doctoring note uses APA 7 reference form. It separates externally supported facts from Noema-specific engineering decisions, assumptions, and residual risks. The workflow applies risk-reduction practices from the cited sources but does not claim certification, formal NIST SP 800-218 conformance, or proof that model-generated code is correct.

## Source-supported facts

### OpenCode

OpenCode documents `opencode run` as non-interactive execution for automation. Its configuration supports custom OpenAI-compatible providers, environment-bound API keys, explicit model maps and limits, granular tool permissions, and disabled session sharing. These capabilities support a repository-local NVIDIA NIM provider without GitHub Copilot or the OpenCode GitHub integration.

Noema pins OpenCode 1.17.13 and the reviewed Linux x64 archive digest rather than following a mutable latest release. The pin is an organization reproducibility decision already used by CWL repositories; it is not represented as the newest available release. Any upgrade requires a newly reviewed exact version, official artifact, digest, compatibility test, and changelog entry.

### NVIDIA NIM

NVIDIA documents NIM large-language-model inference through OpenAI-compatible API surfaces. Chat completions, responses, streaming, and tool calling depend on the selected model and deployment profile. The workflow therefore treats each hosted model as a fallible candidate rather than a guaranteed capability. A candidate timeout or provider error triggers clean fallback; every candidate failure produces no PR.

### GitHub Actions and GitHub App tokens

GitHub documents that scheduled workflows run from the default branch and may be delayed or dropped under high load. Minute 47 reduces exposure to top-of-hour contention but is not an execution SLA. GitHub recommends explicit least-privilege `GITHUB_TOKEN` permissions and full-SHA action pinning. GitHub also documents that most events produced through a repository `GITHUB_TOKEN` do not start new workflow runs, preventing accidental recursion.

The official `actions/create-github-app-token` action creates a short-lived installation access token and supports explicit repository and permission restriction. Noema therefore keeps both jobs' repository `GITHUB_TOKEN` read-only and mints a dedicated Maintainer App token only after the proposal has passed independent fresh-runner verification. This removes job-level write permission from the workflow token and preserves ordinary PR-triggered Checks for the generated branch and pull request.

### Secure development lifecycle

NIST SP 800-218 describes a high-level Secure Software Development Framework for reducing vulnerabilities, mitigating undetected defects, addressing root causes, and communicating supply-chain expectations. Noema's test-first contract, complete verification, retained RED-to-GREEN evidence, dependency/security gates, and review-only handoff implement those risk-reduction ideas without claiming certification.

## Noema-specific decisions

### Proposal and merge are separate control planes

`hourly-commercial-readiness` is deterministic governance. It evaluates current-head checks, review state, rulesets, and mergeability. Mixing a model call into the same workflow would combine proposal generation with the control plane deciding whether to merge it.

`hourly-product-development.yml` is therefore proposal-only. The model may edit and verify a local tree, but cannot approve, merge, release, publish, or deploy. The resulting PR must pass the existing independent exact-head governance loop.

### Read-only model job and fresh write-capable runner

The model runs in `propose_product_increment`, which has only repository and pull-request read permissions. Its subprocess receives `NVIDIA_API_KEY` but removes GitHub tokens, Actions OIDC credentials, artifact/cache runtime tokens, and runner command-file paths. OpenCode command permissions deny common network and repository-mutation tools.

The successful working tree becomes a binary full-index `proposal.patch` bound to its exact base SHA, SHA-256, file count, and byte count. The artifact expires after one day.

A separate `package_product_increment` fresh write-capable runner receives no NIM credential. Its repository `GITHUB_TOKEN` is still read-only. It checks out the exact base, verifies and applies the digest-bound patch, reruns `npm run release:verify` in an isolated home without GitHub or runner command-file credentials, and verifies that tests did not mutate the proposal.

Only after verification and bounded metadata parsing does the full-SHA-pinned GitHub-maintained token action mint the dedicated Maintainer App token. The token is restricted to `ContextualWisdomLab/noema` and to metadata read, contents write, and pull-request write. No model-controlled or proposal-controlled code runs after token minting; trusted shell steps alone revalidate the queue and base, push one unique branch, and open one PR.

This two-job boundary ensures no write-capable repository token co-resides with the model process and no write-capable token exists while proposed executable code is being verified. It is stronger than same-job environment cleanup because runner-level credentials and command channels cannot persist from model execution into packaging.

### Zero-open-PR gate

The model is invoked only when GitHub returns zero open pull requests. Unreadable inventory fails closed. The packaging job repeats the inventory and default-branch checks immediately before remote mutation because another actor can open a PR or advance `main` while the model runs.

GitHub provides no atomic “create a PR only if none exists” transaction. The remaining race is bounded by revalidation, unique branch names, branch protection, and exact-head governance rather than claimed to be eliminated.

### Dedicated development and publication credentials

The workflow maps `secrets.NVIDIA_NIM_API_KEY` to `NVIDIA_API_KEY` only in the model step. It does not use GitHub Copilot, GitHub Models, `NOEMA_LLM_API_KEY`, the reviewer App private key, or production `contextual-orchestrator` reviewer credentials. Reviewer credential names and routing remain unchanged.

Publication reuses the repository's existing dedicated Maintainer App variables and private-key secret. It does not repurpose the reviewer App identity or key contract. The separation preserves independent review evidence and gives generated PRs a normal event path into `ci`, `reviewer-ci`, and Security Scan.

### Clean model fallback

Each model candidate has a bounded timeout. Failure triggers hard reset, ignored/untracked cleanup, and dependency reinstall before the next candidate. Partial output from one model cannot contaminate fallback input. Fallback improves availability; it is not quality evidence.

### Executable product contract

The prompt requires one buyer-visible increment, test-first RED-to-GREEN evidence, realistic Noema-specific tests, 100% production coverage, 100% reviewer coverage/docstrings when touched, APA 7 doctoring, modular MSA compatibility, descriptive database naming, changelog/documentation updates, and Semantic Versioning restraint. Prompt instructions are not treated as enforcement by themselves; static workflow tests, proposal budgets, fresh-runner verification, branch protection, and exact-head review provide executable controls.

### Bounded proposal and metadata

The proposal is limited to 40 changed files and 500,000 patch bytes. Symlinks, whitespace errors, malformed patches, digest mismatches, and post-verification mutations fail closed.

`PR_MESSAGE.md` is untrusted model output. A base-branch parser copied before patch application requires a regular non-symlink file, `O_NOFOLLOW`, stable inode, strict UTF-8, safe control characters, a 120-byte title, and a 20,000-byte body. Trusted output files use owner-only permissions and the source metadata file is excluded from the commit.

## Residual risks

### NIM credential exposure within the model process

The NIM key necessarily exists in the OpenCode process. Command denials are defense in depth, not a microVM egress boundary. A shell-capable process may construct behavior equivalent to a denied command. The security claim is deliberately narrower: the key is development-only, GitHub write credentials are absent, model output crosses jobs only as a bounded digest-bound patch, and a fresh runner independently verifies it before publication authority exists.

A future stronger design should broker inference through a narrow proxy and keep the upstream NIM credential outside the model process.

### Repository data processing

OpenCode can send prompts and selected repository context to NVIDIA NIM. Operators must evaluate confidentiality, retention, regional, contractual, and data-processing requirements before enabling the secret. Production logs, customer evidence, reviewer secrets, deployment credentials, and revenue evidence are not intentionally provided, but committed repository content is readable.

### Untrusted executable verification

`npm run release:verify` executes proposed code. The fresh write-capable runner therefore runs verification before minting the Maintainer App token and without GitHub, OIDC, Actions runtime, cache, or runner command-file credentials; disables install lifecycle scripts; uses an isolated home; rejects post-test file mutation; and rechecks the patch digest. This limits repository compromise but is not equivalent to a hostile-code microVM.

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
| Artifact substitution | Exact base, SHA-256, file count, byte count, one-day artifact |
| Unverified proposal | Complete release verification in both jobs |
| Verification mutation | Unstaged/untracked check and post-verification digest match |
| Write token during untrusted execution | Maintainer App token minted only after verification and metadata parsing |
| Overbroad workflow token | Both job-level `GITHUB_TOKEN` permission sets remain read-only |
| Generated PR lacks Checks | Dedicated App token, not repository `GITHUB_TOKEN`, authors publication |
| Oversized or symlink proposal | File/byte budget and mode `120000` rejection |
| Malformed PR metadata | Trusted strict parser and byte/control-character limits |
| Stale base or new PR | Live revalidation before push |
| Hooks, orphan branch, or collision | Hooks disabled, unique-branch absence check, and cleanup trap |
| Unauthorized merge/release/deploy | No corresponding workflow command; governance handoff |

## APA 7 references

GitHub. (2026). *Events that trigger workflows*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

GitHub. (2026). *Protecting against security threats*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats

GitHub. (2026). *Use GITHUB_TOKEN for authentication in workflows*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/tutorials/authenticate-with-github_token

GitHub. (2026). *Create GitHub App token*. GitHub Marketplace. Retrieved August 5, 2026, from https://github.com/actions/create-github-app-token

NVIDIA Corporation. (2026). *API reference—NVIDIA NIM for large language models*. NVIDIA Documentation. Retrieved August 5, 2026, from https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html

NVIDIA Corporation. (2026). *Tool calling and MCP integration*. NVIDIA Documentation. Retrieved August 5, 2026, from https://docs.nvidia.com/nim/large-language-models/2.0.2/advanced-use-cases/tool-calling-and-mcp.html

OpenCode. (2026). *CLI*. Retrieved August 5, 2026, from https://opencode.ai/docs/cli/

OpenCode. (2026). *Permissions*. Retrieved August 5, 2026, from https://opencode.ai/docs/permissions/

OpenCode. (2026). *Providers*. Retrieved August 5, 2026, from https://opencode.ai/docs/providers/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
