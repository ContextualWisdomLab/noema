# Noema 고객 온보딩 가이드

이 문서는 Noema를 상용 파일럿으로 붙이는 고객을 대상으로 합니다.

## 1. 사전 준비
- Cloudflare Workers 계정 및 배포 권한
- GitHub Organization/Repository 관리자 권한
- GitHub App `id`와 `PEM` private key
- `NOEMA` 워크플로에서 사용하는 OIDC `audience`
- 신뢰할 중앙 workflow file의 exact ref와 독립 검토된 40자리 commit SHA

## 2. GitHub App 설치
1. GitHub App을 `ContextualWisdomLab/.github` 또는 동등한 중앙 레포지토리에 설치
2. 설치 권한 최소화
   - Pull requests: write
   - Checks: read
   - Contents: read
3. `GITHUB_APP_INSTALLATION_ID`는 선택값이며, 다수 앱 사용/회수성에 따라 지정
4. reviewer App과 repository-maintenance App은 별도 identity와 key로 운영

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
  - `ALLOWED_WORKFLOW_REF_PREFIX` (이름과 달리 prefix가 아닌 exact ref; 예: `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main`)
  - `ALLOWED_WORKFLOW_SHA` (위 workflow file을 포함하는 검토된 exact commit SHA; lowercase hexadecimal 40자)
  - `GITHUB_API_BASE` (기본: `https://api.github.com`)
  - `NOEMA_RATE_LIMIT_PER_MINUTE` (기본: `60`, `/exchange` 클라이언트당 분당 요청 제한)
  - `NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS` (기본: `300`, OIDC JWKS 캐시)
  - `NOEMA_INSTALLATION_CACHE_TTL_SECONDS` (기본: `600`, repository installation id 캐시)

branch 또는 tag ref만 일치시키거나 `ALLOWED_WORKFLOW_SHA`를 생략하면 `/ready`와 `/exchange`가 실패-폐쇄합니다. reusable workflow는 OIDC의 `job_workflow_ref`와 `job_workflow_sha`, 일반 caller workflow는 `workflow_ref`와 `workflow_sha`가 각각 배포 설정과 일치해야 합니다.

## 4. 계약 검증
1. `GET /health`: 200 응답, `{ ok: true, data: { name: "noema" }, trace_id }` — liveness만 의미
2. `GET /ready`: 200 응답과 `x-noema-readiness: ready`; exact workflow SHA가 누락·불일치하면 503
3. `HEAD /ready`: GET과 같은 readiness decision, body 없음
4. `/exchange`에 Bearer 없이 호출: 401 `ERR_AUTH_MISSING`
5. exact ref/SHA pair를 가진 정상 OIDC + 권한 조건에서 `ERR_*` 없이 repository-scoped token 반환
6. 다른 SHA, claim-family 혼합 또는 prefix-sharing ref는 credential 발급 전에 차단
7. 반복 호출 제한 초과 시 429 `ERR_RATE_LIMIT` 및 `Retry-After` 헤더 확인

## 5. 중앙 workflow 변경 절차
1. 중앙 workflow 변경 PR에 required checks와 독립 검토 적용
2. 병합된 exact commit SHA와 workflow file path를 기록
3. Noema의 `ALLOWED_WORKFLOW_SHA`를 새 reviewed commit으로 변경하는 별도 배포 변경 검토
4. `/ready`가 새 binding을 인식하는지 확인
5. 새 OIDC token의 paired SHA로 `/exchange` smoke 수행
6. 이전 SHA token이 차단되는지 negative test 수행

ref wildcard, prefix 확장, SHA 검증 제거 또는 caller SHA와 reusable ref의 혼합은 긴급 복구 방법으로 사용하지 않습니다.

## 6. 파일럿 체크리스트
- 목표 리포지토리 1개 이상 연결
- 중앙 워크플로에서 `target_repository` 전달 규칙 확인
- workflow ref/SHA rotation owner와 승인 절차 지정
- 로그 집계에서 `trace_id`, `route`, `latency_ms`, `error_code`가 남는지 확인
- bearer token, App private key, raw `jti`, raw client IP가 로그에 남지 않는지 확인
- 장애 대응 책임자(고객/공급자)와 알림 채널 합의

## 7. 운영 전환
- 주간 리스크 리뷰에서 `/exchange` 실패율 임계치(2%, 파일럿 기준) 점검
- 재발행/회수 정책(키 교체 주기, 키 폐기 절차) 문서화 완료
- central workflow source rotation과 App key rotation을 서로 다른 절차로 검증
- protected production environment, independent deployment approval, rollback evidence 확인 후 정식 운영 전환
