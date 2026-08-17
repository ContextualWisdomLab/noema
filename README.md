# Noema

Noema is a ContextualWisdomLab leaf product: a GitHub App credential broker
and an independent LLM pull-request reviewer. It runs on its own, and a host
calls it through a published HTTP API and a secret-free LLM gateway contract.
That hub-and-leaf call is the supported MSA path — **따로 또 같이** — not a
reason to merge repositories.

It deploys as a Cloudflare Worker (Free tier) with two jobs:

1. **Token exchange.** GitHub Actions presents an OIDC JWT (audience
   `cwl-noema-review`). Noema verifies issuer, audience, organization owner,
   and the exact trusted central workflow identity, then returns a
   repository-scoped GitHub App installation token
   (`pull_requests: write`, `contents: read`, `checks: read`).
2. **Review.** The default-branch
   [`central-review`](./.github/workflows/central-review.yml) runtime accepts a
   `noema-review` dispatch and publishes an App-authored verdict. Untrusted
   analysis stays in a separate sandbox; see
   [`docs/noema-agent-sandbox-plan.md`](./docs/noema-agent-sandbox-plan.md).

Every Noema LLM job — production review, hourly product development, and
host-side judgments — calls `ContextualWisdomLab/contextual-orchestrator`.
Upstream provider keys stay in the orchestrator credential KV. Noema does not
walk a sequential model list or fall back to a direct provider.

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

The public HTTP surface is documented in [`openapi.json`](./openapi.json) and
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

## Operator-facing review dispatch

`central-review` is default-branch-only. Bind the SHA from a fresh PR read:

```bash
gh api repos/ContextualWisdomLab/noema/dispatches -X POST --input - <<'JSON'
{"event_type":"noema-review","client_payload":{"target_repository":"ContextualWisdomLab/example","pr_number":1,"pr_head_sha":"0123456789abcdef0123456789abcdef01234567"}}
JSON
```

Runtime isolation, wait policy, and sandbox controls live in
[`docs/noema-agent-sandbox-plan.md`](./docs/noema-agent-sandbox-plan.md) and
[`docs/development/contributor-and-agent-procedure.md`](./docs/development/contributor-and-agent-procedure.md).

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
| `ALLOWED_WORKFLOW_REF_PREFIX` | `…/noema-review.yml@refs/heads/main` | Exact trusted workflow ref (name kept; matching is exact, not prefix) |
| `GITHUB_API_BASE` | `https://api.github.com` | GitHub Cloud API origin |
| `NOEMA_RATE_LIMIT_PER_MINUTE` | `60` | `/exchange` fixed-window budget |
| `NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS` | `300` | OIDC JWKS cache |
| `NOEMA_INSTALLATION_CACHE_TTL_SECONDS` | `600` | Installation-id cache |

`/exchange` first applies a SQLite-backed Durable Object fixed-window limit
across Worker isolates, then keeps the isolate-local limiter as defense in
depth. Missing or malformed distributed decisions fail closed; see
[Distributed rate limiting](./docs/distributed-rate-limiting.md).
OIDC `jti` values are consumed once by a Durable Object replay guard.

## 판매/운영 패키지

- [API 명세](./docs/api-spec.md)
- [안정성 계약](./docs/api-stability-contract.md)
- [Orchestrator gateway consumer contract](./docs/orchestrator-gateway-consumer-contract.md)
- [온보딩 가이드](./docs/onboarding.md)
- [운영 Runbook](./docs/runbook.md)
- [Distributed Rate Limiting](./docs/distributed-rate-limiting.md)
- [Runtime readiness](./docs/runtime-readiness.md)
- [Hourly Commercial-Readiness Loop](./docs/hourly-commercial-readiness-loop.md)
- [Hourly Orchestrator Product Development](./docs/operations/hourly-product-development.md)
- [SLA/지원 정책](./docs/sla-and-support.md)
- [가격 초안](./docs/pricing-draft.md)
- [관측성 KPI](./docs/observability-kpi.md)
- [보안/위협 모델](./docs/threat-model.md)
- [이용약관 초안](./docs/terms-draft.md)
- [배포 가이드](./docs/deployment-guide.md)
- [보안 검증 체크리스트](./docs/security-validation-checklist.md)
- [파일럿 온보딩 체크리스트](./docs/pilot-readiness-checklist.md)
- [출시 준비 감사서](./docs/release-readiness-audit.md)
- [Buyer Pitch Deck Outline](./docs/buyer-pitch-deck-outline.md)
- [판매 가능 Goal 등록서](./docs/saleable-program-goal-registry.md)
- [판매 가능 프로그램 Goal](./docs/saleable-program-readiness.md)
- [목표 완료 감사서](./docs/goal-completion-audit.md)
- [20억 매각 가능성 Goal 등록서](./docs/acquisition-readiness-2b.md)
- [Buyer Due Diligence Index](./docs/buyer-due-diligence-index.md)
- [Transfer Readiness Plan](./docs/transfer-readiness-plan.md)
- [Library Boundary Decision](./docs/library-boundary-decision.md)
- [Contributing](./CONTRIBUTING.md)

## KPI 계산

```bash
npm run kpi:compute
npm run kpi:check
npm run kpi:alerts
npm run kpi:verify
NOEMA_KPI_TAIL_COMMAND='timeout 30s wrangler tail noema --env production --format json' \
  NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
  NOEMA_KPI_SOURCE_KIND=production \
  NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
  npm run kpi:collect
# 또는 Logpush/아카이브 URL 직접 사용
NOEMA_KPI_LOG_URL=https://.../exchange-30d.ndjson \
  NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
  NOEMA_KPI_SOURCE_KIND=production \
  NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
  npm run kpi:collect
NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 npm run kpi:verify:strict
```

`exchange-30d.ndjson`은 운영 30일 로그 집계용 파일입니다.
`kpi:collect`는 `exchange-30d.ndjson.provenance.json`을 함께 생성하며, strict KPI 게이트는 `sourceKind=production`, `sourceId`, `records`, `collectedAt`이 있는 provenance 파일을 요구합니다.
`wrangler tail`은 실시간 수집이므로, 30일 집계는 Logpush/외부 파이프라인 또는 임시 저장본을 `exchange-30d.ndjson`로 구성해야 합니다.

## 배포 전 스모크 체크

```bash
NOEMA_EXCHANGE_URL=https://.../exchange npm run smoke:check
```

`npm run smoke:check`는 `/health`, `/ready`, `/exchange`의 스키마, 추적/지연 헤더, runtime readiness, 401 Bearer challenge, no-store/nosniff 보안 헤더를 확인하고 실패 내역을 JSON으로 출력하며,
배포에서 `NOEMA_SMOKE_EVIDENCE_PATH`를 지정하면 `noema-smoke-evidence.json` 형태로 증빙을 저장할 수 있습니다.

CI/CD의 `cd` 워크플로우는 동일 스크립트를 실행해 `/health`/`/ready`/`/exchange` 계약을 검증합니다.

운영 증빙 수집 전에는 다음 preflight로 production URL과 KPI 로그 수집 입력이 준비됐는지 확인합니다.

```bash
NOEMA_EXCHANGE_URL=https://.../exchange \
NOEMA_KPI_SOURCE_KIND=production \
NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
NOEMA_KPI_LOG_URL=https://.../exchange-30d.ndjson \
npm run production:preflight
```

`production:preflight`는 증빙을 생성하지 않으며, smoke/KPI evidence 수집 전 누락된 입력을 fail-fast로 알려줍니다.

## 판매 가능성 자동 감사

```bash
npm run readiness:audit
NOEMA_EXCHANGE_URL=https://.../exchange npm run readiness:audit
```

- `npm run readiness:audit`는 기술게이트, 보안/테스트, KPI strict(가능한 경우), smoke 증빙(환경변수 지정 시), 파일럿 완료 증빙까지 한 번에 검사합니다.
- `docs/security-validation-checklist.md`의 미체크 항목은 readiness audit 실패로 처리됩니다.
- 결과는 `artifacts/saleable-readiness/<YYYYMMDD>/goal-audit.json`에 저장됩니다.
- 파일럿 완료 증빙은 production HTTPS `NOEMA URL`, `증빙 출처: production`, `계약/매출 증빙 경로`가 있어야 인정됩니다.
- `readiness-scan` 워크플로우(`.github/workflows/readiness-scan.yml`)는 UTC 01:00 기준으로 정기 `readiness:audit`를 실행해 증빙을 `saleable-readiness-audit` 아티팩트로 보존합니다.
- 정기 `schedule` 실행은 누락된 production evidence를 `NOT_READY` status, warning, artifact로 남기는 감시 작업이며, `workflow_dispatch`와 로컬 `npm run readiness:audit`는 동일한 누락을 실패로 유지합니다.

## 20억 매각 가능성 감사

```bash
npm run acquisition:manifest
npm run acquisition:audit
```

- `npm run acquisition:manifest`는 buyer data room 파일, 명령, 외부 Figma 자산, 최종 evidence 경로를 `artifacts/acquisition-readiness/<YYYYMMDD>/data-room-manifest.json`으로 해시/색인합니다.
- manifest의 최종 evidence 항목은 파일 존재를 색인하며, 증빙 내용의 유효성은 `validatedBy`에 적힌 `npm run acquisition:audit` 통과로 판정합니다.
- `npm run acquisition:audit`는 `KRW 2,000,000,000` 매각 협상 기준의 실사 패키지를 검사합니다.
- `npm run security:evidence`는 보안 체크리스트와 reviewed security evidence만 단독 검증합니다.
- 기본 evidence path는 `artifacts/acquisition/revenue-evidence.json`, `artifacts/acquisition/transfer-evidence.json`, `docs/pilot-readiness-log.md`, 그리고 가장 최신 `artifacts/saleable-readiness/<YYYYMMDD>/goal-audit.json`입니다.
- `NOEMA_PILOT_LOG_PATH`로 별도 production 파일럿 로그를 지정할 수 있습니다.
- ARR/LOI/weighted pipeline, production 유료 파일럿, IP/license/권한 이전성, saleable readiness가 모두 증빙되지 않으면 실패합니다.
- revenue/transfer evidence는 `owner`, `source_documents`, 기본 45일 이내 `updated_at` 메타데이터가 없으면 실패합니다.
- `acquisition-readiness-audit` 워크플로우(`.github/workflows/acquisition-readiness-scan.yml`)는 매일 `acquisition:manifest`와 `acquisition:audit`를 실행하고 evidence artifact를 보존합니다.
- 정기 `schedule` 실행은 production/acquisition evidence 누락을 `NOT_READY` status, warning, artifact로 남기는 감시 작업이며, `workflow_dispatch`와 로컬 `npm run acquisition:audit`는 동일한 누락을 실패로 유지합니다.
- submodule은 현재 사용하지 않으며, `docs/library-boundary-decision.md`의 split trigger가 충족될 때 npm workspace package 분리를 검토합니다.

## 릴리스 검증

```bash
npm run release:verify
```

운영/프로덕션 배포 경로는 `.github/workflows/cd.yml`에서 `npm run release:verify:strict`를 사용하며, 실패 시 KPI 증빙(`noema-kpi-evidence.json`)과 provenance(`exchange-30d.ndjson.provenance.json`)는 워크플로우 Artifact로 저장됩니다.
