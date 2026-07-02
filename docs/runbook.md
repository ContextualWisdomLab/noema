# Noema 운영 Runbook

## 공통 대응 원칙
- 기본 로그는 구조화된 JSON(`event: "http_request"`)으로 남깁니다.
- `trace_id`를 기준으로 요청, 에러, 장애 대응을 상호 연결합니다.
- 토큰 응답/비밀번호/비밀키를 절대로 로그에 출력하지 않습니다.

## 장애 대응 우선순위

### 1) `/exchange` 5xx 급증
1. 최근 15분 로그에서 `route=/exchange`의 `status_code >= 500` 빈도를 확인
2. GitHub API 상태(외부 장애) 또는 OIDC JWKS 장애 판단
3. `ERR_GITHUB_INSTALLATION`이면 `details.field` 확인: `token`은 빈 token 응답, `expires_at`은 만료시각 파싱 실패
4. `wrangler tail --format json` 또는 Cloudflare 로그로 동일 `trace_id` 집계
5. 복구 실패 시 `/health` 정상 여부 확인 후 즉시 고객 공지

### 2) 인증 실패 급증
1. `error_code` 중 `ERR_AUTH_INVALID`, `ERR_TOKEN_MALFORMED` 비율을 확인
2. 중앙 워크플로 `workflow_ref` 변경/권한 오정렬 여부 확인
3. `ALLOWED_WORKFLOW_REF_PREFIX`, `ALLOWED_AUDIENCE` 값 재점검
4. `ERR_OIDC_VERIFICATION`이 signing `kid` 변경 시점과 맞물리면 JWKS refresh 이후 재시도 여부 확인
5. 필요 시 임시적으로 허용 prefix를 협의 후 원복

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
1. `details.client_hash` 기준으로 동일 클라이언트 반복 호출 여부 확인
2. 고객 워크플로 재시도 설정이 `Retry-After` 헤더를 존중하는지 확인
3. 정상 트래픽이면 `NOEMA_RATE_LIMIT_PER_MINUTE` 상향 또는 Cloudflare WAF allowlist를 검토
4. 비정상 트래픽이면 고객/소스 IP 단위 차단 정책을 적용

## DR/Recovery
1. 장애 발생 시 즉시 직전 버전으로 롤백 (`wrangler rollback` 또는 CI 배포 정지)
2. Secret 회수 필요 시 기존 PEM을 폐기하고 새 App key로 교체
3. 새 키는 1회성 채널로 전달 후, 이전 키는 24시간 내 폐기
4. 24시간 내 복구 리포트와 대응원인/재발 방지 액션 기록
