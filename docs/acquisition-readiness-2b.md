# Noema 20억 매각 가능성 Goal 등록서

## Goal

- Goal ID: `NOEMA-GOAL-ACQUISITION-2B-2026-07-02`
- 목표 가격: `KRW 2,000,000,000`
- 기준일: `2026-09-30`
- 상태: `active`
- 하위 필수 조건: `NOEMA-GOAL-SALEABLE-2026-07-02` 완료 증빙
- 비차단 규칙: review process, review bot, reviewer delay는 blocker가 아니다. 매각 readiness에서는 `risk_note`로만 남긴다.

## 목표 선언

Noema를 단순 오픈소스/파일럿 코드가 아니라, 구매자가 `KRW 2,000,000,000` 가격을 검토할 수 있는 양도 가능한 보안 인프라 제품으로 만든다. 성공 판정은 코드 품질이 아니라 실사 가능한 증거 묶음으로 한다.

`2B Acquisition-Ready = Saleable_PASS AND Revenue_PASS AND Buyer_DD_PASS AND Transfer_PASS AND Product_Asset_PASS`

## 판정식

### 1. Saleable_PASS

- `npm run readiness:audit` PASS
- 30일 운영 KPI:
  - `/exchange` 실패율 `<= 0.02`
  - 핵심 API p95 `< 300ms`
  - `provenance.sourceKind === "production"`
- production 증빙 유료 파일럿 완료 기록 1건 이상

### 2. Revenue_PASS

둘 중 하나를 만족한다.

- ARR route:
  - 확정 ARR `>= KRW 300,000,000`
  - gross margin `>= 70%`
  - 유료 고객 `>= 3`
  - top-1 customer concentration `< 60%`
- Strategic pipeline route:
  - weighted enterprise pipeline `>= KRW 500,000,000`
  - 서명 LOI 또는 유상 PoC 의향서 `>= 3`
  - 유료 고객 `>= 1`
  - 구매자별 보안/운영 실사 Q&A 로그 존재

ARR route가 더 강하다. Strategic pipeline route는 매각 협상 착수 기준이고, 최종 20억 가격 방어에는 ARR route 전환 계획을 함께 제시해야 한다.

### 3. Buyer_DD_PASS

구매자가 실사 중 바로 확인할 수 있는 자료가 있어야 한다.

- API 명세, 안정성 계약, 배포 가이드, runbook, SLA/support, pricing, terms draft
- threat model 및 security validation checklist
- 30일 KPI provenance와 smoke evidence
- 장애/DR/토큰 회수/키 회전 절차
- 고객 온보딩 checklist와 파일럿 운영 로그
- 파일럿 로그에는 production HTTPS `NOEMA URL`, `증빙 출처: production`, `계약/매출 증빙 경로`가 있어야 한다.
- 비용 구조: Cloudflare, GitHub App, 운영 인력, 지원 대응 비용

### 4. Transfer_PASS

매각 또는 자산 이전을 방해하는 항목이 없어야 한다.

- third-party dependency/license review: `pass`
- GitHub App ownership transfer plan: `pass`
- Cloudflare account/worker/domain/secrets transfer plan: `pass`
- production secrets rotation plan: `pass`
- customer data/privacy handling note: `pass`
- repository, CI/CD, artifacts, runbook 운영 권한 이전 절차: `pass`

### 5. Product_Asset_PASS

Product Design 기준으로 구매자와 파일럿 고객이 제품 가치를 빠르게 이해해야 한다.

- 5분 demo path: 문제, token exchange, audit trail, failure handling, rollback story
- 구매자 pitch deck 또는 FigJam value map: `https://www.figma.com/board/8l2fELfENAABNhDTMEVJKt` (Figma Code Connect 미사용)
- ICP: GitHub Actions에서 장기 토큰을 줄이고 싶은 보안 민감 조직
- 사용 전환 이유: long-lived secret 축소, scoped GitHub App token, traceable broker, strict KPI gate
- self-serve onboarding path: 설치, GitHub App 연결, OIDC issuer 설정, smoke check, KPI check

## Library/Submodule 판단

현재는 별도 submodule을 만들지 않는다. 이유:

- 제품 경계가 `Worker service` 하나로 충분하다.
- submodule은 구매자 실사에서 checkout, CI, 권한 이전, release provenance를 더 복잡하게 만든다.
- 아직 두 번째 runtime, public SDK, multi-service consumer가 없다.

분리 조건은 명확히 둔다.

- `@noema/core` workspace package 분리: CLI, SDK, 다른 runtime, 또는 온프렘 broker가 같은 exchange/auth logic을 재사용할 때.
- `@noema/client` package 분리: 고객 앱이 typed client를 요구하고 versioned API contract가 안정화됐을 때.
- submodule: 별도 법인/별도 라이선스/별도 release cadence가 생길 때만 사용한다.

따라서 지금의 매각 준비는 `submodule 없음`, `workspace package는 future trigger`, `현재 repo 단일 이전 가능성 극대화`가 기준이다.

## 90일 실행 계획

### Phase 0: 현재 기반 잠금

- PR #2 판매 가능 릴리스 게이트를 main에 병합한다.
- release, KPI, smoke, security, docs gate를 유지한다.
- review process 지연은 risk로만 기록한다.

### Phase 1: 매각 실사 패키지

- `docs/acquisition-readiness-2b.md`를 Goal 등록서로 사용한다.
- `docs/buyer-due-diligence-index.md`에 buyer data room checklist를 둔다.
- `docs/library-boundary-decision.md`에 분리/비분리 결정을 기록한다.
- `npm run acquisition:manifest`로 buyer data room 파일/외부 자산/최종 evidence 경로를 해시 기반 manifest로 묶는다.
- `npm run acquisition:audit`로 매각 readiness 증거를 점검한다.

### Phase 2: 가격 방어 증거

- 운영 30일 KPI provenance를 채운다.
- 유료 파일럿 1건을 ARR 전환 가능한 계약으로 전환한다.
- 최소 3건의 LOI 또는 유상 PoC 의향서를 확보한다.
- weighted pipeline, ARR, gross margin, customer concentration evidence를 JSON으로 기록한다.

### Phase 3: buyer-ready package

- pitch deck/FigJam value map을 만든다. Figma Code Connect는 사용하지 않는다.
- demo script와 API spec을 구매자 실사 흐름에 맞춘다.
- IP/license/secrets/account transfer evidence를 채운다.

### Phase 4: final gate

- `npm run release:verify:strict` PASS
- `npm run readiness:audit` PASS
- `npm run acquisition:manifest` PASS 및 `finalGatePassed: true`
- `npm run acquisition:audit` PASS
- buyer DD checklist 전 항목 evidence path 채움

## Evidence JSON 계약

`npm run acquisition:audit`는 다음 evidence를 요구한다.

- revenue evidence: `artifacts/acquisition/revenue-evidence.json`
- transfer evidence: `artifacts/acquisition/transfer-evidence.json`
- saleable readiness evidence: `artifacts/saleable-readiness/<YYYYMMDD>/goal-audit.json`
- revenue/transfer evidence는 `owner`, `source_documents`, 최근 `updated_at`을 포함해야 한다.
- `updated_at`은 기본 45일 이내 증빙이어야 하며, 필요 시 `NOEMA_ACQUISITION_EVIDENCE_MAX_AGE_DAYS`로 조정한다.

예시는 다음과 같다.

```json
{
  "arr_krw": 300000000,
  "gross_margin": 0.75,
  "paid_customers": 3,
  "pipeline_weighted_krw": 500000000,
  "loi_count": 3,
  "customer_concentration_top1": 0.5,
  "updated_at": "2026-07-02",
  "owner": "finance",
  "source_documents": [
    "crm:noema-arr-report",
    "contracts/noema-paid-customers.pdf"
  ]
}
```

```json
{
  "license_review": "pass",
  "third_party_review": "pass",
  "github_app_transfer_plan": "pass",
  "cloudflare_transfer_plan": "pass",
  "secrets_rotation_plan": "pass",
  "owner_transfer_plan": "pass",
  "privacy_review": "pass",
  "updated_at": "2026-07-02",
  "owner": "legal",
  "source_documents": [
    "docs/buyer-due-diligence-index.md",
    "legal/noema-transfer-review.pdf"
  ]
}
```

## 현재 판정

- 기술 기반: `pass` (PR #2 기준 main 병합 후 유지)
- 20억 매각 readiness: `not_pass`
- 남은 핵심 증거:
  - 30일 production KPI provenance
  - ARR 또는 LOI/pipeline evidence
  - transfer evidence
  - buyer DD data room evidence

현재 문서는 가격을 주장하기 위한 자료가 아니라, 가격을 검증 가능하게 만들기 위한 운영 목표다.
