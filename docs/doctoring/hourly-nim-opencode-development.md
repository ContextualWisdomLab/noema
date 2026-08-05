# Hourly NVIDIA NIM OpenCode development: evidence and trust boundaries

## Documentation standard

This doctoring note uses APA 7 reference form. It separates externally supported facts from Noema-specific engineering decisions and residual risks. The workflow adopts risk-reduction practices from the cited sources but does not claim certification, formal NIST SP 800-218 conformance, or proof that model-generated code is correct.

## Externally supported facts

### OpenCode automation and provider configuration

OpenCode documents `opencode run` as its non-interactive execution mode for scripts and automation. The CLI accepts a prompt, an agent, and a provider/model identifier. OpenCode also documents custom OpenAI-compatible providers, environment-variable interpolation for API keys, explicit model maps and context/output limits, granular tool permissions, and disabled session sharing. These capabilities support a repository-local configuration that calls NVIDIA NIM without using OpenCode's GitHub integration or a user credential store.

OpenCode documentation changes independently of this repository. Noema therefore pins the executable rather than downloading a mutable latest release. Version `1.17.13` and SHA-256 `157afa289d1a8d9372de0ce19ac726119b937a1f6b201808d46f06e4e59bb348` are an organization-reviewed reproducibility choice already used by active CWL repositories. The pin is not represented as the newest available OpenCode release. A version upgrade requires a new reviewed digest and compatibility evidence.

### NVIDIA NIM API compatibility

NVIDIA documents its LLM NIM inference surface as OpenAI-compatible. Current NIM documentation includes chat completions, text completions, responses, model listing, streaming, and tool calling where the selected model/runtime profile supports those features. That compatibility is the basis for OpenCode's `@ai-sdk/openai-compatible` provider configuration and the `/v1` endpoint.

The workflow calls NVIDIA's hosted integration endpoint because the user explicitly selected `NVIDIA_NIM_API_KEY` for scheduled development. This does not imply that every named model is continuously available, free, or behaviorally equivalent. The workflow treats model/provider failure as an expected operational condition, uses ordered fallback, discards partial work between candidates, and fails without a PR when every candidate fails.

### GitHub scheduled workflow semantics

GitHub documents that a `schedule` event runs from the default branch and only when the workflow file exists on the default branch. GitHub also warns that scheduled runs may be delayed during high load, especially near the beginning of an hour, and can be dropped under sufficiently high load. Scheduling at minute 47 reduces exposure to the top-of-hour load pattern, but “hourly” means recurring scheduling intent, not a wall-clock execution SLA.

GitHub recommends explicit least-privilege `GITHUB_TOKEN` permissions and full commit-SHA pinning for third-party actions. The Noema workflow declares repository permissions explicitly, pins checkout by full SHA, persists no checkout credential, excludes GitHub and Actions OIDC credentials from the OpenCode subprocess, and exposes the repository token only to the queue-gate and trusted packaging steps.

### Secure software development lifecycle evidence

NIST SP 800-218 defines a high-level Secure Software Development Framework intended to be integrated into software-development life cycles. It emphasizes practices that help reduce vulnerabilities, mitigate undetected defects, address root causes, and communicate software-supply-chain expectations between producers and purchasers. Noema's test-first contract, complete release verification, retained RED-to-GREEN evidence, dependency/security gates, and PR-only handoff apply those risk-reduction ideas. They do not establish certification or remove the need for human and independent-agent review.

## Noema-specific design decisions

### Separate proposal and merge control planes

The existing `hourly-commercial-readiness` workflow is deterministic governance: it inspects current-head checks, review state, rulesets, and mergeability before a SHA-bound merge. Adding a model call to that workflow would combine proposal generation with the control plane deciding whether to merge the proposal.

Noema therefore creates a separate `hourly-product-development.yml` proposal workflow. The model can edit and verify a working tree but cannot review, approve, merge, release, publish, or deploy it. A later pull-request event and subsequent hourly governance runs perform review and merge decisions against the exact generated head.

This boundary is a project design decision, not a behavior required by OpenCode, NVIDIA NIM, GitHub, or NIST.

### Zero-open-PR gate

The model is invoked only when the GitHub API returns zero open pull requests. This keeps one coherent product increment in flight and gives existing PRs priority. Unreadable inventory fails closed. The gate is checked before checkout and must be checked again before packaging because another actor can open a PR while the model is running.

GitHub does not provide an atomic transaction that means “create this pull request only if no other open pull request exists.” The remaining race is bounded by revalidation and exact-head merge governance rather than claimed to be eliminated.

### Dedicated development credential

The workflow maps `secrets.NVIDIA_NIM_API_KEY` to `NVIDIA_API_KEY` only in the OpenCode step. It does not use GitHub Copilot, GitHub Models, `NOEMA_LLM_API_KEY`, the Noema GitHub App private key, or the production `contextual-orchestrator` reviewer token.

Preserving reviewer credential names and routing is required because reviewer independence is a separate production trust boundary. Scheduled development may propose changes to `contextual-orchestrator` integration, but it cannot reuse or mutate the review credential path.

### Model fallback and contamination control

The selected candidate order balances capability and operational continuity. Each candidate receives a bounded session. After failure or timeout, `git reset --hard HEAD` and `git clean -fd` remove partial edits before the next candidate. This prevents a later candidate from inheriting an unreviewed, incomplete state from an earlier candidate.

Fallback improves availability; it is not a quality proof. Any successful candidate output remains untrusted until local release verification, PR review, exact-head Checks, Security Scan, independent review, and branch governance pass.

### Prompt-level product contract

The task prompt requires one buyer-visible gap, test-first implementation, realistic Noema-specific verification, 100% coverage/docstrings, APA 7 doctoring, modular MSA compatibility, descriptive database naming, changelog and affected documentation, and release restraint. These constraints translate repository policy into model-visible acceptance criteria.

Prompt text is not an enforcement mechanism by itself. Executable tests, workflow assertions, credential isolation, staged-diff checks, proposal bounds, branch protection, and exact-head governance provide the enforceable layers.

### Proposal bounds and trusted packaging

The uncredentialed verification step runs `npm run release:verify`, stages the proposed tree, rejects whitespace errors and symlinks, and caps the proposal at 40 changed files and 500,000 staged diff bytes. These are reviewability and abuse-control budgets, not claims about an ideal PR size for every project.

Only after the bounded proposal passes does a trusted step receive the scoped repository token. It creates one branch and one PR. The model does not receive that token and does not execute the GitHub mutation commands.

## Residual risks

### The NIM key is present in the agent process

OpenCode must authenticate to NVIDIA NIM, so `NVIDIA_API_KEY` exists in the OpenCode process environment. Child processes launched by OpenCode may inherit that environment. Denying common exfiltration commands and web tools raises the cost of accidental or straightforward disclosure, but a shell-capable model can construct alternate network clients or inspect process environment through other interpreters.

This workflow is therefore not equivalent to a microVM with egress policy or a credential-brokering sidecar. It relies on trusted default-branch source, a bounded task, a dedicated development-only key, no GitHub credentials, restricted tools, post-run verification, and PR governance. A future isolation layer should expose only a narrow inference proxy to the agent and keep the upstream NIM credential outside the agent process.

### Repository source and prompt leave GitHub

The prompt, source excerpts selected by OpenCode, and model messages are sent to NVIDIA NIM. The workflow must not be enabled for repositories whose policy prohibits that data transfer. Operators must evaluate organization confidentiality, data-processing, regional, retention, and contractual requirements before configuring the secret.

The workflow does not send production logs, customer evidence, revenue evidence, private GitHub tokens, reviewer secrets, or deployment credentials by design. A model can still read repository files available in the checkout, so sensitive material must never be committed to the repository.

### Tool permission is defense in depth

OpenCode permissions deny reviewed mutation and network commands, external directories, web tools, MCP, LSP, questions, and subagent delegation. Command policy cannot enumerate every semantically equivalent program. An allowed interpreter can implement behavior that resembles a denied command.

The security claim is therefore limited: OpenCode lacks GitHub credentials and its result is only a local proposal. The workflow does not claim that OpenCode is a fully isolated hostile-code sandbox.

### Model behavior and availability change

Hosted model identifiers, quotas, latency, tool-call behavior, and response quality can change independently of Noema. Candidate success is not a semantic quality guarantee. The workflow records only local executable verification and creates a reviewable PR; it never self-approves or self-merges.

### Scheduled execution can be delayed or disabled

GitHub can delay scheduled events, drop them under high load, or disable schedules in inactive public repositories. The workflow's product promise is safe recurring opportunity for development, not continuous autonomous availability. Manual dry-run and manual dispatch remain the operator recovery paths.

### Stale-base and concurrent-PR races

A long model session can finish after `main` advances or another PR opens. Trusted packaging must compare the originally checked-out head with live `main` and re-read the open PR inventory immediately before push. A mismatch aborts publication. A small race remains between revalidation and PR creation, and the exact-head governance loop is the final control.

### Generated PR metadata is untrusted

`PR_MESSAGE.md` is model-generated input. The packaging step must treat it as untrusted: require a regular non-symlink file, bound title and body lengths, remove control characters from the title, delete the file before commit, and use a safe fallback when absent or invalid. PR metadata cannot be allowed to inject terminal control sequences or unbounded API payloads.

## Verification mapping

| Risk or requirement | Executable control |
|---|---|
| Scheduled workflow overlaps merge governance | Minute-47 schedule, distinct concurrency group, static contract test |
| PR already open | GitHub inventory gate before model and packaging |
| Missing NIM secret | `nim_api_key_unavailable`, no checkout/model call |
| Mutable OpenCode artifact | Exact version, official archive, SHA-256 verification |
| Wrong provider or reviewer-key reuse | NIM-only config and negative secret-name assertions |
| Agent mutates GitHub | No GitHub token in agent env; mutation commands denied; trusted packaging only |
| Candidate contamination | Hard reset and clean after each failure |
| Unverified proposal | `npm run release:verify` before token-bearing packaging |
| Oversized or symlink proposal | File/byte budgets and mode `120000` rejection |
| Model merges/releases/deploys | No corresponding workflow command; prompt prohibition; exact-head governance handoff |
| Stale base | Live default-branch revalidation before push |
| Concurrent PR | Second inventory check before push |
| Malformed PR metadata | Regular-file, length, and control-character validation |
| Reviewer-key drift | Negative assertions for reviewer secrets and explicit runbook prohibition |

## APA 7 references

GitHub. (2026). *Events that trigger workflows*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

GitHub. (2026). *Protecting against security threats*. GitHub Docs. Retrieved August 5, 2026, from https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats

NVIDIA Corporation. (2026). *API reference—NVIDIA NIM for large language models*. NVIDIA Documentation. Retrieved August 5, 2026, from https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html

NVIDIA Corporation. (2026). *Tool calling and MCP integration*. NVIDIA Documentation. Retrieved August 5, 2026, from https://docs.nvidia.com/nim/large-language-models/2.0.2/advanced-use-cases/tool-calling-and-mcp.html

OpenCode. (2026). *CLI*. Retrieved August 5, 2026, from https://opencode.ai/docs/cli/

OpenCode. (2026). *Permissions*. Retrieved August 5, 2026, from https://opencode.ai/docs/permissions/

OpenCode. (2026). *Providers*. Retrieved August 5, 2026, from https://opencode.ai/docs/providers/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
