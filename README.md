# Noema

Noema is ContextualWisdomLab's dedicated GitHub App token exchange service for an independent LLM pull request reviewer.

It runs as a Cloudflare Worker on the Free tier:

- GitHub Actions requests a GitHub OIDC token with audience `cwl-noema-review`.
- Noema verifies the OIDC issuer, audience, organization owner, and trusted central workflow identity.
- Noema exchanges the verified OIDC token for a GitHub App installation token scoped to the target repository.
- The central `.github` workflow uses that installation token to submit an LLM review verdict from a GitHub App identity separate from OpenCode Agent.

The LLM call itself is configured in the central workflow with:

- `NOEMA_LLM_API_URL`
- `NOEMA_LLM_MODEL`
- `NOEMA_LLM_API_KEY`

## Required GitHub App permissions

Repository permissions:

- Pull requests: Read and write
- Checks: Read-only
- Contents: Read-only

Install the app on `ContextualWisdomLab/.github` and target repositories that use the central required workflow.

## Worker secrets

```powershell
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY_PEM
```

Optional:

```powershell
wrangler secret put GITHUB_APP_INSTALLATION_ID
```

Runtime guardrail:

- `NOEMA_RATE_LIMIT_PER_MINUTE` defaults to `60` and limits `/exchange` requests per client per minute on a best-effort Worker-isolate basis.
- `NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS` defaults to `300`; `NOEMA_INSTALLATION_CACHE_TTL_SECONDS` defaults to `600` to reduce repeated external lookups on hot paths.
- `/exchange` accepts only `POST` (`Allow: POST` on 405), returns standard Bearer challenges on 401, bounds untrusted trace/client headers before reflection or rate-limit keying, validates `target_repository` as a string before GitHub token creation, refreshes OIDC JWKS when a new signing `kid` appears, returns no-store/nosniff response headers, and keeps issued/inbound tokens out of operational logs.

## Deploy

```powershell
npm install
npm run deploy
```

Set `NOEMA_EXCHANGE_URL` in `ContextualWisdomLab/.github` variables to the deployed `/exchange` URL.

## 판매/운영 패키지

- [API 명세](./docs/api-spec.md)
- [안정성 계약](./docs/api-stability-contract.md)
- [온보딩 가이드](./docs/onboarding.md)
- [운영 Runbook](./docs/runbook.md)
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

`npm run smoke:check`는 `/health`와 `/exchange`의 스키마, 추적/지연 헤더, 401 Bearer challenge, no-store/nosniff 보안 헤더를 확인하고 실패 내역을 JSON으로 출력하며,
배포에서 `NOEMA_SMOKE_EVIDENCE_PATH`를 지정하면 `noema-smoke-evidence.json` 형태로 증빙을 저장할 수 있습니다.

CI/CD의 `cd` 워크플로우는 동일 스크립트를 실행해 `/health`/`/exchange` 계약을 검증합니다.

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
- submodule은 현재 사용하지 않으며, `docs/library-boundary-decision.md`의 split trigger가 충족될 때 npm workspace package 분리를 검토합니다.

## 릴리스 검증

```bash
npm run release:verify
```

운영/프로덕션 배포 경로는 `.github/workflows/cd.yml`에서 `npm run release:verify:strict`를 사용하며, 실패 시 KPI 증빙(`noema-kpi-evidence.json`)과 provenance(`exchange-30d.ndjson.provenance.json`)는 워크플로우 Artifact로 저장됩니다.
