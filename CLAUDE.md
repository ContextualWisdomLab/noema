# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read `AGENTS.md` first.** It is the canonical cross-agent operating guide for this repo and its guardrails are binding: the central Security Scan PR gate (`trivy-fs` findings are real — remediate by bumping vulnerable npm deps, never weaken the gate), and the config/secrets rule (secrets reach `src/` only through the typed `Env` binding provisioned with `wrangler secret put` — never introduce `process.env` / `os.getenv` secret reads in `src/`). This file complements AGENTS.md with commands and architecture; when in doubt, AGENTS.md wins.

## What noema is

Noema is ContextualWisdomLab's multi-purpose GitHub App bot. The Cloudflare Worker (Free tier) remains the OIDC token broker: GitHub Actions presents a GitHub OIDC token (audience `cwl-noema-review`), noema verifies issuer/audience/org owner/trusted central workflow identity, then exchanges it for a GitHub App installation token scoped to the target repository with minimal permissions (`pull_requests: write`, `contents: read`, `checks: read`). Review is one job, not the only job. Noema also runs as a separate agent program inside `ContextualWisdomLab/naruon` for judgments and decisions; naruon is a first-class consumer of the same gateway contract (wiring is a separate naruon PR). Every LLM path — production review, hourly product development, and naruon judgments — calls `contextual-orchestrator` (`NOEMA_LLM_API_URL` ending in `/v1`, model normally `contextual-orchestrator`, dedicated `NOEMA_LLM_API_KEY`). The reusable contract is `contracts/orchestrator-gateway.json`. Noema does not sequentially try the next model or hold upstream provider keys.

## Commands

```bash
npm install                # setup (devDependencies only; no runtime deps)
npm run dev                # wrangler dev — local Worker
npm run deploy             # wrangler deploy
npm test                   # vitest run (all tests)
npx vitest run test/worker.test.ts        # single test file
npx vitest run -t "pattern"               # single test by name
npm run typecheck          # tsc --noEmit
npm run security:scan      # npm audit --audit-level=high
npm run release:verify     # typecheck + test + security:scan + kpi:verify + acquisition:manifest
```

There is no lint script; `typecheck` and tests are the code gates. CI (`.github/workflows/ci.yml`) runs `npm run release:verify` on every PR and push to `main` (Node 24). Deployment is manual via the `cd` workflow, which runs `release:verify:strict` (requires 30-day production KPI evidence with provenance), then `wrangler deploy`, then `scripts/smoke-readiness.sh` against the live `/exchange` URL.

Operational/audit tooling (all in `scripts/`, run via npm): `kpi:compute`, `kpi:collect`, `kpi:check`, `kpi:alerts`, `kpi:verify[:strict]` (KPI pipeline over `exchange-30d.ndjson` structured logs), `smoke:check`, `production:preflight`, `readiness:audit`, `acquisition:manifest` / `acquisition:audit`, `security:evidence`. The README documents the required `NOEMA_*` environment variables for each; the scheduled `readiness-scan` / `acquisition-readiness-scan` workflows run the audits daily.

## Architecture

The deployed Cloudflare Worker entrypoint is **`src/runtime-entrypoint.ts`** (`wrangler.toml` `main`). It adds the `/ready` runtime-readiness surface and delegates ordinary requests into `src/entrypoint.ts`. That public edge layer enforces bounded request-body/JWT envelopes and the exact GitHub API egress policy before delegating to `src/worker.ts`; `src/worker.ts` composes the distributed `NoemaRateLimiter` and `NoemaOidcReplayGuard` Durable Objects around the base credential-exchange implementation in `src/index.ts`.

The public runtime surface includes:

- `GET /health` — liveness, returned by the base credential-exchange worker.
- `GET|HEAD /ready` — configuration/runtime readiness, handled by `src/runtime-entrypoint.ts`.
- `POST /exchange` — the core flow: distributed rate limit and replay/trust controls → bounded request/JWT validation → parse `Authorization: Bearer <OIDC JWT>` → `verifyGithubOidcJwt` (RS256 against GitHub's JWKS; enforces issuer, audience, `repository_owner`, and the exact configured workflow ref) → validate `target_repository` (must be a string, `owner/name` shape, allowed org, and requestable by the caller's repo) → mint a GitHub App JWT → resolve the installation id → create the scoped installation token.

Key internal conventions in the runtime composition:

- **Response envelope**: every response is `{ ok: true, data, trace_id }` or `{ ok: false, error_code, message, details, trace_id }`. Base exchange errors are thrown as `ApiError(code, status, message, details)` using the `ErrorCode` union; each code has an operator hint in `errorHints`. Add new failure modes to both the runtime path and its contract tests.
- **Protocol headers are contract-tested**: `no-store`/`nosniff` on all JSON responses, `x-trace-id`/`x-latency-ms` operational headers, `WWW-Authenticate` Bearer challenge on 401 (`invalid_request` vs `invalid_token`), `Allow: POST` on 405, `Retry-After` on 429, and readiness headers on `/ready`. `smoke-readiness.sh` and the CD smoke step verify these against production — changing them breaks deploys.
- **Structured logging**: the exchange path emits bounded JSON operational events such as `event: "http_request"` with route/status/latency/trace metadata. This schema feeds the KPI scripts (`exchange-30d.ndjson`). Issued/inbound tokens must never appear in logs — regression tests assert this.
- **Caches and distributed controls**: OIDC JWKS and installation-id TTL caches remain best-effort in-isolate caches, while credential-bearing request throttling and single-use replay protection are enforced by the `NoemaRateLimiter` and `NoemaOidcReplayGuard` Durable Objects declared in `wrangler.toml`.
- **Bindings**: `wrangler.toml` declares the `NOEMA_RATE_LIMITER` / `NoemaRateLimiter` and `NOEMA_OIDC_REPLAY_GUARD` / `NoemaOidcReplayGuard` Durable Object bindings plus `[vars]` for allowed issuer/audience/owner/workflow ref, GitHub API base, cache TTLs, and rate limits. There is no D1/queue binding today. Secrets (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PEM`, optional `GITHUB_APP_INSTALLATION_ID`) come from `wrangler secret put`; new secrets go into the typed runtime `Env` contract rather than `process.env`.

**Tests** (`test/`, Vitest, Node environment): worker/runtime tests import the relevant layered entrypoints directly and drive them in-process with real WebCrypto-signed JWTs, Durable Object test doubles, and mocked `fetch`; the other test files exercise the `scripts/*.mjs` tooling by spawning it (`spawnSync`) against temp fixtures, and some assert on docs/workflow content (e.g. `workflow-readiness.test.ts`). Coverage is scoped to `src/**/*.ts` (`vitest.config.ts`); broad credential/security V8 exclusions are regressions. See `docs/TEST_STRATEGY.md` for the exact 100% owned-production policy and any narrow evidence-bound exceptions.

## Conventions

- `CHANGELOG.md` has an `## Unreleased` section that is updated with every behavior change — follow that practice.
- Docs in `docs/` and the changelog are largely Korean (operations, sales/acquisition-readiness package); code, code comments, and AGENTS.md are English. Match the language of whatever you are editing.
- API behavior is under a stability contract (`docs/api-spec.md`, `docs/api-stability-contract.md`); changes to `/exchange` semantics or the response envelope need corresponding doc and smoke-check updates.
- Security posture is fail-closed everywhere (audits, KPI gates, OIDC checks). Prefer adding a regression test over relaxing a check.
