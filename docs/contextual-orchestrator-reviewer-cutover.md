# Contextual-orchestrator LLM cutover

This runbook moves every trusted Noema LLM job — production review,
hourly product development, and the published naruon consumer contract —
from a direct external model endpoint to the organization
`contextual-orchestrator` gateway. naruon is a first-class consumer for
judgments and decisions; naruon wiring is a separate repository pull
request. The code change and the live organization configuration change
are intentionally separate: the latter creates or changes credentials and
requires an explicit operator approval.

The reusable contract is `contracts/orchestrator-gateway.json` and
`docs/orchestrator-gateway-consumer-contract.md`.

## Target contract

- `NOEMA_LLM_API_URL` is an HTTPS OpenAI-compatible base URL ending in `/v1`.
- `GET <gateway-root>/healthz` returns
  `{"status":"ok","service":"contextual-orchestrator",...}`.
- `NOEMA_LLM_MODEL` is normally the routing alias
  `contextual-orchestrator`.
- `NOEMA_LLM_API_KEY` is a dedicated inference-scoped gateway token.
- Upstream provider keys remain only in the orchestrator credential KV.
- Noema does not configure a direct external-provider fallback. Provider
  failover, allowlists, budgets, circuit breakers, and audit stay in the
  gateway.

Every Noema LLM workflow rejects known direct OpenAI, GitHub Models,
OpenRouter, NVIDIA NIM, and Bytez hosts even if they implement an
OpenAI-compatible API. Noema does not sequentially try the next model or
agent; the orchestrator selects min-cost / max-performance.

## Approval-bound activation

Do not put credentials in shell history, command arguments, issue comments,
workflow logs, or this repository.

1. Deploy a reviewed `contextual-orchestrator` revision with HTTPS, persistent
   state where required, an upstream-provider allowlist, and KV-resolved
   provider credentials.
2. Provision a dedicated inference token for Noema. Do not reuse an upstream
   provider key or an administrator token.
3. Verify, without a bearer token, that `/healthz` identifies
   `contextual-orchestrator`. Verify with the inference token that a bounded
   `/v1/chat/completions` request succeeds and an admin endpoint is denied.
4. After explicit approval, create the organization Actions secret
   `NOEMA_LLM_API_KEY` and set `NOEMA_LLM_API_URL` and `NOEMA_LLM_MODEL`.
5. Dispatch a canary review against a draft pull request at an exact current
   head SHA. Confirm the Noema App review, gateway audit event, chosen upstream,
   and cost/budget record all refer to the same request.
6. Dispatch a dry-run, then a live hourly product-development canary only when
   the pull-request queue is empty. Confirm the OpenCode session used the same
   gateway identity and did not iterate a model-candidate list.
7. Only after both canaries succeed, retire direct `OPENAI_API_KEY` and
   `NVIDIA_NIM_API_KEY` dependencies from Noema LLM jobs. Do not delete an
   organization secret until all unrelated consumers are inventoried. Those
   provider keys belong in the orchestrator credential KV.

## Rollback

If the gateway health or a canary job fails, leave the affected Noema LLM job
unavailable and restore the last reviewed gateway deployment or configuration.
Do not silently route review or product development directly to an external
provider; that would bypass the control plane this cutover is meant to
establish.
