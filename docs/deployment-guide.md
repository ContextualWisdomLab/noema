# Noema 배포 가이드

## 1. 빌드 환경
- Node.js 22+ LTS 또는 그 이후의 지원 중인 LTS 릴리스
- `npm ci`
- 비밀값 준비

Node.js 20은 2026년 3월 유지보수가 종료되어 사용하지 않습니다. Cloudflare Wrangler는 Node.js의 Current·Active LTS·Maintenance LTS 릴리스만 지원하므로 개발, CI, 릴리스 환경은 `package.json`의 `engines.node >=22` 계약을 따라야 합니다.

로컬·CI·릴리스 환경은 의존성 설치 전에 다음 preflight를 실행해 잘못된 런타임을 즉시 차단합니다.

```bash
node -e 'const major=Number(process.versions.node.split(".")[0]); if (!Number.isInteger(major) || major < 22) { console.error(`Node.js >=22 required; found ${process.versions.node}`); process.exit(1); }'
```

## 2. 배포
1. 브랜치 정합성 확인
2. Node.js runtime preflight 통과 확인
3. `npm ci`
4. `npm run release:verify:strict` (프로덕션/CD 기준)
5. `wrangler deploy`
   - 배포 전/후 상태와 KPI 가드 결과는 `noema-kpi-evidence.json`으로 저장해 보관
   - 스모크 검증 증빙은 `NOEMA_SMOKE_EVIDENCE_PATH=noema-smoke-evidence.json`로 저장

운영 배포는 `workflow_dispatch` 기반의 `cd` 워크플로를 사용해 승인 게이트를 거쳐 실행합니다.
GitHub Actions variables:
- `NOEMA_EXCHANGE_URL`: 배포된 `/exchange` URL
- `NOEMA_KPI_LOG_URL` 또는 `NOEMA_KPI_TAIL_COMMAND`: 30일 NDJSON 로그 수집 경로
- `NOEMA_KPI_SOURCE_ID`: 비밀이 아닌 운영 로그 출처 라벨(예: `cloudflare-logpush:noema-production`)

권장 순서:
1. `main` 최신 반영
2. `npm run production:preflight`로 `NOEMA_EXCHANGE_URL`, KPI 로그 출처, provenance label 준비 상태 확인
3. `.github/workflows/cd.yml` 실행 (`environment=production`)
4. 승인자 체크 후 배포 진행

성공 시 `noema` 워커 URL을 `NOEMA_EXCHANGE_URL`로 기록한다.

## 3. 사후 점검
- `GET /health` 200 확인
- `GET /ready` 200 확인 (`status: ready`). 503이면 `/exchange` 트래픽을 보내지 않는다
- 정상 요청으로 `/exchange` 200 확인
- `authorization` 누락 시 `/exchange`가 `401/ERR_AUTH_MISSING` 응답 확인
- `/exchange` 401 응답이 `WWW-Authenticate: Bearer realm="noema", error="invalid_request"`를 포함하는지 확인
- 최근 30분 `http_request` 로그에 `trace_id`가 기록되는지 확인
- 30일 누적 지표를 위해 로그를 `exchange-30d.ndjson`으로 수집 후 `kpi:collect` + `kpi:verify:strict` 실행
  - `kpi:verify:strict`는 `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30`으로 30일 구간을 확인
  - strict 게이트는 `exchange-30d.ndjson.provenance.json`에서 `sourceKind=production`, `sourceId`, `records`, `collectedAt`을 추가 확인
- 배포 전후 동일 계약 검증을 위해 `./scripts/smoke-readiness.sh` 실행
  - `/health`, `/ready`, `/exchange` 스키마와 `x-trace-id`, `x-latency-ms`, `WWW-Authenticate`, `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`를 검증
  - 운영에서는 `NOEMA_SMOKE_EVIDENCE_PATH`를 지정해 증빙 파일을 보존하고 릴리스 패키지에 포함

```bash
NOEMA_KPI_TAIL_COMMAND='timeout 30s wrangler tail noema --env production --format json' \
NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
NOEMA_KPI_SOURCE_KIND=production \
NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
npm run kpi:collect

NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
NOEMA_KPI_PROVENANCE_PATH=exchange-30d.ndjson.provenance.json \
NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 \
npm run kpi:verify:strict

# Logpush/아카이브 URL 사용 시
NOEMA_KPI_LOG_URL=https://.../exchange-30d.ndjson \
NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
NOEMA_KPI_SOURCE_KIND=production \
NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
npm run kpi:collect
```
