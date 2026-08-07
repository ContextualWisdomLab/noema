# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read `AGENTS.md` first.** It is the canonical cross-agent operating guide for this repo and its guardrails are binding: the central Security Scan PR gate (`trivy-fs` findings are real — remediate by bumping vulnerable npm deps, never weaken the gate), and the config/secrets rule (secrets reach `src/` only through the typed `Env` binding provisioned with `wrangler secret put` — never introduce `process.env` / `os.getenv` secret reads in `src/`). This file complements AGENTS.md with commands and architecture; when in doubt, AGENTS.md wins.

## What noema is

Noema is ContextualWisdomLab's GitHub App token exchange service for an independent LLM pull request reviewer. It is deployed as a TypeScript Cloudflare Worker with two SQLite-backed Durable Object coordinators. GitHub Actions presents a GitHub OIDC token (audience `cwl-noema-review`), Noema verifies issuer/audience/repository owner and the exact trusted workflow ref paired with its immutable workflow SHA, then exchanges it for a GitHub App installation token scoped to the target repository with minimal permissions. The central `ContextualWisdomLab/.github` workflow uses that token to publish review evidence under a separate App identity. Read `ARCHITECTURE.md` for the authoritative runtime, trust-boundary, MSA, and evidence/authority model.

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

There is no lint script; `typecheck` and tests are the code gates. CI (`.github/workflows/ci.yml`) runs `npm run release:verify` on every PR and push to `main` (Node 24). Deployment is manual via the `cd` workflow, which runs `release:verify:strict` (requires 30-day production KPI evidence with provenance), then `wrangler deploy`, then `scripts/smoke-readiness.sh` against the live service.

Operational/audit tooling (all in `scripts/`, run via npm): `kpi:compute`, `kpi:collect`, `kpi:check`, `kpi:alerts`, `kpi:verify[:strict]` (KPI pipeline over `exchange-30d.ndjson` structured logs), `smoke:check`, `production:preflight`, `readiness:audit`, `acquisition:manifest` / `acquisition:audit`, `security:evidence`. Required `NOEMA_*` inputs are documented by the relevant command source/help and focused runbooks; scheduled readiness/acquisition workflows provide their reviewed invocation contracts rather than relying on one catch-all README variable list.

## Architecture

`wrangler.toml` points to **`src/runtime-entrypoint.ts`**, not directly to `src/index.ts`. The request path is deliberately layered:

1. **`src/runtime-entrypoint.ts`** owns `/ready` and delegates all other routes.
2. **`src/entrypoint.ts`** enforces bounded request bodies/JWT envelopes and the credential-bearing GitHub egress policy.
3. **`src/worker.ts`** applies distributed rate limiting, exact central-workflow ref plus paired immutable SHA trust, and OIDC replay protection around the core exchange.
4. **`src/index.ts`** implements the core `/health` and `/exchange` protocol, OIDC signature/claim verification, GitHub App JWT creation, installation discovery, and scoped installation-token exchange.

The public route meanings are distinct:

- `GET /health` — process liveness only.
- `GET|HEAD /ready` — offline runtime/configuration readiness for credential-exchange traffic, including `ALLOWED_WORKFLOW_SHA` syntax.
- `POST /exchange` — credential exchange after all outer trust gates pass.

`wrangler.toml` also binds two SQLite-backed Durable Objects:

- **`NoemaRateLimiter`** through `NOEMA_RATE_LIMITER`: authoritative pre-auth distributed fixed-window abuse control. Raw client IPs are not stored as object names.
- **`NoemaOidcReplayGuard`** through `NOEMA_OIDC_REPLAY_GUARD`: coordinates one-time use of a validated GitHub Actions OIDC `jti` until expiry.

Key internal conventions:

- **Response envelope**: API responses are `{ ok: true, data, trace_id }` or `{ ok: false, error_code, message, details, trace_id }`. Failure modes are intentionally bounded and fail closed.
- **Protocol headers are contract-tested**: `no-store`/`nosniff` on JSON responses, `x-trace-id`/`x-latency-ms` operational headers, Bearer challenge on authentication failure, `Allow` on unsupported methods, and retry metadata on throttling/readiness failures. `smoke-readiness.sh` and the CD smoke step verify the production contract.
- **Structured logging is a schema**: `http_request` records feed the KPI pipeline (`exchange-30d.ndjson`). Issued/inbound credentials must never enter logs.
- **State is layered**: OIDC JWKS and installation-id caches are best-effort isolate-local caches; security decisions requiring cross-isolate coordination use the Durable Objects above.
- **Workflow source is a tuple**: reusable workflow trust uses `job_workflow_ref` + `job_workflow_sha`; caller workflow trust uses `workflow_ref` + `workflow_sha`. Do not mix claims across those pairs or authorize a moving ref without its configured immutable SHA.
- **Secrets remain bindings**: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PEM`, and optional `GITHUB_APP_INSTALLATION_ID` come from `wrangler secret put`/Cloudflare secret bindings and enter production code through typed `Env`; do not add `process.env`/`os.getenv` secret reads under `src/`.
- **Evidence is not authority**: GitHub check runs, commit statuses, review evidence, model judgement, protected-branch merge authority, release acceptance, and deployment authority are distinct planes. Never promote one into another because a status says success.

**Tests** (`test/`, Vitest, Node environment): tests drive the Worker and trust-boundary helpers in-process or spawn bounded audit tooling against temporary fixtures. Production source coverage is configured at 100% statements/branches/functions/lines; public reviewer interfaces additionally enforce 100% docstring coverage through reviewer CI. Documentation/workflow contracts are also regression-tested where they define security or operating behavior.

## Conventions

- `CHANGELOG.md` has an `## Unreleased` section that is updated with every behavior change — follow that practice.
- `ARCHITECTURE.md` is the authoritative high-level architecture and trust-boundary document. Update it when a runtime layer, Durable Object, authority plane, CWL integration boundary, or deployment trust assumption changes.
- Docs in `docs/` and the changelog are largely Korean (operations, sales/acquisition-readiness package); code, code comments, and AGENTS.md are English. Match the language of whatever you are editing.
- API behavior is under a stability contract (`docs/api-spec.md`, `docs/api-stability-contract.md`); changes to `/exchange` semantics or the response envelope need corresponding doc and smoke-check updates.
- Security posture is fail-closed everywhere (audits, KPI gates, OIDC checks). Prefer adding a regression test over relaxing a check.
- No repair/self-modifying GitHub Actions or branch-patching `contents: write` workflow is an acceptable maintenance shortcut.