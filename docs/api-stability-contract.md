# API 안정성 계약 (Noema)

## 공통 응답 포맷

성공 응답은 최소한 다음 형태를 따른다.

```json
{
  "ok": true,
  "data": { ... },
  "trace_id": "uuid-v4"
}
```

실패 응답은 다음 형태를 따른다.

```json
{
  "ok": false,
  "error_code": "ERR_xxx",
  "message": "사용자 대상 짧은 메시지",
  "details": {
    "field": "옵션 필드",
    "hint": "권장 조치"
  },
  "trace_id": "uuid-v4"
}
```

HTTP 상태 코드는 아래 규칙을 따른다.

- `400` 잘못된 요청/파싱/검증 실패
- `401` 인증 누락 또는 Bearer 형식 오류
- `403` 승인되지 않은 리포지토리/워크플로
- `429` `/exchange` 클라이언트별 호출 제한 또는 GitHub API 호출 제한
- `500` 예상치 못한 런타임 오류 또는 GitHub App installation 응답 결함
- `502` GitHub OIDC/JWKS 또는 GitHub API upstream 일시 장애

모든 JSON 응답은 `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, `X-Trace-Id`, `X-Latency-Ms`를 포함한다.
`X-Trace-Id`는 `x-request-id` 또는 `x-correlation-id`가 128자 이하의 허용 문자(`A-Z`, `a-z`, `0-9`, `.`, `_`, `:`, `-`)로만 구성된 경우에만 반영하며, 그 외에는 서버 생성 UUID를 사용한다.
특히 `/exchange` 성공 응답은 installation token을 포함하므로 중간 캐시/브라우저 캐시에 저장되면 안 된다.
`/exchange` 401 응답은 `WWW-Authenticate: Bearer realm="noema"` challenge를 포함하며, 인증 누락은 `error="invalid_request"`, 잘못된 토큰은 `error="invalid_token"`으로 구분한다.
`/exchange`는 `POST`만 허용하며, 405 응답은 `Allow: POST` 헤더를 포함한다.
`target_repository` 타입 오류는 GitHub token 생성 전에 `details.field="target_repository"`, `details.reason`, `details.received_type`로 반환한다.
GitHub installation token 응답의 `token`/`expires_at` 결함은 `ERR_GITHUB_INSTALLATION`과 필드 단위 `details.field`로 반환한다.

## 에러 코드 표준

- `ERR_VALIDATION_INPUT`
- `ERR_AUTH_MISSING`
- `ERR_AUTH_INVALID`
- `ERR_REPO_NOT_ALLOWED`
- `ERR_WORKFLOW_NOT_ALLOWED`
- `ERR_TOKEN_MALFORMED`
- `ERR_OIDC_VERIFICATION`
- `ERR_GITHUB_API`
- `ERR_GITHUB_INSTALLATION`
- `ERR_RATE_LIMIT`
- `ERR_INTERNAL`

각 에러는 `details`에 운영자가 즉시 판단 가능한 `hint`를 포함한다.
`ERR_RATE_LIMIT`은 `Retry-After` 헤더와 `details.retry_after_seconds`를 포함한다.

## 운영 로그 필드(필수)

모든 요청은 최소 아래 필드를 남긴다.

- `trace_id`: 요청 추적키
- `route`: `"/health"` 또는 `"/exchange"`
- `method`
- `status_code`
- `error_code` (실패 시)
- `repository` (가능 시)
- `workflow_ref` (가능 시)
- `token_expires_at` (성공 시)
- `latency_ms`
- `oidc_sub` (해시 처리 후 식별자)
- `requester_ip`(옵션)
- `request_user_agent`(옵션)

민감 정보(토큰/시크릿/비밀키)는 로그에 기록하지 않는다.
성공 경로 회귀 테스트는 발급된 `ghs_` token과 inbound OIDC token이 구조화 로그에 포함되지 않음을 검증한다.

## 구현 우선순위

1. `error_code` 기반 응답 구조 적용
2. 기존 문자열 에러(`String(error)`)를 표준 스키마로 교체
3. 실패별 분류를 `ERR_*` 코드로 매핑
4. `latency_ms`, `trace_id`를 응답 헤더와 로그 양쪽에 부여
