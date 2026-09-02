# Orchestrator Routing Alias Pin (`orchestrator/free`) Doctoring

## Scope

This note records the reviewed basis for changing the canonical `NOEMA_LLM_MODEL` routing alias
from the bare `contextual-orchestrator` value to `orchestrator/free`. It applies to
`scripts/lib/orchestrator-gateway.mjs` (`DEFAULT_ROUTING_ALIAS`, `resolveOrchestratorModel`,
`orchestratorGatewayConsumerContract`), the regenerated `contracts/orchestrator-gateway.json`, and
every documentation surface that states the canonical alias value or describes orchestrator routing
behavior, per the pattern already established in `docs/doctoring/hourly-nim-opencode-development.md`
and `docs/doctoring/hourly-product-development-prerequisites.md`.

## Problem statement

`ContextualWisdomLab/contextual-orchestrator`'s `TaskOrchestrator` (`contextual_orchestrator/orchestrator.py`)
defines three virtual routing aliases:

```python
GATEWAY_DEFAULT_MODEL = "contextual-orchestrator"
AUTO_MODEL = "orchestrator/auto"
FREE_MODEL = "orchestrator/free"
```

Only a request whose `model` equals `FREE_MODEL` is restricted to the free/ZDR agent pool
(`free_only=True` in `_ranked_agents`; `judge_agent_ids` scoped to `free_ids`). A request using the
bare `GATEWAY_DEFAULT_MODEL` alias — the value Noema's own preflight hard-enforced — is treated the
same as `AUTO_MODEL`: the full agent pool, including paid providers, is eligible.

Noema's `scripts/lib/orchestrator-gateway.mjs` hard-enforced `NOEMA_LLM_MODEL` to equal the bare
`contextual-orchestrator` alias (`resolveOrchestratorModel` rejected any other value), and this
preflight runs before every trusted Noema/naruon LLM call: PR review (`central-review.yml`), hourly
product development (`hourly-product-development.yml`), and naruon judgments and decisions (a
first-class consumer of the same published contract). As a result every one of those LLM calls could
reach paid upstream providers instead of being restricted to the free/ZDR pool, even though Noema
never holds provider keys itself and describes its routing goal in terms of a gateway-selected
pool. `ContextualWisdomLab/.github`'s `opencode.jsonc` (the central OpenCode review pipeline config)
already pinned `"model": "contextual-orchestrator/orchestrator/free"` — i.e., OpenCode provider id
`contextual-orchestrator`, model id `orchestrator/free` — so this change brings Noema's own
`NOEMA_LLM_MODEL` enforcement and its `buildOpenCodeOrchestratorConfig()` output into the same
already-correct pattern.

## Decision

`DEFAULT_ROUTING_ALIAS` becomes `orchestrator/free`. `resolveOrchestratorModel` now hard-rejects any
value other than `orchestrator/free`, including the previous bare `contextual-orchestrator` alias, so
a stale caller fails closed instead of silently reaching the paid-inclusive pool. The regenerated
`contracts/orchestrator-gateway.json` publishes `routing_alias: "orchestrator/free"` for naruon and
any future consumer to import unchanged. `buildOpenCodeOrchestratorConfig()`'s
`${OPENCODE_PROVIDER_ID}/${model}` composition now naturally produces
`contextual-orchestrator/orchestrator/free`, matching `.github`'s `opencode.jsonc`.

The OpenCode provider id `contextual-orchestrator`, the gateway's `/healthz` service identity
`contextual-orchestrator`, and the repository/service name `contextual-orchestrator` are unrelated
concepts and are unchanged by this decision — only the routing-alias *value* carried in
`NOEMA_LLM_MODEL` changes.

## Operational boundary

This is a code and documentation change only. The live GitHub Actions variable `NOEMA_LLM_MODEL`
(`vars.NOEMA_LLM_MODEL` in `central-review.yml` and `hourly-product-development.yml`) is organization
configuration, not something a source change can set. Until an org/repo administrator updates that
variable from `contextual-orchestrator` to `orchestrator/free`, the hardened preflight in
`verify-orchestrator-gateway.mjs` fails closed on the old value by design — the whole point of the
change is that the old value is no longer accepted — so review and hourly-product-development jobs
will fail starting at the first run after this change merges, until that operational variable update
is coordinated.

## Test contract

`test/orchestrator-gateway-contract.test.ts`, `test/orchestrator-gateway-routing-alias.test.ts`, and
`test/orchestrator-gateway-secret-source.test.ts` assert `defaultOrchestratorModel()`,
`resolveOrchestratorModel()`, the OpenCode config composition, and the published
`contracts/orchestrator-gateway.json` all resolve to `orchestrator/free`, and that
`resolveOrchestratorModel("contextual-orchestrator")` now throws
`/NOEMA_LLM_MODEL must equal orchestrator\/free/` instead of succeeding.

## Related

ContextualWisdomLab. (2026). *`contextual_orchestrator/orchestrator.py`: `TaskOrchestrator`
`GATEWAY_DEFAULT_MODEL`, `AUTO_MODEL`, `FREE_MODEL` routing* [Source code].
`ContextualWisdomLab/contextual-orchestrator`.

ContextualWisdomLab. (2026). *`opencode.jsonc`: `contextual-orchestrator/orchestrator/free` pin*
[Configuration]. `ContextualWisdomLab/.github`.
