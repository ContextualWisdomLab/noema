# Noema API 명세

## 공통 응답

- 성공 응답
```json
{
  "ok": true,
  "data": { /* endpoint payload */ },
  "trace_id": "uuid-v4"
}
```

- 실패 응답
```json
{
  "ok": false,
  "error_code": "ERR_*",
  "message": "human readable summary",
  "details": { "hint": "...", "path": "..." },
  "trace_id": "uuid-v4"
}
```

공통 응답 헤더:
- `content-type: application/json; charset=utf-8`
- `cache-control: no-store`
- `pragma: no-cache`
- `x-content-type-options: nosniff`
- `x-trace-id: <trace_id>`
- `x-latency-ms: <milliseconds>`

401 인증 실패 응답은 Bearer challenge를 포함한다.
- 인증 누락: `www-authenticate: Bearer realm="noema", error="invalid_request"`
- 유효하지 않은 토큰: `www-authenticate: Bearer realm="noema", error="invalid_token"`

## Endpoint

### `GET /health`
- 응답: `{ ok: true, data: { name: "noema" }, trace_id }`
- 코드: 200

### `POST /exchange`
헤더:
- `authorization: Bearer <github_actions_oidc_jwt>`
- `content-type: application/json` (선택)

요청 body (선택):
```json
{
  "target_repository": "owner/repository"
}
```

`application/json` 요청 body는 UTF-8 wire bytes 기준 최대 **8,192 bytes**다. `Content-Length`가 이 한도를 초과하면 body를 읽지 않고 413으로 거부하며, 길이 헤더가 없거나 신뢰할 수 없는 경우에도 stream을 최대 한도까지만 읽어 chunked 전송 우회를 차단한다. 이 검사는 OIDC/JWKS 조회, GitHub App private-key 사용, GitHub API 호출 전에 수행된다.

`target_repository`가 포함되면 문자열이어야 하며, `owner/repository` 형식과 허용된 organization owner를 만족해야 한다. 객체/배열/null 등 문자열이 아닌 값은 GitHub token 생성 전에 `ERR_VALIDATION_INPUT`으로 거부된다.

OIDC workflow trust는 전체 ref 문자열의 exact match 정책을 사용한다.
- `job_workflow_ref`가 있으면 이를 우선하고, 없으면 `workflow_ref`를 사용한다.
- 허용 값은 `ALLOWED_WORKFLOW_REF_PREFIX`에 설정된 단일 중앙 workflow 파일과 단일 branch/tag/commit ref이다. 변수명은 하위 호환을 위해 유지되지만 접두사 매칭은 하지 않는다.
- `...@refs/heads/main-attacker`처럼 허용 값과 접두사만 같은 ref는 GitHub App token 생성과 JWKS 조회 전에 403 `ERR_WORKFLOW_NOT_ALLOWED`로 차단된다.
- wildcard·쉼표·공백·불완전한 workflow/ref 구분자가 포함된 설정은 503으로 실패-폐쇄된다.
- 이 사전 점검은 deny-only이며, exact match 이후에도 RS256 서명, GitHub JWKS, issuer, audience, repository owner 및 기존 workflow 검증을 모두 통과해야 한다.

성공 응답 200:
```json
{
  "ok": true,
  "data": {
    "token": "ghs_xxx",
    "repository": "owner/repository",
    "workflow_ref": "owner/.github/.github/workflows/noema-review.yml@refs/...",
    "token_expires_at": "2026-07-02T05:00:00Z"
  },
  "trace_id": "uuid-v4"
}
```

대표 에러 코드:
- `ERR_AUTH_MISSING`, `ERR_AUTH_INVALID`, `ERR_TOKEN_MALFORMED`, `ERR_REPO_NOT_ALLOWED`, `ERR_WORKFLOW_NOT_ALLOWED`, `ERR_GITHUB_API`, `ERR_RATE_LIMIT`, `ERR_INTERNAL`

인증 실패 401:
- 인증 누락 헤더: `www-authenticate: Bearer realm="noema", error="invalid_request"`
- 유효하지 않은 토큰 헤더: `www-authenticate: Bearer realm="noema", error="invalid_token"`

Workflow trust 실패 403:
```json
{
  "ok": false,
  "error_code": "ERR_WORKFLOW_NOT_ALLOWED",
  "message": "OIDC workflow_ref is not allowed",
  "details": {
    "hint": "Run the request from the exact configured central workflow ref; prefix-sharing refs are rejected.",
    "match_policy": "exact"
  },
  "trace_id": "uuid-v4"
}
```

Method 제한 405:
- 허용 헤더: `allow: POST`

입력 타입 오류 400:
```json
{
  "ok": false,
  "error_code": "ERR_VALIDATION_INPUT",
  "message": "target_repository must be a string",
  "details": {
    "hint": "Check the endpoint, HTTP method, content-type, and JSON body.",
    "field": "target_repository",
    "reason": "must be a string",
    "received_type": "object"
  },
  "trace_id": "uuid-v4"
}
```

JSON body 한도 초과 413:
```json
{
  "ok": false,
  "error_code": "ERR_VALIDATION_INPUT",
  "message": "Exchange JSON body exceeds accepted bounds",
  "details": {
    "hint": "Send only the target_repository JSON field within the documented byte limit.",
    "policy": "bounded-exchange-json-body",
    "body_limit_bytes": "8192",
    "reason": "too_large"
  },
  "trace_id": "uuid-v4"
}
```

GitHub installation token 응답 오류 500:
```json
{
  "ok": false,
  "error_code": "ERR_GITHUB_INSTALLATION",
  "message": "GitHub installation token response did not include a valid expires_at",
  "details": {
    "hint": "Verify the GitHub App is installed on the target repository.",
    "field": "expires_at",
    "reason": "must be a valid timestamp"
  },
  "trace_id": "uuid-v4"
}
```

Rate limit 응답 429:
- 헤더: `retry-after: <seconds>`
```json
{
  "ok": false,
  "error_code": "ERR_RATE_LIMIT",
  "message": "Rate limit exceeded",
  "details": {
    "hint": "Back off and retry after the rate-limit window resets.",
    "retry_after_seconds": "60",
    "client_hash": "..."
  },
  "trace_id": "uuid-v4"
}
```
