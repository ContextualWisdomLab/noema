# Noema Buyer Pitch Deck Outline

이 문서는 Figma Slides 또는 구매자 미팅 자료로 옮길 `KRW 2,000,000,000` 매각 readiness 피치 구조다.
현재 가격 달성을 주장하지 않고, 구매자가 어떤 증거를 확인해야 하는지와 어떤 게이트가 자동화되어 있는지를 설명한다.

Figma Code Connect는 사용하지 않는다.
FigJam value map: `https://www.figma.com/board/8l2fELfENAABNhDTMEVJKt`

## Slide 1: Noema

- `KRW 2,000,000,000` acquisition readiness
- Status snapshot: `2026-07-02`
- Target is evidence-gated, not claimed complete

## Slide 2: Buyer Problem

- GitHub Actions의 장기 secret은 회수, 회전, 감사가 어렵다.
- 보안 민감 platform team은 scoped, short-lived token 발급을 원한다.
- 중앙 리뷰 workflow는 독립 GitHub App identity가 필요하지만 broad credential 노출은 피해야 한다.

## Slide 3: Product Answer

- GitHub Actions가 OIDC token을 요청한다.
- Noema가 issuer, audience, owner, trusted workflow identity를 검증한다.
- 검증된 요청만 GitHub App installation token으로 교환한다.
- 중앙 workflow가 독립 App identity로 review verdict를 제출한다.

## Slide 4: Packaged Product Assets

- API spec, stability contract, onboarding, deployment guide
- Runbook, threat model, security validation checklist
- SLA/support, pricing draft, terms draft
- Demo scenario, pilot checklist, readiness audits

## Slide 5: Readiness Gates

- `npm run release:verify`: typecheck, tests, security scan, KPI non-strict, data-room manifest
- `npm run readiness:audit`: saleable program gate; production KPI와 paid pilot evidence 필요
- `npm run acquisition:manifest`: buyer data-room file hash, command, external asset 색인
- `npm run acquisition:audit`: revenue, transfer, saleable readiness, manifest final gate 검증

## Slide 6: KRW 2B Price Defense

- ARR route:
  - ARR `>= KRW 300,000,000`
  - gross margin `>= 70%`
  - paid customers `>= 3`
  - top-1 customer concentration `< 60%`
- Strategic pipeline route:
  - weighted pipeline `>= KRW 500,000,000`
  - LOI 또는 paid PoC intent `>= 3`
  - paid customer `>= 1`
- 두 route 모두 `owner`, `source_documents`, fresh `updated_at` evidence가 필요하다.

## Slide 7: Pending Evidence

- 30일 production KPI log와 provenance
- production paid pilot proof: HTTPS Noema URL, production source, revenue/contract path
- revenue evidence JSON: ARR 또는 strategic pipeline route
- transfer evidence JSON: license, GitHub App, Cloudflare, secrets, owner, privacy

Review process 지연은 blocker가 아니라 risk note다.

## Slide 8: Execution Path

- PR #4: main acquisition readiness gate
- PR #6: stacked manifest validation follow-up
- Evidence path를 채운 뒤 `release:verify:strict`, `readiness:audit`, `acquisition:manifest`, `acquisition:audit`를 순서대로 통과시킨다.
- 구매자 reliance는 위 네 gate가 모두 통과한 뒤에만 허용한다.
