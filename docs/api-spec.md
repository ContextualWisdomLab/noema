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

`target_repository`가 포함되면 문자열이어야 하며, `owner/repository` 형식과 허용된 organization owner를 만족해야 한다. 객체/배열/null 등 문자열이 아닌 값은 GitHub token 생성 전에 `ERR_VALIDATION_INPUT`으로 거부된다.

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
