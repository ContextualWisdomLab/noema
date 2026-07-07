# 판매 가능 Goal 등록서 (v15)

## Goal 레지스트리

- Goal ID: `NOEMA-GOAL-SALEABLE-2026-07-02`
- 버전: `v15 (API 진단·키회전·로그 비노출·no-store 헤더·401 Bearer challenge 강화 버전)`
- 등록일: `2026-07-02`
- 기준일: `2026-07-31`
- 담당: `ContextualWisdomLab/noema 운영팀`
- 상태: `active`
- 비차단 규칙: `리뷰봇/리뷰어 지연`은 목표 판정에서 blocker 제외, `risk_note`로만 기록.

## 목표 선언

- 목표식:  
  `Release-Ready = 기술게이트_PASS AND KPI_증빙_PASS AND 파일럿_PASS`
- 최소 기준:
  - 기술게이트_PASS: `npm run release:verify:strict` PASS
  - KPI_증빙_PASS: `exchange_failure_rate <= 0.02`, `exchange_p95_latency_ms < 300`, `exchange_window_days >= 30`, `provenance.sourceKind === "production"`
  - 파일럿_PASS: `docs/pilot-readiness-log.md` production 증빙 완료 항목 1건 이상
- 운영 판정(자동): `artifacts/saleable-readiness/<YYYYMMDD>/goal-audit.json.passed === true`

## 최종 판정식 (Release-Ready)

`Release-Ready = 기술게이트_PASS AND KPI_증빙_PASS AND 파일럿_PASS`

- 기술게이트_PASS
  - `npm run release:verify:strict` PASS
  - `docs/saleable-program-readiness.md`의 핵심 6개 항목 `[x]` 충족
  - `docs/goal-completion-audit.md` 핵심 항목 정합성 PASS
- KPI_증빙_PASS
  - `exchange-30d.ndjson` 존재 및 `/exchange` 이벤트 포함
  - `exchange-30d.ndjson.provenance.json` 존재 및 운영 출처 증빙 포함
  - `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 npm run kpi:verify:strict` PASS
  - `noema-kpi-evidence.json` 요건 충족:
    - `status === "PASS"`
    - `requireWindowDays === 30`
    - `provenance.sourceKind === "production"`
    - `provenance.sourceId` 비어 있지 않음
    - `provenance.records > 0`
    - `parsed.check.exchange_failure_rate <= 0.02`
    - `parsed.check.exchange_p95_latency_ms < 300`
    - `parsed.check.exchange_window_days >= 30`
- 파일럿_PASS
  - `docs/pilot-readiness-log.md` production 증빙 완료 항목 1건 이상
  - 항목당 필수 체크:
    - `운영 이관 승인` `[x]`
    - `온보딩 완료일: YYYY-MM-DD`
    - `실패율 <= 0.02` `[x]`
    - `p95 < 300` `[x]`
    - `exchange_failure_rate` 수치 존재 및 임계 충족
    - `exchange_p95_latency_ms` 수치 존재 및 임계 충족
    - `NOEMA URL`이 샘플이 아닌 production HTTPS URL
    - `증빙 출처: production`
    - `계약/매출 증빙 경로` 존재

## 조정 룰 (Goal 운영용)

- 실행 주기: `매일 01:00 UTC` readiness 스캔 + 수시 수동 실행
- 정량 판정 우선순위: `기술게이트_PASS → KPI_증빙_PASS → 파일럿_PASS`
- `blocked` 갱신 규칙:
  - 기술게이트 fail 또는 KPI strict fail이면 즉시 blocked 유지
  - 파일럿 완료 미기록이면 다음 실행 전까지 blocked 유지
  - `리뷰봇/리뷰어 지연`은 Goal 판정에서는 블로커에서 제외하고 `risk_note`만 누적

## 실행 백로그 (우선순위·담당·증빙)

1. **운영 KPI 로그 취합 파이프라인 구축**  
   - 담당: 플랫폼팀
   - 목표: `exchange-30d.ndjson` 및 `exchange-30d.ndjson.provenance.json` 생성/갱신
   - 실행:  
     - `NOEMA_KPI_SOURCE_KIND=production NOEMA_KPI_SOURCE_ID=<비밀 아닌 출처 라벨> NOEMA_KPI_LOG_URL=... npm run kpi:collect` 또는  
     - `NOEMA_KPI_SOURCE_KIND=production NOEMA_KPI_SOURCE_ID=<비밀 아닌 출처 라벨> NOEMA_KPI_TAIL_COMMAND=... npm run kpi:collect`
   - 성공 기준:
     - `wc -l exchange-30d.ndjson > 0`
     - `exchange-30d.ndjson.provenance.json`의 `sourceKind=production`, `sourceId`, `records`, `collectedAt` 확인
     - `/exchange` 이벤트가 포함된 기간 로그 30일 이상
   - 증빙: `exchange-30d.ndjson` 라인카운트, provenance JSON, 수집 로그, `readiness` 실행 로그

2. **KPI Strict 게이트 통과(30일)**  
   - 담당: 플랫폼팀
   - 실행: `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 npm run kpi:verify:strict`
   - 산출물: `artifacts/<YYYYMMDD>/noema-kpi-evidence.json` (또는 배포 `noema-kpi-evidence.json`)
   - 성공 기준:
     - `status: PASS`
     - `provenance.sourceKind: production`
     - `provenance.sourceId` 존재
     - `parsed.check.exchange_failure_rate <= 0.02`
     - `parsed.check.exchange_p95_latency_ms < 300`
     - `parsed.check.exchange_window_days >= 30`
   - 다음 액션:
     - 실패 시 실패 원인(임계 초과/로그 미보유/윈도우 미달) 우선 분류 후 반복 실행 계획 수립

3. **유료 파일럿 완료 기록 반영**  
   - 담당: 영업·운영  
   - 실행: `docs/pilot-readiness-log.md` production 증빙 완료 항목 1건 기록  
   - 선결 조건: 계약/가격/SLA/약관 협의체결 요약 및 운영 증빙 경로 기재

4. **최종 게이트 잠금**  
   - 담당: 운영리드  
   - 실행: `NOEMA_EXCHANGE_URL=<운영_BASE>/exchange npm run readiness:audit`  
   - 성공 기준: `artifacts/<YYYYMMDD>/goal-audit.json.passed === true`

5. **운영 Smoke 재검증**  
   - 담당: 운영리드  
   - 실행: `NOEMA_EXCHANGE_URL=<운영_BASE>/exchange npm run smoke:check`  
   - 성공 기준:
     - `/health` 스키마/헤더 검증 PASS
    - `/exchange` 401 ERR_AUTH_MISSING 스키마/헤더/`WWW-Authenticate` PASS
   - 증빙: `artifacts/<YYYYMMDD>/noema-smoke-evidence.json`

## 상태 스냅샷 (2026-07-02)

| 항목 | 판정 기준 | 상태 |
|---|---|---|
| 기술게이트 | `release:verify` | pass (6 files, 27 tests, npm audit high 0 vulnerabilities, KPI non-strict skip) |
| Strict 기술게이트 | `release:verify:strict` | blocked (운영 실데이터/provenance 수집 미완) |
| KPI 30일 실패율 | `exchange_failure_rate <= 0.02` | blocked (운영 실데이터/provenance 미보유) |
| KPI 30일 p95 | `exchange_p95_latency_ms < 300` | blocked (운영 실데이터/provenance 미보유) |
| KPI 증빙 보관 | `noema-kpi-evidence.json` status PASS + production provenance | blocked (운영 실데이터/provenance 미보유) |
| 스모크 증빙 | `noema-smoke-evidence.json` passed=true | 미평가(운영 환경 연동 필요) |
| 파일럿 실적 | `docs/pilot-readiness-log.md` production 증빙 완료 항목 | blocked |

### v15 강화 증빙

- `/exchange` 405 응답이 `Allow: POST`를 포함하도록 고정
- `/exchange` 401 응답이 `WWW-Authenticate: Bearer realm="noema"` challenge를 포함하고 인증 누락은 `invalid_request`, 잘못된 토큰은 `invalid_token`으로 구분
- `target_repository` 비문자열 입력은 GitHub token 생성 전에 `ERR_VALIDATION_INPUT`, `details.field=target_repository`, `details.reason`, `details.received_type`로 거부
- GitHub installation token 응답의 `token`/`expires_at` 결함은 `ERR_GITHUB_INSTALLATION`과 필드 단위 details로 진단
- cached OIDC JWKS에 incoming token `kid`가 없으면 force refresh로 GitHub key rotation 수용
- `x-request-id`/`x-correlation-id`와 client IP 계열 헤더는 허용 문자/길이 기준으로 제한해 로그 오염과 rate-limit key 폭주를 방지
- installation token 포함 응답은 `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff` 보안 헤더를 포함
- `smoke-readiness.sh`가 `/health`와 `/exchange` 응답의 no-store/nosniff 보안 헤더 및 `/exchange` 401 Bearer challenge를 배포 스모크 단계에서 검증
- 성공 exchange 구조화 로그에 issued GitHub token(`ghs_...`)과 inbound OIDC token 원문이 포함되지 않음을 회귀 테스트로 검증
- 최신 검증:
  - `npm run typecheck` PASS
  - `npm run test` PASS (6 files, 27 tests)
  - `npm run security:scan` PASS (0 high vulnerabilities)
  - `npm run release:verify` PASS (`kpi:verify`는 non-strict에서 로그 미보유 SKIP)
  - `npm run readiness:audit` FAIL: `exchange-30d.ndjson`, `exchange-30d.ndjson.provenance.json`, production 파일럿 증빙 미보유

## 일일 운영/감시

- 매일 1회: `npm run readiness:audit`  
  - 성공: 통과
  - 실패: 즉시 차기 대응 이슈에 `blocked` 또는 `risk_note` 반영
- `.github/workflows/readiness-scan.yml` 스케줄(UTC 매일 01:00)에 자동 실행되어 `goal-audit.json`, `noema-kpi-evidence.json`, `exchange-30d.ndjson.provenance.json`, `noema-smoke-evidence.json`을 아티팩트로 저장
- 배포 전: `npm run release:verify:strict`
- 배포 직후: `NOEMA_EXCHANGE_URL=<BASE>/exchange npm run smoke:check`
- 블로커 재평가: `exchange-30d.ndjson` 및 provenance 신규 수집 후 `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 npm run kpi:verify:strict` 재실행

## 위험 분류

- Blocker
  - 실 30일 KPI 로그 미보유 (`exchange-30d.ndjson`)
  - 실 30일 KPI provenance 미보유 또는 `sourceKind !== production`
  - KPI strict 임계 미충족
  - production 파일럿 증빙 미보유
- Risk (일정 리스크 전용, blocker 아님)
  - 리뷰봇/리뷰어 지연
  - 운영 담당자 응답 지연
  - 배포 창 미열림

## 조정 규칙(Autonomous Gate)

- 위험 분류 자동 반영:
  - `blocked`로 남아야 할 항목: 실 KPI 미보유, 운영 provenance 미보유, KPI 임계 미달, KPI 증빙 미보유, production 파일럿 증빙 미보유
  - `risk_note`로만 남기는 항목: 리뷰봇/리뷰어 지연, 운영 협의 지연, 배포 창 이슈
- 조정 주기:
  - 자동 스캔 실패 항목은 다음 실행 전까지 보류 상태 유지
  - `goal-audit.json`의 `deferred` 항목은 다음 실행 전까지 `risk_note`로만 관리
