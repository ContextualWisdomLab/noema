# Noema 관측성 KPI 정의

## 기본 지표

### 가용성 / 신뢰성
- `exchange_failure_rate`
  - 계산식: `exchange_failures_30d / exchange_requests_30d`
  - 목표: `<= 0.02` (2%)
- `exchange_p95_latency_ms`
  - `route=/exchange` 이벤트의 `latency_ms` 95백분위수
  - 목표: `< 300`
  - OIDC JWKS와 GitHub App installation id는 Worker isolate 내 TTL 캐시로 반복 조회를 줄이고, incoming token의 새 `kid`가 cached JWKS에 없으면 강제 refresh한다

### 에러 코드 분석
- `error_code`별 건수 월간 집계
- 상위 10개 코드 추적
- `ERR_RATE_LIMIT` 연속 3분 이상 발생 시 즉시 알림
- 자체 `/exchange` rate limit 초과 시 `details.client_hash`, `retry_after_seconds`를 기준으로 반복 호출 주체와 재시도 정책 확인
- `ERR_VALIDATION_INPUT`은 `details.field=target_repository`를 기준으로 고객 workflow 입력 오류를 분리
- `ERR_GITHUB_INSTALLATION`은 `details.field=token|expires_at`를 기준으로 GitHub installation token 응답 이상을 분리

## 로그 수집 예시 필드
- `event`
- `route`
- `status_code`
- `latency_ms`
- `trace_id`
- `error_code`
- `repository`
- `workflow_ref`
- `oidc_sub`
- `token_expires_at` (성공 시)

발급된 GitHub token, inbound OIDC token 원문, private key 등 민감 정보는 로그 필드에 포함하지 않는다.

## 알림 규칙(초안)
- `route=/exchange`의 5분 실패율이 5%를 넘으면 경보
- p95가 500ms를 넘으면 경보
- `ERR_WORKFLOW_NOT_ALLOWED` 증가율이 30분 동안 3배 이상 상승하면 경보
- `ERR_*` 월별 Top10 및 빈도 집계는 KPI 증빙 저장 시 함께 생성

## KPI 수집 구현
- 첫 단계: Cloudflare Workers 로그를 정기 배치로 집계
- 장기 단계: 로그 파이프라인(예: Datadog/CloudWatch) 연결

## 로컬 집계 스크립트

```bash
NOEMA_KPI_TAIL_COMMAND='timeout 30s wrangler tail noema --env production --format json' \
NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
NOEMA_KPI_SOURCE_KIND=production \
NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
npm run kpi:collect
# 또는 Logpush/아카이브 URL 사용
NOEMA_KPI_LOG_URL=https://.../exchange-30d.ndjson \
NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
NOEMA_KPI_SOURCE_KIND=production \
NOEMA_KPI_SOURCE_ID=cloudflare-logpush:noema-production \
npm run kpi:collect
node scripts/compute-kpi.mjs exchange-30d.ndjson
node scripts/check-kpi.mjs exchange-30d.ndjson 0.02 300
node scripts/evaluate-observability-alerts.mjs exchange-30d.ndjson
```

`exchange-30d.ndjson`은 `wrangler tail --format json` 출력에서 저장한 행 기반 로그 파일입니다.
`exchange-30d.ndjson.provenance.json`은 `kpi:collect`가 생성하는 운영 출처 증빙이며, strict 게이트는 이 파일을 요구합니다.
`scripts/compute-kpi.mjs`는 `request.url`, `request.path`, `route`, `status`, `latency_ms` 등 여러 필드 규격을 동시에 해석합니다.
`check-kpi`는 `NOEMA_KPI_REQUIRE_WINDOW_DAYS`를 통해 최소 구간(운영 게이트 기본 30일)을 검증합니다.

`wrangler tail`은 실시간 스트림이므로, 30일 누적 집계가 필요하면 Cloudflare 로그 수집 파이프라인(Workers Analytics/Logpush)에서 동일 JSON 형식으로 저장한 후 스크립트를 적용합니다.

### 30일 누적 지표 수집 체크리스트(운영)

- [ ] Logpush/로그 아카이브에서 `/exchange` 포함 `http_request` 로그를 30일치 추출
- [ ] 추출 파일을 `exchange-30d.ndjson`로 저장
- [ ] `NOEMA_KPI_SOURCE_KIND=production`, `NOEMA_KPI_SOURCE_ID=<비밀 아닌 출처 라벨>`로 provenance 생성
- [ ] `npm run kpi:check -- exchange-30d.ndjson 0.02 300` 통과
- [ ] `npm run kpi:alerts -- exchange-30d.ndjson` 경보 0건 확인
- [ ] `NOEMA_KPI_LOG_PATH=exchange-30d.ndjson NOEMA_KPI_PROVENANCE_PATH=exchange-30d.ndjson.provenance.json npm run kpi:verify:strict` 통과

운영 게이트 기본값:

- `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30` (`kpi:verify:strict`, `release:verify:strict` 경유)

### 30일 KPI 체크 실행 예시

```bash
node scripts/check-kpi.mjs exchange-30d.ndjson 0.02 300
# pass: true 이면 목표값 충족
```

## 알림 룰 실행 예시(임계치 초과 감지)

```bash
NOEMA_ALERT_5M_FAILURE_RATE=0.05 \
NOEMA_ALERT_5M_P95_MS=500 \
NOEMA_ALERT_RATE_LIMIT_MINUTES=3 \
NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER=3 \
node scripts/evaluate-observability-alerts.mjs exchange-30d.ndjson
```

임계치 위반이 있으면 종료코드가 1이 됩니다.

### 30일 증빙 실행(배포 전 게이트)

```bash
NOEMA_KPI_LOG_PATH=exchange-30d.ndjson \
NOEMA_KPI_PROVENANCE_PATH=exchange-30d.ndjson.provenance.json \
npm run kpi:verify:strict
```

### Logpush/외부 아카이브 수집(권장)

- 아카이브가 NDJSON(한 줄 JSON)면 `NOEMA_KPI_LOG_URL`로 바로 수집
- 수집 시 `NOEMA_KPI_SOURCE_KIND=production` 및 비밀이 아닌 안정적 출처 라벨(`NOEMA_KPI_SOURCE_ID`)을 반드시 지정
- `kpi:collect`는 `exchange-30d.ndjson.provenance.json`을 생성하며 strict 모드는 이 파일 없이는 실패
- 압축 파일은 미리 `gzip -dc`로 해제 후 `exchange-30d.ndjson`로 저장
- 수집 후 `wc -l exchange-30d.ndjson`로 30일치 최소 데이터가 확보되었는지 선검증
