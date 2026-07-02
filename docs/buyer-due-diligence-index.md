# Noema Buyer Due Diligence Index

이 문서는 `KRW 2,000,000,000` 매각 검토에 필요한 data room 색인이다. 각 항목은 구매자가 확인할 수 있는 파일, 명령, evidence path를 가져야 한다.

기계 판독 manifest는 다음 명령으로 생성한다.

```bash
npm run acquisition:manifest
```

기본 출력은 `artifacts/acquisition-readiness/<YYYYMMDD>/data-room-manifest.json`이다.
Manifest의 최종 evidence 항목은 파일 존재와 SHA-256 색인을 남긴다.
증빙 내용의 유효성은 각 entry의 `validatedBy`에 적힌 명령, 현재는 `npm run acquisition:audit`, 이 통과해야 인정한다.

## Product

| 항목 | Evidence | 상태 |
|---|---|---|
| 제품 설명 | `README.md`, `docs/demo-scenario.md`, `docs/buyer-pitch-deck-outline.md` | ready |
| API 명세 | `docs/api-spec.md`, `docs/api-stability-contract.md` | ready |
| 온보딩 | `docs/onboarding.md`, `docs/pilot-readiness-checklist.md` | ready |
| 가격/계약 | `docs/pricing-draft.md`, `docs/terms-draft.md`, `docs/sla-and-support.md` | draft |
| Figma/FigJam 구매자 설명 자산 | `https://www.figma.com/board/8l2fELfENAABNhDTMEVJKt` (Figma Code Connect 미사용) | ready |

## Technical

| 항목 | Evidence | 상태 |
|---|---|---|
| CI gate | `.github/workflows/ci.yml` | ready |
| CD gate | `.github/workflows/cd.yml` | ready |
| Readiness scan | `.github/workflows/readiness-scan.yml` | ready |
| Acquisition readiness scan | `.github/workflows/acquisition-readiness-scan.yml` | ready |
| Release verification | `npm run release:verify:strict` | pending production KPI |
| Production evidence preflight | `npm run production:preflight` | pending production inputs |
| Security scan | `npm run security:scan` | ready |
| Smoke check | `NOEMA_EXCHANGE_URL=<url> npm run smoke:check` | pending deployed URL |

## Operations

| 항목 | Evidence | 상태 |
|---|---|---|
| Runbook | `docs/runbook.md` | ready |
| Threat model | `docs/threat-model.md` | ready |
| Security checklist | `docs/security-validation-checklist.md` | ready |
| 30일 KPI | `exchange-30d.ndjson`, provenance JSON, `noema-kpi-evidence.json` | pending |
| Production 파일럿 | `docs/pilot-readiness-log.md` (`NOEMA URL`, `증빙 출처: production`, `계약/매출 증빙 경로`) | pending |
| Goal audit | `artifacts/saleable-readiness/<YYYYMMDD>/goal-audit.json` | pending |

Production 파일럿 로그는 `npm run acquisition:audit`에서도 직접 검증한다.
기본 경로는 `docs/pilot-readiness-log.md`이고, 별도 data-room 파일을 쓸 때는 `NOEMA_PILOT_LOG_PATH=<path>`로 지정한다.

## Commercial

`artifacts/acquisition/revenue-evidence.json`에는 `owner`, `source_documents`, 기본 45일 이내 `updated_at`이 있어야 한다.

| 항목 | Evidence | 상태 |
|---|---|---|
| ARR | `artifacts/acquisition/revenue-evidence.json` | pending |
| Paid customer count | `artifacts/acquisition/revenue-evidence.json` | pending |
| LOI / paid PoC count | `artifacts/acquisition/revenue-evidence.json` | pending |
| Weighted pipeline | `artifacts/acquisition/revenue-evidence.json` | pending |
| Buyer security/operations Q&A | `artifacts/acquisition/revenue-evidence.json` (`buyer_due_diligence_qna`) | pending |
| Customer concentration | `artifacts/acquisition/revenue-evidence.json` | pending |

## Transfer

`artifacts/acquisition/transfer-evidence.json`에는 `owner`, `source_documents`, 기본 45일 이내 `updated_at`이 있어야 한다.

| 항목 | Evidence | 상태 |
|---|---|---|
| License/dependency review | `artifacts/acquisition/transfer-evidence.json` | pending |
| GitHub App transfer | `artifacts/acquisition/transfer-evidence.json` | pending |
| Cloudflare worker/account/domain transfer | `artifacts/acquisition/transfer-evidence.json` | pending |
| Secrets rotation | `artifacts/acquisition/transfer-evidence.json` | pending |
| Privacy/customer data note | `artifacts/acquisition/transfer-evidence.json` | pending |
| Transfer execution plan | `docs/transfer-readiness-plan.md` | ready |

## Final Gate

20억 매각 readiness는 다음 세 명령이 모두 통과해야 한다.

```bash
npm run release:verify:strict
npm run readiness:audit
npm run acquisition:manifest
npm run acquisition:audit
```

Review process 지연은 이 표에서 blocker가 아니다.
