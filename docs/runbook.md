# Noema 운영 Runbook

## 공통 대응 원칙
- 기본 로그는 구조화된 JSON(`event: "http_request"`)으로 남깁니다.
- `trace_id`를 기준으로 요청, 에러, 장애 대응을 상호 연결합니다.
- 토큰 응답/비밀번호/비밀키를 절대로 로그에 출력하지 않습니다.
- `ALLOWED_WORKFLOW_REF_PREFIX`는 이름과 달리 prefix 허용 목록이 아니라 **하나의 exact workflow ref**입니다.
- 중앙 workflow 변경은 `ALLOWED_WORKFLOW_REF_PREFIX`와 `ALLOWED_WORKFLOW_SHA`를 검토된 ref/SHA pair로 함께 갱신합니다. wildcard, prefix 확장 또는 SHA 검증 제거는 장애 대응 수단이 아닙니다.

## 장애 대응 우선순위

### 1) `/exchange` 5xx 급증
1. 최근 15분 로그에서 `route=/exchange`의 `status_code >= 500` 빈도를 확인
2. GitHub API 상태(외부 장애) 또는 OIDC JWKS 장애 판단
3. `ERR_GITHUB_INSTALLATION`이면 `details.field` 확인: `token`은 빈 token 응답, `expires_at`은 만료시각 파싱 실패
4. `outcome=misconfigured`이면 `/ready`의 failed check와 local binding 형식(`ALLOWED_WORKFLOW_REF_PREFIX`, `ALLOWED_WORKFLOW_SHA`)을 확인
5. `wrangler tail --format json` 또는 Cloudflare 로그로 동일 `trace_id` 집계
6. 복구 실패 시 `/health` 정상 여부와 `/ready` 실패 check를 분리 확인한 뒤 즉시 고객 공지

### 2) 인증 실패 급증
1. `error_code` 중 `ERR_AUTH_INVALID`, `ERR_TOKEN_MALFORMED`, `ERR_WORKFLOW_NOT_ALLOWED` 비율을 확인
2. reusable workflow이면 OIDC token에 `job_workflow_ref`와 `job_workflow_sha`가 함께 있는지 확인; 일반 caller workflow이면 `workflow_ref`와 `workflow_sha`를 확인
3. 403 `outcome=blocked`이면 token의 paired ref/SHA와 live workflow source가 의도적으로 변경됐는지 PR·commit·CODEOWNERS evidence로 확인
4. `ALLOWED_WORKFLOW_REF_PREFIX`, `ALLOWED_WORKFLOW_SHA`, `ALLOWED_AUDIENCE`를 현재 검토된 계약과 대조
5. reusable workflow token에는 caller의 표준 workflow pair와 호출된 workflow의 job pair가 함께 존재할 수 있으므로, `job_workflow_ref`는 반드시 같은 token의 `job_workflow_sha`와 검증하고 caller SHA로 대체하지 않음
6. `ERR_OIDC_VERIFICATION`이 signing `kid` 변경 시점과 맞물리면 JWKS refresh 이후 재시도 여부 확인
7. 긴급 복구에서도 ref-only 신뢰, wildcard, `main*`, 다른 claim pair의 SHA 대체를 사용하지 않음
8. 변경이 필요하면 새 exact pair를 별도 검토·배포하고 `/ready`와 실제 `/exchange` smoke를 재검증

### 3) 입력 검증 오류 증가
1. `ERR_VALIDATION_INPUT` 중 `details.field=target_repository` 비율을 확인
2. 고객 workflow가 `target_repository`를 문자열 `owner/repository`로 전달하는지 확인
3. Method 오류가 반복되면 호출자가 `/exchange`에 `POST`를 사용하고 405의 `Allow: POST`를 반영하는지 확인

### 4) 레이턴시 임계치 초과
1. `p95 latency_ms`를 대시보드로 확인
2. GitHub API 호출 실패 반복 여부 확인
3. 네트워크/Cloudflare 전송량 변화와 연결
4. 필요시 캐싱 정책과 배포 지역 분산 검토

### 5) `ERR_RATE_LIMIT` 증가
1. bounded hashed client bucket 기준으로 동일 클라이언트 반복 호출 여부 확인; raw IP나 bearer token을 로그에 추가하지 않음
2. 고객 워크플로 재시도 설정이 `Retry-After` 헤더를 존중하는지 확인
3. 정상 트래픽이면 `NOEMA_RATE_LIMIT_PER_MINUTE` 변경의 abuse budget·capacity 영향을 검토
4. 비정상 트래픽이면 Cloudflare edge/WAF의 별도 origin policy를 적용하되 Noema 내부 fail-closed limiter를 제거하지 않음

### 6) Durable Object alarm cleanup 이상
1. `NoemaRateLimiter`와 `NoemaOidcReplayGuard`의 현재 SQLite state와 예약된 alarm을 목적별로 분리 확인
2. alarm은 at-least-once이며 handler 예외 시 최대 6회 자동 retry임을 고려
3. 자동 retry가 소진될 수 있으므로 현재 window/claim deadline을 다시 읽고 explicit reschedule이 수행됐는지 확인
4. delayed alarm이 나중에 생성된 active state를 삭제하지 않았는지 회귀 증거와 로그를 대조
5. 상태 삭제나 migration은 raw credential 없이 최소 state만 대상으로 하며 임의 database reset을 기본 복구로 사용하지 않음

## DR/Recovery
1. 장애 발생 시 immutable deployment evidence에서 검증된 직전 Worker version으로 롤백하고 새 traffic state를 확인
2. Secret 회수 필요 시 기존 PEM을 폐기하고 새 App key로 교체
3. 새 키는 1회성 채널로 전달 후, 이전 키는 24시간 내 폐기
4. workflow source compromise가 의심되면 `ALLOWED_WORKFLOW_SHA`를 임의 SHA로 바꾸지 말고 `/exchange` traffic을 중단한 뒤 중앙 workflow source를 독립 검토
5. 24시간 내 복구 리포트와 원인·영향·재발 방지·credential/source rotation evidence를 기록