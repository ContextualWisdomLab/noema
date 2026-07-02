# Noema 판매 가능 프로그램 완료 Goal (v10)

## Goal ID
- `NOEMA-GOAL-SALEABLE-2026-07-02`
- 시작일: `2026-07-02`
- 종료일: `2026-07-31`
- 목적: `ContextualWisdomLab/noema`를 유료 파일럿에 즉시 투입 가능한 판매 가능 상태로 마감한다.

## 구체적 판정식 (코어)
- `Release-Ready`는 아래 3개 조건이 모두 true일 때만 true다.
  - `기술게이트_PASS`:
    - `npm run release:verify:strict` PASS
    - (CI 증빙: `npm run typecheck`, `npm run test`, `npm run security:scan` PASS)
  - `KPI_증빙_PASS`:
    - `exchange-30d.ndjson` 존재 및 `/exchange` 이벤트 30일 구간 충족
    - `exchange-30d.ndjson.provenance.json` 존재 및 `sourceKind=production`, `sourceId`, `records`, `collectedAt` 충족
    - `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 npm run kpi:verify:strict` PASS
    - 생성된 `noema-kpi-evidence.json`에서
      - `status === "PASS"`
      - `provenance.sourceKind === "production"`
      - `provenance.sourceId` 존재
      - `provenance.records > 0`
      - `parsed.check.exchange_failure_rate <= 0.02`
      - `parsed.check.exchange_p95_latency_ms < 300`
      - `parsed.check.exchange_window_days >= 30`
  - `파일럿_PASS`:
    - `docs/pilot-readiness-log.md`의 항목 1개 이상이 아래를 모두 만족
      - 운영 이관 승인 `[x]`, 운영 전환 승인일 `YYYY-MM-DD`
      - 온보딩 완료일 `YYYY-MM-DD`
      - 고객명 존재
      - `실패율 <= 0.02`, `p95 < 300` 체크박스 및 수치 충족
      - 분석 데이터 경로 + `trace_id 샘플` 존재
      - 지원 채널 합의 존재
      - `NOEMA URL`이 샘플이 아닌 production HTTPS URL
      - `증빙 출처: production`
      - `계약/매출 증빙 경로` 존재
- `Release-Ready = 기술게이트_PASS AND KPI_증빙_PASS AND 파일럿_PASS`

## 절대 Pass/Fail 기준
- `/exchange` 30일 실패율(`exchange_failure_rate`) <= `0.02`
- `/exchange` 30일 p95 지연(`exchange_p95_latency_ms`) < `300`
- strict KPI 증빙은 운영 provenance(`sourceKind=production`) 없이는 실패
- `/health`, `/exchange`가 공개 API 스키마를 유지 (`ok`, `trace_id`, `error_code`)
- 민감정보가 로그/에러 상세에 직접 노출되지 않음
- GitHub App 최소 권한으로 운영 (`pull_requests: write`, `checks: read`, `contents: read`)
- `npm run release:verify` 통과
- production 증빙이 있는 유료 파일럿 온보딩 완료 기록 최소 1건 (`docs/pilot-readiness-log.md`)

## 판정 공식 (배포 승인 기준)
- `Release-Ready = pass(기술게이트) AND pass(문서/운영 패키지) AND pass(증빙완료) AND pass(파일럿실적)`
- `pass(기술게이트) = npm run release:verify:strict` 성공
- `pass(문서/운영 패키지) = Week3 산출물 6개 섹션 모두 존재`  
  (`api-spec`, `api-stability-contract`, `onboarding`, `runbook`, `observability-kpi`, `deployment-guide`)
- `pass(증빙완료) =` `npm run kpi:verify:strict` + `noema-smoke-evidence.json` + `noema-kpi-evidence.json` + `exchange-30d.ndjson.provenance.json` 동시 보유
- `pass(파일럿실적) = docs/pilot-readiness-log.md의 production 증빙 완료 항목 1개 이상`

## 실행 조건 (모든 항목 충족 시 최종 승인)
- [ ] 운영 KPI 증빙 파일(`exchange-30d.ndjson`) 확보 및 `npm run kpi:verify:strict` PASS
- [ ] 운영 KPI provenance(`exchange-30d.ndjson.provenance.json`) 확보 및 `sourceKind=production` 검증
- [ ] `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30` 기준으로 `/exchange` 로그 구간이 충족되었음을 증빙
- [ ] production 증빙 유료 파일럿 온보딩 기록 1건 이상 완료 (`docs/pilot-readiness-log.md`)
- [ ] 운영 계약/가격/온보딩 문서 최신화 완료 (`docs/pricing-draft.md`, `docs/terms-draft.md`, `docs/sla-and-support.md`, `docs/onboarding.md`)
- [ ] 배포·문제 대응 Runbook 최신화 및 장애 대응 실전 훈련 1회 이상

## 자동 검증(매일 1회, 배포 전 필수)
- `npm run release:verify:strict`(프로덕션 문턱), `npm run release:verify`(개발 편의)
- `npm run readiness:audit` (기술·보안·KPI strict·smoke(환경변수 설정 시)·파일럿 증빙 한 번 점검)
- `node scripts/check-kpi.mjs exchange-30d.ndjson 0.02 300`
- `node scripts/evaluate-observability-alerts.mjs exchange-30d.ndjson`
- `npm run kpi:verify -- exchange-30d.ndjson 0.02 300` 또는 `npm run kpi:verify:strict` (운영 배포 전 strict 권장)
- `NOEMA_EXCHANGE_URL=<BASE_URL> npm run smoke:check` (`/health`, `/exchange` 스키마, 추적/지연 헤더, 401 Bearer challenge, no-store/nosniff 보안 헤더 계약 재검증)
- `NOEMA_EXCHANGE_URL=<BASE_URL>` 기준:
```bash
tmpdir="$(mktemp -d)"
health_code=$(curl -sS -D "${tmpdir}/health-hdr.txt" -o /tmp/noema-health.json -w "%{http_code}" "${NOEMA_EXCHANGE_URL%/exchange}/health")
[ "$health_code" = "200" ]
jq -e '.ok == true and .data.name=="noema" and (.trace_id|type=="string")' /tmp/noema-health.json >/dev/null
grep -iq '^x-trace-id:' "${tmpdir}/health-hdr.txt"
grep -iq '^x-latency-ms:' "${tmpdir}/health-hdr.txt"
```
- 인증 누락 경로:
```bash
tmpdir="$(mktemp -d)"
status=$(curl -sS -D "${tmpdir}/exchange-hdr.txt" -o /tmp/noema-exchange.json -w "%{http_code}" \
  -X POST -H "content-type: application/json" -d "{}" "${NOEMA_EXCHANGE_URL}")
[ "$status" = "401" ]
jq -e '.ok == false and .error_code=="ERR_AUTH_MISSING" and (.trace_id|type=="string")' /tmp/noema-exchange.json >/dev/null
grep -iq '^x-trace-id:' "${tmpdir}/exchange-hdr.txt"
grep -iq '^x-latency-ms:' "${tmpdir}/exchange-hdr.txt"
grep -iq '^www-authenticate:[[:space:]]*Bearer realm="noema", error="invalid_request"' "${tmpdir}/exchange-hdr.txt"
```

## 운영·문서·증빙 산출물
- 기술: `src/index.ts`, `test/worker.test.ts`
- 운영: `docs/runbook.md`, `docs/security-validation-checklist.md`, `docs/observability-kpi.md`, `scripts/evaluate-observability-alerts.mjs`
- 판매 패키지: `docs/api-spec.md`, `docs/onboarding.md`, `docs/pricing-draft.md`, `docs/sla-and-support.md`, `docs/terms-draft.md`, `docs/demo-scenario.md`
- 증빙: `docs/release-readiness-audit.md`, `docs/goal-completion-audit.md`, `docs/pilot-readiness-log.md`, `CHANGELOG.md`, `README.md`

## 주차별 Exit Gate

### Week 1 (7/2~7/8)
- [x] API 스키마/표준 에러코드/민감정보 마스킹 기준 확인
- [x] CI/CD 게이트와 수동 승인 조건 고정 (`.github/workflows/ci.yml`, `.github/workflows/cd.yml`)
- [x] `npm run release:verify` 1회 성공

### Week 2 (7/9~7/15)
- [x] `/health`, `/exchange` 로그 구조화 필드 점검 (`event/route/status_code/latency_ms/trace_id/error_code`)
- [x] KPI 집계·알림 스크립트 전체 연결 (`scripts/compute-kpi.mjs`, `scripts/check-kpi.mjs`, `scripts/evaluate-observability-alerts.mjs`)
- [x] 알림 임계치와 runbook 연동 (`docs/observability-kpi.md`)

### Week 3 (7/16~7/22)
- [x] README 판매/운영 패키지 링크 정합성 확보
- [x] 데모·온보딩·가격·SLA·약관 문서 상호 참조 완결
- [x] 변경 이력 및 릴리스 절차 업데이트 (`CHANGELOG.md`, `docs/deployment-guide.md`)

### Week 4 (7/23~7/31) + `final gate`
- [x] `docs/release-readiness-audit.md` 및 `docs/goal-completion-audit.md` Pass 항목 정리
- [ ] `exchange-30d.ndjson`(또는 동등 파이프라인 출력) + production provenance 산출 + `npm run kpi:verify:strict` PASS
- [ ] `docs/pilot-readiness-log.md` production 증빙 완료 항목 1건 이상 입력
- [ ] 최종 판매 패키지 증빙 문서 1건 작성(`성능/보안/운영/계약` 공통 근거 링크 포함)

### Gate 통제(최종 승인 전)
- `NOEMA_KPI_STRICT=1 npm run kpi:verify` 결과가 PASS인지 확인
- `cd` Artifact에 업로드된 `noema-smoke-evidence.json` 및 `noema-kpi-evidence.json`의 `status`가 PASS인지 확인

## 진행 규칙
- 리뷰 봇/리뷰어 지연은 blocker로 간주하지 않고 일정 리스크만 기록한다.
- blocker는 위 절대 기준의 미충족, 증빙 미보유, 보안/권한/파이프라인 중대 결함만 인정한다.
- 증빙 미보유는 기술 미완성으로 간주하지 않고 `판매-ready` 최종 판정에서만 blocker 처리한다.
- `리뷰 봇/리뷰어 지연`은 실행 지연 리스크로만 기록하고, Goal 판정식의 필수 체크와 분리한다.

## 조정 규칙(Autonomous Gate)
- 실행은 `매일 1회` `npm run readiness:audit`로 진행하고, 실패 항목은 즉시 `goal-audit.json`에 기록한다.
- `.github/workflows/readiness-scan.yml`은 매일 UTC 01:00에 자동 실행되며, 실패한 항목은 GitHub Actions에서 바로 확인 가능.
- 실패 원인 분류:
  - Blocker: `exchange-30d.ndjson` 미보유, production provenance 미보유, KPI 미달, production 파일럿 증빙 미보유.
  - Risk: 리뷰 지연, 외부 담당자 응답 지연, 배포 창 미열림.
- Blocker 항목은 `KPI_증빙_PASS` 또는 `파일럿_PASS`가 해소될 때까지 `blocked` 유지, Risk 항목은 일정 조정만 수행한다.

## 현재 실행 상태 (2026-07-02)

- [x] Goal 등록서 생성: `docs/saleable-program-goal-registry.md`
- [x] CI/CD 검증 스택을 수치화 (`npm run typecheck`, `npm run test`, `npm run security:scan`, `npm run kpi:verify`)  
- [x] CD 프로덕션 게이트를 `release:verify:strict`로 고정  
- [x] KPI 계산·검증·알림 스크립트 3종 연결 완료  
- [x] 판매/운영 문서 패키지(리스트) 정합성 확보  
- [ ] production 증빙 유료 파일럿 온보딩 실적 1건 이상 기록  
- [ ] `exchange-30d.ndjson` + production provenance 기반 30일 KPI 실제 계산 및 임계치 충족 증빙 확보

## 실행 근거 저장소 (권장)
- 증빙 파일명: `artifacts/saleable-readiness/<YYYYMMDD>/`
- KPI 산출: `exchange-30d.ndjson`, `exchange-30d.ndjson.provenance.json`, `kpi-evidence-<run-id>.json`
- 스모크 증빙: `smoke-readiness-<run-id>.json` (`npm run smoke:check` 출력 캡처)
- 파일럿 체크: `docs/pilot-readiness-log.md` production 증빙 완료 행

## Blocker 목록

- [ ] `exchange-30d.ndjson`(또는 동등 파이프라인 출력) 및 production provenance 미보유로 `release:verify:strict`의 KPI pass가 불가함  
- [ ] production 파일럿 증빙 완료 행 미보유로 `파일럿_PASS`가 불가함

## 다음 액션 플랜
- [ ] [판매 가능 Goal 등록서](./saleable-program-goal-registry.md) 판정식 기반으로 `release:verify:strict` 미해결 항목 재평가
- [ ] 운영에서 30일 로그 파이프라인 생성 (Logpush/외부 아카이브) 및 `exchange-30d.ndjson`/provenance 산출
- [ ] 다음 실행서열로 KPI 증빙 확보: `NOEMA_KPI_SOURCE_KIND=production NOEMA_KPI_SOURCE_ID=<출처 라벨> npm run kpi:collect` + `NOEMA_KPI_REQUIRE_WINDOW_DAYS=30 npm run kpi:verify:strict`
- [ ] 산출된 30일 로그로 `npm run kpi:verify` PASS 증빙 확보
- [ ] 첫 유료 파일럿 계약 사전 인터뷰 → `docs/pilot-readiness-checklist.md` 12항목 완료
- [ ] 매일 UTC+0 01:00 `readiness:audit` 스케줄 + 실행 직후 Goal 상태 표 업데이트

## 연동 지연 정책
- 코드 리뷰 봇/리뷰어 지연은 Goal 완성률 산정에서 `risk`로만 기록하고 `blocker`로 처리하지 않는다.
- `release:verify:strict` 실행 실패는 지표/리스크 근거를 우선 기록하고, `exchange-30d.ndjson` 및 production provenance 확보로 재시도한다.
