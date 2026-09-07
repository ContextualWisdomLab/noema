# Orchestrator Routing Alias Pin (`orchestrator/free`) Doctoring

## Scope

This note records the reviewed basis for changing Noema's canonical `NOEMA_LLM_MODEL` routing alias from the bare service-name value `contextual-orchestrator` to `orchestrator/free`. It applies to the shared gateway contract, the Noema preflight, reviewer configuration, OpenCode configuration, and documentation that describes routing authority.

## Problem statement

`ContextualWisdomLab/contextual-orchestrator` defines `contextual-orchestrator`, `orchestrator/auto`, and `orchestrator/free` as distinct virtual model names. Only `orchestrator/free` constrains orchestration to the free/ZDR agent pool. The historical Noema contract required the bare `contextual-orchestrator` value, which therefore allowed the full agent pool, including paid providers, even though Noema itself does not own provider selection or provider credentials.

The central `.github` OpenCode configuration already used `contextual-orchestrator/orchestrator/free`, so the product defect was Noema's stale consumer contract rather than a need to duplicate provider-routing logic locally.

## Decision

The canonical contract value is `orchestrator/free`. `scripts/lib/orchestrator-gateway.mjs` remains strict: its public routing resolver accepts only the canonical free-pool alias and rejects arbitrary aliases, direct-provider model names, and sequential candidates.

For rollout compatibility, the process/configuration anti-corruption boundaries accept exactly one historical value, the bare service-name string `contextual-orchestrator`, and immediately canonicalize it to `orchestrator/free` before any credential-bearing model call or generated OpenCode configuration can use it. This compatibility rule exists in `scripts/verify-orchestrator-gateway.mjs` and `reviewer/noema_reviewer/config.py`. It does not accept `orchestrator/auto`, arbitrary aliases, direct-provider models, or candidate lists.

The OpenCode provider id `contextual-orchestrator`, the `/healthz` service identity `contextual-orchestrator`, and the repository/service name remain unchanged. Only the model/routing alias carried to the orchestrator becomes `orchestrator/free`.

## OpenCode capability boundary

OpenCode's current primary permission documentation defines `read`, `edit`, `glob`, `grep`, `list`, `bash`, `task`, `external_directory`, `todowrite`, `webfetch`, `websearch`, `lsp`, `skill`, `question`, and `doom_loop` as separately governable authorities; `edit` covers `write`, `edit`, and `apply_patch`. The same contract supports a global `*` rule with more-specific overrides. A generated configuration that sets `"*": "allow"` therefore grants ambient authority to newly introduced built-in, custom, or MCP capabilities unless every new capability happens to be denied later.

Noema now uses a fail-closed capability baseline: `"*": "deny"`, with only worktree `read`, `edit`, `glob`, `grep`, and `list` explicitly allowed for autonomous product-development edits. Shell execution, subagents, questions, network search/fetch, external-directory access, skills, LSP, and todo tooling remain denied. Adding another OpenCode or MCP capability requires a deliberate Noema Tool/Capability Boundary change plus a regression test; provider routing remains contextual-orchestrator authority.

This change is narrower than removing file-edit authority. The autonomous writer still needs repository-local source inspection and mutation, while GitHub workflow steps outside the model tool surface remain responsible for deterministic tests, checks, publication, and merge governance.

## Operational boundary

No administrator-side variable migration is required for a safe merge. Existing review environments that still transport `NOEMA_LLM_MODEL=contextual-orchestrator` are canonicalized to `orchestrator/free` before use. The hourly product-development workflow already source-pins `orchestrator/free` and therefore does not require a model variable.

Changing an Actions/KV value to `orchestrator/auto`, a direct-provider model, or any other unreviewed alias still fails closed. The compatibility path cannot silently widen the provider pool.

Noema also removes downstream retry/timeout policy from the reviewer model client: `AsyncOpenAI(timeout=None, max_retries=0)` delegates inference lifecycle and provider failover to contextual-orchestrator. GitHub workflow/job liveness remains a separate Noema/platform operational concern and must not be confused with model-routing authority.

## Test contract

The TypeScript gateway tests prove that the shared library publishes and accepts only `orchestrator/free`, that the CLI maps only the historical service-name setting to that alias, and that arbitrary aliases fail before network access. Python reviewer tests independently prove the same transport canonicalization, reject `orchestrator/auto` and unreviewed aliases, and prove that legacy timeout/retry inputs cannot become reviewer compute policy.

`test/opencode-tool-capability-boundary.test.ts` separately requires deny-by-default OpenCode authority plus the explicit repository-local analysis/edit allowlist. This regression prevents a future OpenCode/custom/MCP tool from acquiring ambient authority merely because it was added to the runtime.

Temporary self-modifying source-repair workflows are not part of this decision and must not be retained in the PR or release surface.

## Related

ContextualWisdomLab. (2026). *`contextual_orchestrator/orchestrator.py`: `TaskOrchestrator` routing aliases* [Source code]. `ContextualWisdomLab/contextual-orchestrator`.

ContextualWisdomLab. (2026). *`opencode.jsonc`: `contextual-orchestrator/orchestrator/free` pin* [Configuration]. `ContextualWisdomLab/.github`.

OpenCode. (2026). *Permissions* [Documentation]. https://opencode.ai/docs/permissions

OpenCode. (2026). *Tools* [Documentation]. https://opencode.ai/docs/tools
