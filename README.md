# Noema

Noema is a ContextualWisdomLab leaf product: a GitHub App credential broker
and an independent LLM pull-request reviewer. It runs on its own, and a host
calls it through a published HTTP API and a secret-free LLM gateway contract.
That hub-and-leaf call is the supported MSA path — **따로 또 같이** — not a
reason to merge repositories.

It deploys as a [Cloudflare Worker](https://developers.cloudflare.com/workers/)
(Free tier) with two jobs:

1. **Token exchange.** GitHub Actions presents an
   [OIDC](https://docs.github.com/en/actions/reference/security/oidc) JWT
   (audience `cwl-noema-review`). Noema verifies issuer, audience, organization
   owner, and the exact trusted central workflow identity, then returns a
   repository-scoped GitHub App installation token
   (`pull_requests: write`, `contents: read`, `checks: read`).
2. **Review.** The default-branch
   [`central-review`](./.github/workflows/central-review.yml) runtime accepts a
   `noema-review` dispatch and publishes an App-authored verdict. Untrusted
   analysis stays in a separate sandbox; see
   [`docs/noema-agent-sandbox-plan.md`](./docs/noema-agent-sandbox-plan.md).

Every Noema LLM job — production review, hourly-product-development, and
host-side judgments — calls `ContextualWisdomLab/contextual-orchestrator`.
Upstream provider keys stay in the orchestrator credential KV. Noema does not
walk a sequential model list or fall back to a direct provider.

OIDC, Worker binding, and Durable Object trust rules are recorded in
[Architecture doctoring](./docs/doctoring/architecture-trust-boundaries.md)
and the [ADR index](./docs/adr/README.md). Do not treat those records as a new
paper list.

## Composition hubs

Leaf products stay independently deployable. Composition hubs call them as
published dependencies. Do not fold Noema into a hub repo.

| Hub | Role | How it calls Noema |
| --- | --- | --- |
| [`naruon`](https://github.com/ContextualWisdomLab/naruon) | Judgments and decisions | First-class consumer of the published orchestrator gateway contract. Naruon wiring is a separate repository pull request. |
| [`gyeot` (곁)](https://github.com/ContextualWisdomLab/gyeot) | On-device wellness composition hub | Call Noema through the HTTP API and/or the same published contract when a host needs token exchange or the LLM gateway. |

The machine-readable LLM contract is
[`contracts/orchestrator-gateway.json`](./contracts/orchestrator-gateway.json).
Narrative: [Orchestrator gateway consumer contract](./docs/orchestrator-gateway-consumer-contract.md).
Print it with `node scripts/verify-orchestrator-gateway.mjs --print-contract`.

Host LLM settings (never an upstream provider key):

| Name | Meaning |
| --- | --- |
| `NOEMA_LLM_API_URL` | HTTPS OpenAI-compatible base ending in `/v1` |
| `NOEMA_LLM_MODEL` | Routing alias, normally `contextual-orchestrator` |
| `NOEMA_LLM_API_KEY` | Dedicated gateway inference token |

`GET <gateway-root>/healthz` must return
`{"status":"ok","service":"contextual-orchestrator"}`. Known direct-provider
hosts are rejected. Leftover `NOEMA_FALLBACK_*` settings fail closed.

## Run it alone

Requires Node.js 22+ (CI uses Node 24). This package is private; there is no
published npm library. The Worker and the HTTP contract are the product.

```bash
npm install
npm test
npm run typecheck
npm run dev
```

`npm run dev` starts a local Worker. Provision secrets on the Worker binding
(the KV-equivalent), not `process.env` in `src/`:

```bash
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY_PEM
# optional: pin a single installation instead of discovering by repository
wrangler secret put GITHUB_APP_INSTALLATION_ID
```

Deploy:

```bash
npm run deploy
```

Set `NOEMA_EXCHANGE_URL` in `ContextualWisdomLab/.github` (or the customer
central workflow) to the deployed `/exchange` URL. Production cutover that
creates organization variables or secrets is a separate operator step; see
[contextual-orchestrator reviewer cutover](./docs/contextual-orchestrator-reviewer-cutover.md).
Do not reuse `OPENAI_API_KEY` as Noema's gateway token.

## How a host calls it

The public HTTP surface is documented in [`openapi.json`](./openapi.json)
([OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.1.html)) and
[API 명세](./docs/api-spec.md). Every JSON response is
`{ ok: true, data, trace_id }` or
`{ ok: false, error_code, message, details, trace_id }`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness only. Does not prove credential-exchange readiness. |
| `GET` / `HEAD` | `/ready` | Unauthenticated runtime readiness. Incomplete config returns `503 ERR_SERVICE_NOT_READY` without reflecting secrets. |
| `POST` | `/exchange` | Exchange a GitHub Actions OIDC bearer for a short-lived installation token. |

Example liveness check:

```bash
curl -sS "$NOEMA_BASE_URL/health"
```

Example exchange (OIDC bearer from GitHub Actions; JSON body optional, max
8,192 UTF-8 bytes):

```bash
curl -sS -X POST "$NOEMA_EXCHANGE_URL" \
  -H "authorization: Bearer $ACTIONS_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"target_repository":"ContextualWisdomLab/example"}'
```

`target_repository` must be a string `owner/name` in the allowed organization.
`/exchange` accepts only `POST` (`Allow: POST` on 405), returns Bearer
challenges on 401 (`invalid_request` vs `invalid_token`), and includes
`Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`,
`X-Trace-Id`, and `X-Latency-Ms`. Issued and inbound tokens must not appear in
logs.

A host that only needs the LLM gateway copies
`contracts/orchestrator-gateway.json` (or calls
`node scripts/verify-orchestrator-gateway.mjs --print-contract`) and uses the
same `NOEMA_LLM_*` settings. Do not copy Noema's OIDC broker, GitHub App
identities, or sandbox/runner isolation into the host.

The Python reviewer package (`reviewer/`) is the judgement plane. It consumes a
bounded PR manifest and can publish a `ReviewVerdict`. See
[`reviewer/README.md`](./reviewer/README.md).

After deploy, confirm the HTTP contract:

```bash
NOEMA_EXCHANGE_URL=https://.../exchange npm run smoke:check
```

`npm run smoke:check` checks `/health`, `/ready`, and `/exchange` schema,
trace/latency headers, runtime readiness, the unauthenticated 401 Bearer
challenge, and no-store/nosniff headers.

## Required GitHub App permissions

Repository permissions:

- Pull requests: Read and write
- Checks: Read-only
- Contents: Read-only

Install the app on `ContextualWisdomLab/.github` and on target repositories
that use the central required workflow.

## Operator configuration

Public Worker vars (defaults in `wrangler.toml`):

| Variable | Default | Role |
| --- | --- | --- |
| `ALLOWED_ISSUER` | `https://token.actions.githubusercontent.com` | GitHub Actions OIDC issuer |
| `ALLOWED_AUDIENCE` | `cwl-noema-review` | OIDC audience |
| `ALLOWED_REPOSITORY_OWNER` | `ContextualWisdomLab` | Allowed org |
| `ALLOWED_WORKFLOW_REPOSITORY` | `ContextualWisdomLab/.github` | Trusted workflow repo |
| `ALLOWED_WORKFLOW_REF_PREFIX` | `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main` | Exact trusted workflow ref (name kept; matching is exact, not prefix) |
| `GITHUB_API_BASE` | `https://api.github.com` | GitHub Cloud API origin |
| `GITHUB_APP_SLUG` | `noema` | GitHub App slug |
| `NOEMA_RATE_LIMIT_PER_MINUTE` | `60` | `/exchange` fixed-window budget |
| `NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS` | `300` | OIDC JWKS cache |
| `NOEMA_INSTALLATION_CACHE_TTL_SECONDS` | `600` | Installation-id cache |

`/exchange` first applies a SQLite-backed Durable Object fixed-window limit
across Worker isolates, then keeps the isolate-local limiter as defense in
depth. Missing or malformed distributed decisions fail closed; see
[Distributed rate limiting](./docs/distributed-rate-limiting.md).
OIDC `jti` values are consumed once by a Durable Object replay guard; see
[OIDC replay protection](./docs/oidc-replay-protection.md).

## Operator documentation

- [온보딩 가이드](./docs/onboarding.md)
- [운영 Runbook](./docs/runbook.md)
- [API 명세](./docs/api-spec.md)
- [안정성 계약](./docs/api-stability-contract.md)
- [OpenAPI](./openapi.json)
- [보안/위협 모델](./docs/threat-model.md)
- [배포 가이드](./docs/deployment-guide.md)
- [SLA/지원 정책](./docs/sla-and-support.md)
- [Runtime readiness](./docs/runtime-readiness.md)
- [Distributed Rate Limiting](./docs/distributed-rate-limiting.md)
- [Orchestrator gateway consumer contract](./docs/orchestrator-gateway-consumer-contract.md)

Maintainers and coding agents: start at
[`docs/internal/README.md`](./docs/internal/README.md)
(contributor and agent procedure:
[`docs/development/contributor-and-agent-procedure.md`](./docs/development/contributor-and-agent-procedure.md)).
