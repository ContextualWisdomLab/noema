# Noema 고객 온보딩 가이드

이 문서는 Noema를 상용 파일럿으로 붙이는 고객을 대상으로 합니다.

## 1. 사전 준비
- Cloudflare Workers 계정 및 배포 권한
- GitHub Organization/Repository 관리자 권한
- GitHub App `id`와 `PEM` private key
- `NOEMA` 워크플로에서 사용하는 OIDC `audience`

## 2. GitHub App 설치
1. GitHub App을 `ContextualWisdomLab/.github` 또는 동등한 중앙 레포지토리에 설치
2. 설치 권한 최소화
   - Pull requests: write
   - Checks: read
   - Contents: read
3. `GITHUB_APP_INSTALLATION_ID`는 선택값이며, 다수 앱 사용/회수성에 따라 지정

## 3. Worker 배포
- 비밀값 등록
  - `GITHUB_APP_ID`
  - `GITHUB_APP_PRIVATE_KEY_PEM`
  - `GITHUB_APP_INSTALLATION_ID`(선택)
- 공개 변수 등록
  - `ALLOWED_ISSUER` (기본: `https://token.actions.githubusercontent.com`)
  - `ALLOWED_AUDIENCE` (예: `cwl-noema-review`)
  - `ALLOWED_REPOSITORY_OWNER` (예: `ContextualWisdomLab`)
  - `ALLOWED_WORKFLOW_REPOSITORY` (예: `ContextualWisdomLab/.github`)
  - `ALLOWED_WORKFLOW_REF_PREFIX` (예: `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main`)
  - `GITHUB_API_BASE` (기본: `https://api.github.com`)
  - `NOEMA_RATE_LIMIT_PER_MINUTE` (기본: `60`, `/exchange` 클라이언트당 분당 요청 제한)
  - `NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS` (기본: `300`, OIDC JWKS 캐시)
  - `NOEMA_INSTALLATION_CACHE_TTL_SECONDS` (기본: `600`, repository installation id 캐시)

배포 후 `/health`와 `/exchange` 응답이 다음 스키마인지 확인합니다.

## 4. 계약 검증
1. `/health` 호출: 200 응답, `{ ok: true, data: { name: "noema" }, trace_id }`
2. `/exchange`에 Bearer 없이 호출: 401 `ERR_AUTH_MISSING`
3. `/exchange`에 정상 OIDC + 권한 조건 시 `ERR_*` 없이 토큰 반환
4. 반복 호출 제한 초과 시 429 `ERR_RATE_LIMIT` 및 `Retry-After` 헤더 확인

## 5. 파일럿 체크리스트
- 목표 리포지토리 1개 이상 연결
- 중앙 워크플로에서 `target_repository` 전달 규칙 확인
- 로그 집계에서 `trace_id`, `route`, `latency_ms`, `error_code`가 남는지 확인
- 장애 대응 책임자(고객/공급자)와 알림 채널 합의

## 6. 운영 전환
- 주간 리스크 리뷰에서 `/exchange` 실패율 임계치(2%, 파일럿 기준) 점검
- 재발행/회수 정책(키 교체 주기, 키 폐기 절차) 문서화 완료 후 정식 운영 전환
