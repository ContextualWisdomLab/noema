# Orchestrator gateway consumer contract

This is the reusable Noema-side LLM contract. Every first-class consumer —
Noema GitHub review, Noema hourly product development, and
`ContextualWisdomLab/naruon` judgments and decisions — must call
`ContextualWisdomLab/contextual-orchestrator` through the same interface.

naruon wiring is a **separate repository pull request**. This document does
not implement naruon. It publishes the contract naruon must import or copy.

The machine-readable copy is [`contracts/orchestrator-gateway.json`](../contracts/orchestrator-gateway.json).
Print it without secrets:

```bash
node scripts/verify-orchestrator-gateway.mjs --print-contract
```

Reusable validation lives in `scripts/lib/orchestrator-gateway.mjs`
(`parseOrchestratorGatewayUrl`, `resolveOrchestratorModel`,
`requireOrchestratorApiKey`, `verifyOrchestratorHealthz`,
`orchestratorGatewayConsumerContract`). The OpenCode config writer in the
same module is Noema-only. Do not clone an OpenCode sidecar into naruon.

## Required settings

| Name | Meaning |
| --- | --- |
| `NOEMA_LLM_API_URL` | HTTPS OpenAI-compatible base ending in `/v1`. No userinfo, query, or fragment. |
| `NOEMA_LLM_MODEL` | One routing alias. Production default is `contextual-orchestrator`. |
| `NOEMA_LLM_API_KEY` | Dedicated gateway inference token. Never an upstream provider key. |

`GET <gateway-root>/healthz` is unauthenticated and must return
`{"status":"ok","service":"contextual-orchestrator"}`.

At request time, secrets come from a KV / credential registry (the Worker
`Env` binding in Noema; naruon must use its own KV-equivalent). Process
environment is transport into that registry only.

## Forbidden

- Sequential model or agent candidate lists inside the consumer
- Direct provider hosts: `api.openai.com`, `models.github.ai`,
  `openrouter.ai`, `integrate.api.nvidia.com`, `api.nvidia.com`,
  `api.bytez.com`
- Provider keys in the consumer runtime or repository:
  `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_SUB`, `BYTEZ_API_KEY`,
  `OPENROUTER_API_KEY`, `OPENAI_API_KEY`
- `COPILOT_GITHUB_TOKEN`

The orchestrator selects min-cost / max-performance. Provider failover,
allowlists, budgets, circuit breakers, and audit stay in the gateway.

## First-class consumers

| Consumer | Repository | Role | Wiring |
| --- | --- | --- | --- |
| `noema-review` | `ContextualWisdomLab/noema` | GitHub review | this repository |
| `noema-hourly-product-development` | `ContextualWisdomLab/noema` | Product development | this repository |
| `naruon-judgments` | `ContextualWisdomLab/naruon` | Judgments and decisions | separate repository PR |

naruon is a first-class consumer, not an afterthought. A naruon agent
program that judges or decides must use this contract. It must not hold
provider keys or walk a sequential model list.

Noema's OIDC token broker, GitHub App identities, and sandbox/runner
boundaries stay in this repository. naruon must keep its own identity and
sandbox boundaries; this contract covers only the LLM gateway.
