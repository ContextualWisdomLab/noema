# Noema Buyer Due Diligence Index

이 문서는 `KRW 2,000,000,000` 매각 검토에 필요한 data room 색인이다. 각 항목은 구매자가 확인할 수 있는 파일, 명령, evidence path를 가져야 한다.

기계 판독 manifest는 다음 명령으로 생성한다.

```bash
npm run acquisition:manifest
```

기본 출력은 `artifacts/acquisition-readiness/<YYYYMMDD>/data-room-manifest.json`이다.
Manifest는 buyer-readiness authority가 아니라 검증 대상인 색인이다. 생성 직후 다음 명령이 exact checkout의 retained bytes에서 file digest/size, catalog identity, exact source commit, optional release identity, external verification receipt와 모든 gate/gap 값을 다시 계산해야 한다.

```bash
npm run acquisition:integrity
```

Manifest의 최종 evidence 항목은 파일 존재와 SHA-256 색인을 남긴다. 저장된 `passed`, `finalGatePassed`, `missingRequired`, `missingFinalGate`는 authorization input이 아니며 trusted recomputation과 불일치하면 integrity gate가 실패한다. 증빙 내용의 유효성은 각 entry의 `validatedBy`에 적힌 명령, 현재는 `npm run acquisition:audit`, 이 통과해야 인정한다. 상세 contract는 `docs/acquisition-data-room-integrity.md`를 따른다.

## Product

| 항목 | Evidence | 상태 |
|---|---|---|
| 제품 설명 | `README.md`, `docs/demo-scenario.md`, `docs/buyer-pitch-deck-outline.md` | ready |
| API 명세 | `docs/api-spec.md`, `docs/api-stability-contract.md` | ready |
| 온보딩 | `docs/onboarding.md`, `docs/pilot-readiness-checklist.md` | ready |
| 가격/계약 | `docs/pricing-draft.md`, `docs/terms-draft.md`, `docs/sla-and-support.md` | draft |
| Figma/FigJam 구매자 설명 자산 | `https://www.figma.com/board/8l2fELfENAABNhDTMEVJKt`, `artifacts/acquisition/figjam-value-map-verification.json`, `artifacts/acquisition/figjam-value-map-export.json` | declared; catalog-pinned immutable local export + receipt pending |

외부 URL은 그 자체로 final-gate evidence가 아니다. FigJam 자산은 source URL, canonical collection time, collector identity, provenance, retained artifact bytes/SHA-256을 담은 bounded local receipt와 실제 retained artifact가 함께 검증되어야 `present`가 된다. Receipt path는 `artifacts/acquisition/figjam-value-map-verification.json`, retained artifact path는 `artifacts/acquisition/figjam-value-map-export.json`으로 reviewed catalog에 각각 고정된다. Receipt가 canonical하더라도 다른 repository file을 `artifact.path`로 선택하면 검증에 실패한다. 그 전에는 `declared`이며 final gate를 충족하지 않는다.

## Technical

| 항목 | Evidence | 상태 |
|---|---|---|
| CI gate | `.github/workflows/ci.yml` | ready |
| CD gate | `.github/workflows/cd.yml` | ready; production evidence required |
| Readiness scan | `.github/workflows/readiness-scan.yml` | ready |
| Acquisition readiness scan | `.github/workflows/acquisition-readiness-scan.yml` | ready |
| Acquisition data-room integrity | `scripts/acquisition-data-room-integrity-audit.mjs`, `scripts/lib/acquisition-data-room-integrity.mjs`, `npm run acquisition:integrity` | ready; retained evidence still independently gated |
| Signed release supply chain | `.github/workflows/release-evidence.yml`, `scripts/release-evidence.mjs`, `docs/release-supply-chain.md`, `test/release-evidence.test.ts` | ready; per-tag artifact required |
| Attested production deployment | `.github/workflows/cd.yml`, `scripts/deployment-evidence.mjs`, `scripts/acquisition-deployment-evidence-audit.mjs`, `docs/deployment-provenance.md` | ready; per-release production artifact required |
| Production environment governance | `scripts/production-environment-governance-audit.mjs`, `artifacts/acquisition/production-environment-governance.json` | pending live evidence |
| Release verification | `npm run release:verify:strict` | pending production KPI |
| Production evidence preflight | `npm run production:preflight` | pending production inputs |
| Security scan | `npm run security:scan` | ready |
| Smoke check | `NOEMA_EXCHANGE_URL=<url> npm run smoke:check` | pending deployed URL |

각 release tag의 buyer data room에는 source archive, CycloneDX SBOM, `release-evidence.json`, `SHA256SUMS`, provenance/SBOM Sigstore bundle이 함께 있어야 한다. 이 bundle은 source 공급망을 증명하지만 production deployment를 증명하지 않는다.

Production deployment를 증명하려면 동일 release tag에 대해 다음 네 파일을 acquisition evidence 경로에 보존해야 한다.

```text
artifacts/acquisition/deployment-evidence.json
artifacts/acquisition/deployment-evidence.sigstore.json
artifacts/acquisition/deployment-attestation-verification.json
artifacts/acquisition/production-environment-governance.json
```

다음 명령은 selected release, commit SHA, production Worker, 100% traffic, immutable release, strict KPI, smoke, independent reviewer policy, signer workflow, GitHub Actions OIDC issuer, runner policy, deployment receipt digest를 교차 검증한다.

```bash
NOEMA_RELEASE_UNDER_DILIGENCE_TAG=v0.1.0 npm run acquisition:deployment-evidence
```

구매자는 구조 검증만 신뢰하지 말고 retained bundle을 독립적으로 검증해야 한다.

```bash
gh attestation verify deployment-evidence.json \
  --bundle deployment-evidence.sigstore.json \
  --repo ContextualWisdomLab/noema \
  --signer-workflow ContextualWisdomLab/noema/.github/workflows/cd.yml \
  --cert-oidc-issuer https://token.actions.githubusercontent.com \
  --predicate-type https://contextualwisdomlab.org/attestations/noema-deployment/v1 \
  --deny-self-hosted-runners
```

## Operations

| 항목 | Evidence | 상태 |
|---|---|---|
| Runbook | `docs/runbook.md` | ready |
| Deployment provenance/rollback | `docs/deployment-provenance.md`, `deployment-evidence.json`, `deployment-attestation-verification.json` | pending production deployment |
| Threat model | `docs/threat-model.md` | ready |
| Security checklist | `docs/security-validation-checklist.md`, `artifacts/security/security-validation-evidence.json` | pending evidence |
| Security evidence validator | `npm run security:evidence` | pending evidence |
| 30일 KPI | `exchange-30d.ndjson`, provenance JSON, `noema-kpi-evidence.json` | pending |
| Production 파일럿 | `docs/pilot-readiness-log.md` (`NOEMA URL`, `증빙 출처: production`, `계약/매출 증빙 경로`) | pending |
| Goal audit | `artifacts/saleable-readiness/<YYYYMMDD>/goal-audit.json` | pending |

Production 파일럿 로그는 `npm run acquisition:audit`에서도 직접 검증한다.
기본 경로는 `docs/pilot-readiness-log.md`이고, 별도 data-room 파일을 쓸 때는 `NOEMA_PILOT_LOG_PATH=<path>`로 지정한다.

## Commercial

`artifacts/acquisition/revenue-evidence.json`에는 `owner`, `source_documents`, 기본 45일 이내 `updated_at`이 있어야 한다.
작성 템플릿은 `docs/evidence-templates/revenue-evidence.example.json`이다. `replace-with-*`, `.example.json`, `docs/evidence-templates/` 값은 evidence로 인정하지 않는다.

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
작성 템플릿은 `docs/evidence-templates/transfer-evidence.example.json`이다. `replace-with-*`, `.example.json`, `docs/evidence-templates/` 값은 evidence로 인정하지 않는다.

| 항목 | Evidence | 상태 |
|---|---|---|
| License/dependency review | `artifacts/acquisition/transfer-evidence.json` | pending |
| GitHub App transfer | `artifacts/acquisition/transfer-evidence.json` | pending |
| Cloudflare worker/account/domain transfer | `artifacts/acquisition/transfer-evidence.json` | pending |
| Secrets rotation | `artifacts/acquisition/transfer-evidence.json` | pending |
| Privacy/customer data note | `artifacts/acquisition/transfer-evidence.json` | pending |
| Transfer execution plan | `docs/transfer-readiness-plan.md` | ready |

## Final Gate

20억 매각 readiness는 다음 명령이 모두 통과해야 한다.

```bash
npm run release:verify:strict
npm run readiness:audit
npm run acquisition:manifest
npm run acquisition:integrity
NOEMA_RELEASE_UNDER_DILIGENCE_TAG=v0.1.0 npm run acquisition:audit
```

또한 인수 대상 release tag마다 `release-evidence` workflow artifact와 두 release attestations, production deployment artifact, deployment attestation verification receipt, production environment governance report를 보존해야 한다. `deployment-evidence.sigstore.json`은 구매자가 `gh attestation verify`로 독립 검증해야 한다.
Review process 지연은 이 표에서 blocker가 아니다.
