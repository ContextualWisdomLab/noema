# Changelog

## Unreleased
- Noema reviewer와 중앙 대기 게이트가 GitHub Check Runs API를 페이지당 100건으로 끝까지 순회하도록 보강해 기본 30건/기존 100건 이후의 실패·대기 체크가 누락되는 승인 사각지대를 제거.
- `.github/workflows/hourly-commercial-readiness.yml`과 SHA-bound 유지보수 스크립트를 추가해 열린 PR의 review thread, current-head checks/status, Noema App verdict를 매시간 실패-폐쇄 방식으로 검사하고, 완전 검증된 PR만 squash merge하도록 자동화.
- Check Runs를 `filter=all`로 끝까지 수집하되 동일 suite·producer·이름의 재실행은 최신 attempt만 평가하고 서로 다른 suite의 동명 check는 모두 보존해, 과거 실패의 영구 차단과 중복 gate 누락을 동시에 방지.
- 필수·review-dependent check의 `app.slug=github-actions`를 검증해 제3자 App의 동일 이름 check가 병합 gate 또는 순환대기 예외를 위조하지 못하게 하고, `reviewer-ci`의 100% line/branch/docstring gate를 모든 PR에서 생성하도록 강화.
- 개발 의존성 `postcss`(vitest→vite 경유 transitive)를 `^8.5.18`로 override하여 GHSA-r28c-9q8g-f849(source map 자동 로딩 경로 순회, high) 취약점을 제거. `npm audit --audit-level=high`가 다시 0건으로 통과하여 매일 실패하던 `readiness-audit` 스케줄 및 `release:verify` 게이트를 복구.
- API 응답 스키마를 판매형 표준으로 정비: 성공/실패 공통 구조 및 `trace_id`, `error_code` 추가.
- OIDC 검증/권한 에러를 세분화한 실패 코드로 표준화.
- 구조화 로그(`http_request`) 도입: route, status_code, latency_ms, repository, workflow_ref, oidc_sub, error_code.
- `.github/workflows/ci.yml` 추가: 타입체크/테스트/의존성 감사 자동 게이트.
- KPI 게이트를 릴리스 파이프라인에 통합: `kpi:verify` 추가 및 `release:verify` 단계 편입(운영 NDJSON 유무에 따라 non-strict skip).
- KPI 증빙 게이트 강화: `kpi-gate`가 로그 미보유/실패 시에도 `NOEMA_KPI_EVIDENCE_PATH`에 증빙 JSON을 남기고, CD 배포에서 Artifacts로 보존.
- 온보딩/운영/SLA/가격/API 명세/안정성 계약 문서 초안 추가.
- 판매 가능성 완성 기준 문서를 Goal형으로 정비(`docs/saleable-program-readiness.md`)하고, CD 배포 스모크에 `/exchange` 401/Auth 누락 검증을 추가.
- 경보 계산 출력 스키마 정규화: `exchange_failure_rate`, `exchange_p95_latency_ms`를 중심 지표로 정합.
- `readiness:audit`를 목표형 완성 패스 체크로 정식 연결하고, `noema-kpi-evidence.json`/`noema-smoke-evidence.json` 증빙 여부까지 검증하도록 강화.
- 알림 계산기에 타임스탬프 미기재 로그 대응 폴백을 추가해 KPI 지표 산출의 오탐을 줄임.
- 성공 `/exchange` 응답에 `token_expires_at`을 추가하고, RS256 OIDC 검증부터 GitHub App 최소권한 installation token 요청까지 통합 테스트로 고정.
- `/exchange` 자체 rate limit을 추가해 반복 호출 시 429 `ERR_RATE_LIMIT`와 `Retry-After`를 반환하도록 보강.
- OIDC JWKS 및 GitHub App installation id TTL 캐시를 추가해 `/exchange` hot path의 반복 외부 조회를 줄임.
- `/exchange` 405 응답에 `Allow: POST`를 추가하고, `target_repository` 타입 오류와 GitHub installation token `expires_at` 오류를 필드 단위 details로 진단하도록 보강.
- cached OIDC JWKS에 incoming token `kid`가 없을 때 강제 refresh하는 회귀 테스트와, 성공 로그에서 `ghs_` token/inbound OIDC token이 누출되지 않는 회귀 테스트를 추가.
- installation token이 포함되는 `/exchange` 응답에 `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff` 보안 헤더를 추가하고 회귀 테스트로 고정.
- 배포 스모크가 `/health`와 `/exchange`의 no-store/nosniff 보안 헤더 및 `/exchange` 401 Bearer challenge까지 검증하도록 `smoke-readiness.sh`와 회귀 테스트를 보강.
- `/exchange` 401 응답에 `WWW-Authenticate: Bearer realm="noema"` challenge를 추가하고 인증 누락은 `invalid_request`, 잘못된 토큰은 `invalid_token`으로 구분.
- `x-request-id`/`x-correlation-id` 및 client IP 계열 헤더를 길이/문자 기준으로 제한해 로그 오염과 rate-limit key 폭주를 방지.
- `KRW 2,000,000,000` 매각 가능성 Goal 등록서, buyer due diligence index, library/submodule 경계 판단서를 추가하고 `npm run acquisition:audit`로 ARR/LOI/이전성/saleable evidence를 실패-폐쇄 방식으로 검증.
- 개발 의존성 `postcss`(vite 경유 transitive)를 `overrides`로 `^8.5.18`에 고정해 GHSA-r28c-9q8g-f849(소스맵 자동 로딩 경로 탐색으로 인한 임의 `.map` 파일 노출, High)를 제거하고 `npm run security:scan`(`npm audit --audit-level=high`) 게이트를 다시 green으로 복구.
