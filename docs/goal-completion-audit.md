# Noema 판매 가능 목표 완료 감사(운영용)

## 기준 매핑 (자동/수동 증빙)

- 대상 목표: `[판매가능 프로그램 완성 목표](../docs/saleable-program-readiness.md)`
- 목표 등록서: `[판매 가능 Goal 등록서](./saleable-program-goal-registry.md)`

### 블로커 분리 규칙
- 리뷰 지연(리뷰봇/리뷰어 대기)은 본 목표에서 **blocker로 취급하지 않는다**.
- blocker는 다음만 인정한다.
  - `exchange-30d.ndjson` 기반 **운영 실데이터** 증빙 미보유
  - `exchange-30d.ndjson.provenance.json` 기반 **production provenance** 증빙 미보유
  - `docs/pilot-readiness-log.md` 기반 **production 파일럿** 증빙 미보유

### 1) 안전한 인증·인가
- 코드 기반 분류: `src/index.ts`
  - OIDC issuer/audience/repository/workflow 검증, `ERR_*` 분류, 토큰 만료/시간위반 처리 존재
  - 기본 workflow ref는 `refs/heads/main`까지 고정해 중앙 workflow 임의 ref 실행을 차단
  - 모든 표준 오류 응답은 `details.hint`를 포함해 운영자가 즉시 조치 경로를 확인 가능
  - 성공 경로 테스트가 RS256 OIDC 검증부터 GitHub App 최소권한 토큰 요청까지 포함
  - `/exchange` 반복 호출은 자체 rate limit으로 429 `ERR_RATE_LIMIT` 및 `Retry-After` 반환
  - 405 응답은 `Allow: POST`를 포함하고, `target_repository` 타입 오류는 GitHub token 생성 전에 필드 단위 details로 반환
  - GitHub installation token 응답의 `expires_at` 결함은 `ERR_GITHUB_INSTALLATION`과 필드 단위 details로 진단
  - `x-request-id`/`x-correlation-id`와 client IP 계열 헤더는 허용 문자/길이 기준을 통과한 경우에만 trace/rate-limit key에 사용
  - installation token 포함 응답은 `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`를 포함
  - 401 응답은 `WWW-Authenticate: Bearer realm="noema"` challenge로 인증 누락/잘못된 토큰을 구분
- 운영 문서화: `docs/threat-model.md`, `docs/terms-draft.md`
- 최소권한 권한 설정: `wrangler.toml` + `docs/onboarding.md`
- 상태: **지속 점검 중(코드/문서 충족)**

### 2) 거래·운영 관측성
- 응답 헤더: `x-trace-id`, `x-latency-ms`(`src/index.ts`)
- 구조화 로그: `event/http_request/route/status_code/latency_ms/error_code/trace_id`(`src/index.ts`)
- hot path 최적화: OIDC JWKS 및 GitHub App installation id TTL 캐시로 반복 외부 조회 감소. cached JWKS에 incoming token `kid`가 없으면 force refresh로 GitHub key rotation을 수용
- KPI 스크립트: `scripts/compute-kpi.mjs`, `scripts/check-kpi.mjs`
- 알림 판정 스크립트: `scripts/evaluate-observability-alerts.mjs` (`npm run kpi:alerts`)
- 30일 지표 산출 증빙: **필수 외부 로그 데이터 필요** (`exchange-30d.ndjson` 또는 파이프라인 출력) + production provenance + `npm run kpi:verify:strict` (`NOEMA_KPI_REQUIRE_WINDOW_DAYS=30` 기본)
- 상태: **미해결 외부 의존(실 데이터 미보유)**  
- 증빙 자동화: `kpi:verify`/`kpi:verify:strict` 실패/스킵 모두 `NOEMA_KPI_EVIDENCE_PATH`로 증빙 JSON 생성 및 CD에서 Artifact 업로드.

### 3) 배포 안정성
- CI 게이트: `.github/workflows/ci.yml`
- CD 게이트: `.github/workflows/cd.yml`  
  - `NOEMA_KPI_LOG_URL` 설정 시 `NOEMA_KPI_SOURCE_KIND=production`, `NOEMA_KPI_SOURCE_ID`와 함께 `kpi:collect` 선행 후 `release:verify:strict` 수행
- 배포 전 검증: `npm run release:verify`(package/script, README)
- 배포 후 smoke: `/health`와 `/exchange` 응답 스키마 및 헤더(`x-trace-id`, `x-latency-ms`, `WWW-Authenticate`, `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`) 검증
- 상태: **충족(자동화 설정 완료)**

### 4) 구매/운영 문서 패키지
- 설치/온보딩: `docs/onboarding.md`
- SLA/지원: `docs/sla-and-support.md`
- 가격·약관: `docs/pricing-draft.md`, `docs/terms-draft.md`
- API 명세/계약: `docs/api-spec.md`, `docs/api-stability-contract.md`
- 상태: **충족(문서 패키지 가시화 완료)**

### 5) 운영성/리스크 대응
- Runbook/DR: `docs/runbook.md`
- 알림 기준: `docs/observability-kpi.md`
- 키 회수/폐기 플로우: `docs/threat-model.md`, `docs/terms-draft.md`, `docs/runbook.md`
- 상태: **충족(절차 문서 준비 완료)**

### 6) 제품 자산 패키징
- 배포/릴리스 증빙: `docs/deployment-guide.md`, `CHANGELOG.md`
- 데모/검증: `docs/demo-scenario.md`, `scripts/demo-exchange.sh`
- 판매/온보딩 체크리스트: `docs/pilot-readiness-checklist.md`, `docs/pilot-readiness-log.md`
- 상태: **부분 충족(자산 준비 완료, production 파일럿 실적 증빙 대기)**

### 정량 목표
- `/exchange` 실패율 ≤ 2%, p95 < 300ms
- 검증 명령: `npm run kpi:check -- exchange-30d.ndjson 0.02 300`
  - 상태: **외부 로그 기반 실증 대기**

- 유료 파일럿 1개 이상 온보딩
  - 검증 명령: `docs/pilot-readiness-log.md`에 완료 항목 기입
  - 상태: **production URL/출처/계약 증빙 경로 포함 완료 항목 대기**

### 최신 실행 증빙 (2026-07-02)
- `npm run release:verify` → PASS (non-strict KPI 스킵, 코드/테스트/보안 게이트 통과)
- `npm run test` → PASS (6 files, 27 tests)
- `npm run kpi:verify:strict` → FAIL. strict 모드는 `exchange-30d.ndjson`와 production provenance를 요구함.
- `npm run readiness:audit` → 운영 실데이터/provenance 미보유 시 FAIL, smoke는 `NOEMA_EXCHANGE_URL` 미설정이면 defer
- `docs/saleable-program-goal-registry.md` 존재하여 Goal 등록 요구사항은 충족됨
- CD Artifact 보존 규칙(이행) 확인: `noema-smoke-evidence.json`, `noema-kpi-evidence.json`, `exchange-30d.ndjson.provenance.json` 생성/업로드 규칙 존재

### 운영 모드에서의 검증 스냅샷
- 실행: `npm run readiness:audit`
- 결과 요약:
  - `release:verify:strict`: FAIL (`exchange-30d.ndjson`, production provenance 미보유)
  - `kpi evidence file present and pass`: FAIL (`sourceKind=production`, `sourceId`, `records` 증빙 필요)
  - `pilot readiness has completed production record`: FAIL (production 파일럿 증빙 미보유)
  - `smoke readiness check`: deferred (`NOEMA_EXCHANGE_URL` 미설정)
- 저장 위치: `artifacts/saleable-readiness/20260702/goal-audit.json`
