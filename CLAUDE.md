# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read `AGENTS.md` first.** It is the canonical cross-agent operating guide for this repo and its guardrails are binding: the central Security Scan PR gate (`trivy-fs` findings are real — remediate by bumping vulnerable npm deps, never weaken the gate), and the config/secrets rule (secrets reach `src/` only through the typed `Env` binding provisioned with `wrangler secret put` — never introduce `process.env` / `os.getenv` secret reads in `src/`). This file complements AGENTS.md with commands and architecture; when in doubt, AGENTS.md wins.

## What noema is

Noema is ContextualWisdomLab's GitHub App token exchange service for an independent LLM pull request reviewer. It is a single TypeScript Cloudflare Worker (Free tier): GitHub Actions presents a GitHub OIDC token (audience `cwl-noema-review`), noema verifies issuer/audience/org owner/trusted central workflow identity, then exchanges it for a GitHub App installation token scoped to the target repository with minimal permissions (`pull_requests: write`, `contents: read`, `checks: read`). The central `ContextualWisdomLab/.github` workflow uses that token to post LLM review verdicts under a separate App identity.

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

The entire Worker is one file: **`src/index.ts`** (entry point per `wrangler.toml` `main`). It exports the `Env` interface and a default `fetch` handler with two routes:

- `GET /health` — liveness, returns the standard success envelope.
- `POST /exchange` — the core flow: per-client rate limit → parse `Authorization: Bearer <OIDC JWT>` → `verifyGithubOidcJwt` (RS256 against GitHub's JWKS; enforces issuer, audience, `repository_owner`, and `workflow_ref` prefix from `[vars]`) → validate `target_repository` (must be a string, `owner/name` shape, allowed org, and requestable by the caller's repo) → mint a GitHub App JWT → resolve the installation id → create the scoped installation token.

Key internal conventions in `src/index.ts`:

- **Response envelope**: every response is `{ ok: true, data, trace_id }` or `{ ok: false, error_code, message, details, trace_id }`. Errors are thrown as `ApiError(code, status, message, details)` using the `ErrorCode` union; each code has an operator hint in `errorHints`. Add new failure modes to both.
- **Protocol headers are contract-tested**: `no-store`/`nosniff` on all JSON responses, `x-trace-id`/`x-latency-ms` operational headers, `WWW-Authenticate` Bearer challenge on 401 (`invalid_request` vs `invalid_token`), `Allow: POST` on 405, `Retry-After` on 429. `smoke-readiness.sh` and the CD smoke step verify these against production — changing them breaks deploys.
- **Structured logging**: one `console.log(JSON.stringify(...))` per request with `event: "http_request"`, `route`, `status_code`, `latency_ms`, `trace_id`, etc. This exact shape is the input format for the KPI scripts (collected as `exchange-30d.ndjson`), so treat it as a schema. Issued/inbound tokens must never appear in logs — regression tests in `test/worker.test.ts` assert this.
- **In-isolate caches** (best-effort, per Worker isolate): rate-limit buckets, OIDC JWKS TTL cache (force-refreshed when an unknown `kid` appears), and installation-id TTL cache. TTLs and the rate limit are tunable via `NOEMA_*` vars in `wrangler.toml`.
- **Bindings**: `wrangler.toml` defines only `[vars]` (allowed issuer/audience/owner/workflow ref, GitHub API base, cache/rate-limit knobs). There are no KV/D1/queue/Durable Object bindings. Secrets (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PEM`, optional `GITHUB_APP_INSTALLATION_ID`) come from `wrangler secret put`; new secrets go into the `Env` interface.

**Tests** (`test/`, Vitest, Node environment): `worker.test.ts` imports the Worker's default export directly and drives it in-process with real WebCrypto-signed JWTs and a mocked global `fetch`; the other test files exercise the `scripts/*.mjs` tooling by spawning it (`spawnSync`) against temp fixtures, and some assert on docs/workflow content (e.g. `workflow-readiness.test.ts`). Coverage is scoped to `src/**/*.ts` (`vitest.config.ts`); `/* v8 ignore */` markers in `src/index.ts` are deliberate.

## Conventions

- `CHANGELOG.md` has an `## Unreleased` section that is updated with every behavior change — follow that practice.
- Docs in `docs/` and the changelog are largely Korean (operations, sales/acquisition-readiness package); code, code comments, and AGENTS.md are English. Match the language of whatever you are editing.
- API behavior is under a stability contract (`docs/api-spec.md`, `docs/api-stability-contract.md`); changes to `/exchange` semantics or the response envelope need corresponding doc and smoke-check updates.
- Security posture is fail-closed everywhere (audits, KPI gates, OIDC checks). Prefer adding a regression test over relaxing a check.
