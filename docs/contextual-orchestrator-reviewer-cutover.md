# Contextual-orchestrator reviewer cutover

This runbook moves the trusted Noema production reviewer from a direct external
model endpoint to the organization `contextual-orchestrator` gateway. The code
change and the live organization configuration change are intentionally
separate: the latter creates or changes credentials and requires an explicit
operator approval.

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

The central workflow rejects known direct OpenAI, GitHub Models, and OpenRouter
hosts even if they implement an OpenAI-compatible API.

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
6. Only after the canary succeeds, retire the old direct `OPENAI_API_KEY`
   dependency from the Noema review path. Do not delete an organization secret
   until all unrelated consumers are inventoried.

## Rollback

If the gateway health or canary review fails, leave the Noema review unavailable
and restore the last reviewed gateway deployment or configuration. Do not
silently route the production reviewer directly to an external provider; that
would bypass the control plane this cutover is meant to establish.
