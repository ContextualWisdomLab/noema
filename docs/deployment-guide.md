# Noema 배포 가이드

## 1. 빌드 환경
- Node.js 22+ LTS 또는 그 이후의 지원 중인 LTS 릴리스
- `npm ci`
- 비밀값 준비

Node.js 20은 2026년 3월 유지보수가 종료되어 사용하지 않습니다. 개발, CI, 릴리스 환경은 `package.json`의 `engines.node >=22` 계약과 저장소에 고정한 Node/npm 버전을 따라야 합니다.

로컬·CI·릴리스 환경은 의존성 설치 전에 다음 preflight를 실행해 잘못된 런타임을 즉시 차단합니다.

```bash
node -e 'const major=Number(process.versions.node.split(".")[0]); if (!Number.isInteger(major) || major < 22) { console.error(`Node.js >=22 required; found ${process.versions.node}`); process.exit(1); }'
```

## 2. 프로덕션 배포

프로덕션 배포는 임의 브랜치나 로컬 명령에서 시작하지 않습니다. `docs/deployment-provenance.md`의 release-bound 절차가 canonical 운영 계약입니다. 이미 생성된 `vMAJOR.MINOR.PATCH` 태그와 immutable GitHub Release를 지정해 default-branch `repository_dispatch` 이벤트 `noema-production-deploy`를 보내고, `production` Environment의 독립 승인과 증거 게이트를 통과한 뒤에만 배포합니다.

릴리스 전 source 검증은 다음 순서로 수행합니다.

1. `main`의 release-ready exact head와 버전을 확인합니다.
2. `npm ci --legacy-peer-deps=false --install-links=false`를 실행합니다.
3. `npm run release:verify:strict`를 통과시킵니다.
4. semantic-version tag와 immutable GitHub Release, `release-evidence.json`을 생성·검증합니다.
5. 아래와 같이 production dispatch를 보냅니다.

```bash
gh api repos/ContextualWisdomLab/noema/dispatches \
  -X POST \
  -f event_type=noema-production-deploy \
  -F 'client_payload[release_tag]=v0.1.0'
```

`cd` 워크플로는 exact release tag를 checkout한 뒤 저장소가 소유하는 direct Cloudflare API client를 사용합니다. `npm run deploy`와 `npm run cloudflare:status`는 이 보호된 워크플로 내부의 구현 명령이며, 운영자가 release/environment gate를 건너뛰기 위한 수동 배포 인터페이스가 아닙니다. 워크플로는 배포 전 상태, direct deployment 결과, 배포 후 active 100% version, smoke 결과와 KPI 증거를 `deployment-evidence.json` 및 관련 attestation에 결합합니다.

GitHub Actions variables:
- `NOEMA_EXCHANGE_URL`: 배포된 `/exchange` URL
- `NOEMA_KPI_LOG_URL` 또는 `NOEMA_KPI_TAIL_COMMAND`: 승인된 30일 NDJSON 로그 수집 경로
- `NOEMA_KPI_SOURCE_ID`: 비밀이 아닌 운영 로그 출처 라벨(예: `cloudflare-logpush:noema-production`)

Cloudflare bearer는 일반 스크립트 환경변수로 전달하지 않습니다. 워크플로의 bootstrap 단계에서 secret을 owner-only 임시 capability file로 옮긴 뒤 환경의 원문 secret을 제거하고, direct deployment/status client에는 비밀이 아닌 `NOEMA_CLOUDFLARE_API_TOKEN_PATH`만 전달합니다. 배포 시퀀스 종료 후 capability file은 `always()` cleanup에서 제거합니다.

## 3. 사후 점검
- `GET /health` 200 확인
- `GET /ready` 200 확인 (`status: ready`). 503이면 `/exchange` 트래픽을 보내지 않습니다.
- 정상 요청으로 `/exchange` 200 확인
- `authorization` 누락 시 `/exchange`가 `401/ERR_AUTH_MISSING` 응답 확인
- `/exchange` 401 응답이 `WWW-Authenticate: Bearer realm="noema", error="invalid_request"`를 포함하는지 확인
- 최근 30분 `http_request` 로그에 `trace_id`가 기록되는지 확인
- 30일 누적 지표를 위해 승인된 production log source에서 `exchange-30d.ndjson`을 수집한 뒤 `kpi:collect` + `kpi:verify:strict` 실행
  - `kpi:verify:strict`는 `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30`으로 30일 구간을 확인
  - strict 게이트는 `exchange-30d.ndjson.provenance.json`에서 `sourceKind=production`, `sourceId`, `records`, `collectedAt`을 추가 확인
- 배포 전후 동일 계약 검증을 위해 `./scripts/smoke-readiness.sh` 실행
  - `/health`, `/ready`, `/exchange` 스키마와 `x-trace-id`, `x-latency-ms`, `WWW-Authenticate`, `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`를 검증
  - 운영에서는 `NOEMA_SMOKE_EVIDENCE_PATH`를 지정해 증빙 파일을 보존하고 릴리스 패키지에 포함

Logpush/아카이브처럼 재현 가능한 production URL을 사용할 수 있으면 이를 우선합니다.

```bash
NOEMA_KPI_LOG_URL=https://.../exchange-30d.ndjson \
NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
NOEMA_KPI_SOURCE_KIND=production \
NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
npm run kpi:collect

NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
NOEMA_KPI_PROVENANCE_PATH=exchange-30d.ndjson.provenance.json \
NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 \
npm run kpi:verify:strict
```

URL 대신 승인된 수집 명령을 써야 하는 환경에서는 `NOEMA_KPI_TAIL_COMMAND`에 그 명령을 지정합니다. 수집 도구 자체는 Noema의 배포 권한이 아니며, strict KPI gate가 provenance와 30일 window를 별도로 검증합니다.
