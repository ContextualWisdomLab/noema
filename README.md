# Noema

Noema is ContextualWisdomLab's GitHub App OIDC token-exchange service and
central-review runtime for an independent LLM pull-request reviewer.

It is one TypeScript Cloudflare Worker. A buyer or operator can deploy and run
that Worker alone. Naruon is not required.

## What it does

1. GitHub Actions requests a GitHub OIDC token with audience `cwl-noema-review`.
2. Noema verifies issuer, audience, organization owner, and the trusted central
   workflow identity.
3. Noema exchanges that OIDC token for a GitHub App installation token scoped to
   the target repository (`pull_requests: write`, `contents: read`,
   `checks: read`).
4. The central `ContextualWisdomLab/.github` workflow uses that token to post an
   LLM review under a GitHub App identity separate from the authoring agent.
5. This repository also owns the default-branch-only
   [`central-review`](./.github/workflows/central-review.yml) runtime. It accepts
   a `noema-review` `repository_dispatch` with `target_repository`, `pr_number`,
   and the exact `pr_head_sha`, then publishes an App-authored review.

Target repositories do not copy Noema. They opt into the central required
workflow. Untrusted analysis stays outside the Worker; see
[`docs/noema-agent-sandbox-plan.md`](./docs/noema-agent-sandbox-plan.md).

## Current status

- Package version `0.1.0`. Noema has not declared a production-ready release;
  security support is the current `main` line and any explicitly named release
  candidate. See [`SECURITY.md`](./SECURITY.md).
- Public Worker routes: `GET /health`, `GET`/`HEAD /ready`, `POST /exchange`.
- Independent deploy target: Cloudflare Workers Free tier, with Durable Object
  bindings for distributed rate limiting and OIDC replay protection.
- The LLM path is a `contextual-orchestrator` gateway contract
  (`NOEMA_LLM_*`), never a raw upstream provider key.

Commercial-readiness and acquisition audits exist as maintainer tooling. They
are not the product story. See [Maintainer procedure](#maintainer-procedure).

## Run independently

Naruon is the CWL composition hub that can receive other products. Optional
composition (for example a Naruon decision-agent path that calls orchestrator
or Noema) is not a defect. **Independent run does not require Naruon.**

You need:

- Node.js 22+ (CI and lockfile tooling use Node.js 24)
- A Cloudflare account that can deploy Workers and Durable Objects
- A GitHub App installed on the central workflow repository and on each target
  repository that should receive reviews

### GitHub App permissions

Repository permissions:

- Pull requests: Read and write
- Checks: Read-only
- Contents: Read-only

Install the app on `ContextualWisdomLab/.github` (or your equivalent central
workflow repository) and on the target repositories.

### Worker secrets and vars

```bash
npm install
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY_PEM
```

Optional, when you want a fixed installation instead of discovery by
repository:

```bash
wrangler secret put GITHUB_APP_INSTALLATION_ID
```

Public trust and cache knobs live in `wrangler.toml` `[vars]`:

- `ALLOWED_ISSUER` — GitHub Actions OIDC issuer
- `ALLOWED_AUDIENCE` — `cwl-noema-review`
- `ALLOWED_REPOSITORY_OWNER` — organization that may request tokens
- `ALLOWED_WORKFLOW_REPOSITORY` / `ALLOWED_WORKFLOW_REF_PREFIX` — exact central
  workflow file and ref (exact match, not a prefix)
- `GITHUB_API_BASE` — `https://api.github.com`
- `NOEMA_RATE_LIMIT_PER_MINUTE` — default `60`
- `NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS` — default `300`
- `NOEMA_INSTALLATION_CACHE_TTL_SECONDS` — default `600`

Add new runtime secrets with `wrangler secret put` and read them from the
Worker `env` binding. Do not introduce `process.env` / `os.getenv` secret reads
in `src/`.

### Deploy

```bash
npm install
npm run deploy
```

Point the central workflow at the deployed exchange URL:

- `NOEMA_EXCHANGE_URL` = `https://<your-worker>/exchange`

Local development: `npm run dev`. Contract checks: `npm test` and
`npm run typecheck`.

### Routes

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness only. The Worker request path is executing. |
| `GET` / `HEAD /ready` | Runtime readiness. Configuration, App key importability, and Durable Object bindings are usable. No GitHub or OIDC network call. `503` when exchange must not receive traffic. |
| `POST /exchange` | OIDC bearer in, scoped GitHub App installation token out. |

Every JSON response uses `{ ok: true, data, trace_id }` or
`{ ok: false, error_code, message, details, trace_id }`, plus `no-store` /
`nosniff`, `x-trace-id`, and `x-latency-ms`. `/exchange` challenges missing
auth with `401` and `WWW-Authenticate: Bearer`. Issued and inbound tokens must
never appear in logs.

Verify a deployed Worker:

```bash
NOEMA_EXCHANGE_URL=https://<your-worker>/exchange npm run smoke:check
```

That checks `/health`, `/ready`, and unauthenticated `/exchange` schema,
readiness, Bearer challenge, and security headers. Details:
[`docs/runtime-readiness.md`](./docs/runtime-readiness.md),
[`docs/api-spec.md`](./docs/api-spec.md),
[`docs/deployment-guide.md`](./docs/deployment-guide.md).

## How siblings call Noema

`ContextualWisdomLab/.github` owns the central `noema-review` workflow.
Target product repositories do not vendor this Worker or copy its secrets.

Typical call:

1. The central workflow requests `actions` OIDC with audience
   `cwl-noema-review`.
2. It `POST`s `NOEMA_EXCHANGE_URL` with
   `Authorization: Bearer <oidc-jwt>` and
   `{ "target_repository": "ContextualWisdomLab/<repo>" }`.
3. It uses the returned installation token only for the scoped review write.

Operators who own this repository can also dispatch the in-repo
`central-review` runtime. Bind the SHA from a fresh PR read, never from stale
local state:

```bash
gh api repos/ContextualWisdomLab/noema/dispatches -X POST --input - <<'JSON'
{"event_type":"noema-review","client_payload":{"target_repository":"ContextualWisdomLab/example","pr_number":1,"pr_head_sha":"0123456789abcdef0123456789abcdef01234567"}}
JSON
```

Onboarding for a new org or pilot:
[`docs/onboarding.md`](./docs/onboarding.md).

## How Noema calls contextual-orchestrator

The review runtime does not hold an OpenAI, GitHub Models, or other raw
provider key. It talks only to the organization gateway:

| Variable | Meaning |
| --- | --- |
| `NOEMA_LLM_API_URL` | HTTPS `contextual-orchestrator` base URL ending in `/v1` |
| `NOEMA_LLM_MODEL` | Gateway routing alias, normally `contextual-orchestrator` |
| `NOEMA_LLM_API_KEY` | Dedicated gateway inference token |

Before sending a review manifest, `central-review` rejects known
direct-provider URLs and checks the unauthenticated `/healthz` service
identity (`service: contextual-orchestrator`). Upstream failover, allowlists,
and budgets stay in the gateway.

The code change and the live org-variable/secret cutover are separate. Follow
[`docs/contextual-orchestrator-reviewer-cutover.md`](./docs/contextual-orchestrator-reviewer-cutover.md).
Do not reuse `OPENAI_API_KEY` as Noema's gateway token.

## MSA: 따로 또 같이

Noema is a standalone microservice.

- **Alone:** deploy the Worker, set App secrets, point one trusted workflow at
  `/exchange`, and use `/health` plus `/ready` before sending traffic. That is
  a complete independent run.
- **Together:** siblings call the published `/exchange` contract. The central
  `.github` workflow is the supported caller. `contextual-orchestrator` is the
  supported LLM gateway for the review runtime. Naruon may compose Noema later;
  that optional path is not required to operate Noema.

Do not add a Naruon runtime dependency to `src/` or to Worker startup.

## Operator docs

- [API spec](./docs/api-spec.md) and [stability contract](./docs/api-stability-contract.md)
- [Onboarding](./docs/onboarding.md)
- [Runbook](./docs/runbook.md)
- [Deployment](./docs/deployment-guide.md)
- [Runtime readiness](./docs/runtime-readiness.md)
- [Distributed rate limiting](./docs/distributed-rate-limiting.md)
- [Threat model](./docs/threat-model.md)
- [Observability KPI](./docs/observability-kpi.md)

## Maintainer procedure

Exact-head CI, SHA-bound merge authority, PR stacking, writer boundaries,
hourly commercial-readiness, `hourly-product-development`, and the
saleability / KRW 2,000,000,000 acquisition audits are maintainer procedure.
They live in [`CONTRIBUTING.md`](./CONTRIBUTING.md) and `docs/`. They are not
the buyer product story.
