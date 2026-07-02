# Noema 출시 준비 감사서 (초안)

## 2026-07-02 기준 상태 요약

- [x] 인증·인가 기본 골격 충족 (OIDC/Workflow 제약/표준 에러 코드)
- [x] 관측성 구조화 로그와 KPI 계산/알림 스크립트 연결
- [x] CI/CD 게이트와 스모크 확인 동선 구성
- [ ] 운영 데이터(`exchange-30d.ndjson`) 및 production provenance 기반 KPI 게이트 통과(`NOEMA_KPI_REQUIRE_WINDOW_DAYS=30` 충족)
- [ ] production 증빙 유료 파일럿 1건 온보딩 완료
- [ ] `npm run readiness:audit` 통합 패스(운영 provenance 기준)

### 최근 실행 증빙
- `npm run release:verify` → PASS (10 files, 44 tests, `npm audit --audit-level=high` 0 vulnerabilities, KPI strict 미사용 모드에서 SKIP)
- `npm run test` → PASS (10 files, 44 tests)
- `npm run kpi:verify:strict` → FAIL. `exchange-30d.ndjson`와 `exchange-30d.ndjson.provenance.json`의 `sourceKind=production` 증빙 필요.
- `npm run production:preflight` → CD에서 `release:verify:strict`보다 먼저 실행됨. `NOEMA_EXCHANGE_URL`, `NOEMA_KPI_SOURCE_KIND=production`, `NOEMA_KPI_SOURCE_ID`, `NOEMA_KPI_LOG_URL` 또는 `NOEMA_KPI_TAIL_COMMAND` 필요.
- `NOEMA_EXCHANGE_URL=<URL> npm run smoke:check` → 운영 배포 endpoint 존재 시 스키마/운영 헤더/401 Bearer challenge/no-store 보안 헤더 PASS 필요
- `cd` 워크플로우에서 스모크 증빙 아티팩트(`noema-smoke-evidence.json`) 생성됨
- `npm run readiness:audit` → FAIL (`exchange-30d.ndjson`, `exchange-30d.ndjson.provenance.json` 미보유)
  - `smoke readiness check`는 `NOEMA_EXCHANGE_URL` 미설정으로 defer 상태
- `docs/saleable-program-goal-registry.md` 생성 완료 (`NOEMA_KPI_REQUIRE_WINDOW_DAYS`/차단항목/판정식 등록)

## 1. 보안·인증·인가
- [x] `src/index.ts`에서 OIDC 검증, 권한/워크플로 제약, 토큰 검증 오류를 `ERR_*`로 분류
- [x] `ALLOWED_WORKFLOW_REF_PREFIX` 기본값이 중앙 workflow의 `refs/heads/main` ref까지 고정됨
- [x] 모든 표준 오류 응답에 운영자용 `details.hint` 포함
- [x] 성공 exchange 경로 테스트에서 RS256 OIDC 검증, GitHub App 설치 조회, 최소권한 access token 요청, `token_expires_at` 응답을 확인
- [x] `/exchange` 자체 rate limit이 429 `ERR_RATE_LIMIT` 및 `Retry-After` 계약으로 동작함
- [x] `target_repository` 타입 오류는 GitHub token 생성 전 `ERR_VALIDATION_INPUT` 및 필드 단위 details로 차단됨
- [x] GitHub installation token 응답의 `expires_at` 결함은 `ERR_GITHUB_INSTALLATION` 및 필드 단위 details로 진단됨
- [x] OIDC JWKS 및 GitHub App installation id TTL 캐시로 반복 외부 조회를 줄이고, cached JWKS에 새 `kid`가 없을 때 강제 refresh됨
- [x] `x-request-id`/`x-correlation-id`와 client IP 계열 헤더는 허용 문자/길이 기준을 통과한 경우에만 응답 또는 rate-limit key에 사용됨
- [x] installation token이 포함되는 `/exchange` 응답은 `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`를 포함함
- [x] 최소권한 GitHub App 퍼미션으로 운영됨(Pull requests write, Checks read, Contents read)
- [x] 비밀키/토큰 로그에 직접 노출되지 않음 (성공 경로 테스트가 `ghs_` token 및 inbound OIDC token 미기록을 확인)
- [x] 시크릿 회수 정책이 문서화됨([threat-model], [runbook], [terms])

## 2. 거래·운영 관측성
- [x] `route`, `status_code`, `latency_ms`, `trace_id`, `error_code`, `x-trace-id`, `x-latency-ms` 로깅/헤더 확인
- [x] 실패율 및 p95 산출 스크립트 존재 (`scripts/compute-kpi.mjs`, `scripts/check-kpi.mjs`)
- [x] 실시간 알림 판정 스크립트 존재 (`scripts/evaluate-observability-alerts.mjs`)
- [ ] `exchange-30d.ndjson`(또는 동등 파이프라인 출력) + production provenance 기준 30일 지표 계산 근거 보관

## 3. 배포 안정성
- [x] CI 게이트: typecheck/test/audit 수행
- [x] CD 게이트: 수동 승인 + 스모크 검증 (`/health` 스키마/필수헤더/no-store 보안 헤더, `/exchange` 401/`ERR_AUTH_MISSING`/필수헤더/`WWW-Authenticate`/no-store 보안 헤더) via `./scripts/smoke-readiness.sh`
- [x] `npm run release:verify:strict` 실행(운영 배포 전)
- [x] `npm run kpi:verify` 운영 증빙(30일 NDJSON 존재 시) 실행
- [x] 배포 전 `cd`에서 `NOEMA_KPI_LOG_URL` 또는 `NOEMA_KPI_TAIL_COMMAND` 사용 시 provenance 생성 후 `release:verify:strict` 수행

## 4. 구매/운영 문서 패키지
- [x] API 명세, SLA, 가격, 온보딩, 배포 가이드, 보안 체크리스트 문서 완비
- [x] 데모 시나리오/스크립트 존재

## 5. 운영성/리스크 대응
- [x] Runbook, DR, 회수·폐기 절차 문서화
- [x] 알림 기준(실패율/p95/ERR_RATE_LIMIT/ERR_WORKFLOW_NOT_ALLOWED) 지정

## 6. 제품 자산
- [x] Changelog 업데이트
- [x] 파일럿 체크리스트/온보딩 문서 준비
- [ ] production 파일럿 완료 증빙 확보
- [x] 출시 전 사용자에게 전달 가능한 링크 정리

## 7. KPI 증빙
- [ ] `/exchange` 실패율(`exchange_failure_rate`) <= 0.02 (운영 provenance 기준)
- [ ] `/exchange` p95(`exchange_p95_latency_ms`) < 300 (운영 provenance 기준)
- [ ] 증빙 파일: `exchange-30d.ndjson`, `exchange-30d.ndjson.provenance.json`, `noema-kpi-evidence.json` 저장

## 증빙 저장 규칙
- KPI/스모크 배포 증빙 파일:
  - `cd` 실행 시 `noema-kpi-evidence.json`(KPI 게이트), `exchange-30d.ndjson.provenance.json`(운영 출처), `noema-smoke-evidence.json`(스모크)가 artifact로 보관되어야 함
- 증빙 불일치 시 `pass` 판정은 `release:verify:strict` 재실행 후 재평가한다.

## 8. 파일럿
- [ ] 유료 대상 1개 조직 이상 Onboarding 체크리스트 완료
- [ ] 테스트 토큰 교환 성공 로그와 계약/지원 합의 저장
- [ ] `증빙 출처: production`, production HTTPS `NOEMA URL`, `계약/매출 증빙 경로` 저장
