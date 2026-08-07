# Noema API 명세

## 공통 응답

성공 응답:

```json
{
  "ok": true,
  "data": {},
  "trace_id": "uuid-v4"
}
```

실패 응답:

```json
{
  "ok": false,
  "error_code": "ERR_*",
  "message": "human readable summary",
  "details": { "hint": "..." },
  "trace_id": "uuid-v4"
}
```

공통 JSON 응답 헤더:

- `content-type: application/json; charset=utf-8`
- `cache-control: no-store`
- `pragma: no-cache`
- `x-content-type-options: nosniff`
- `x-trace-id: <trace_id>`
- `x-latency-ms: <milliseconds>`

401 인증 실패 응답은 Bearer challenge를 포함합니다.

- 인증 누락: `www-authenticate: Bearer realm="noema", error="invalid_request"`
- 유효하지 않은 토큰: `www-authenticate: Bearer realm="noema", error="invalid_token"`

## Endpoints

### `GET /health`

프로세스 liveness만 확인합니다. credential exchange가 사용 가능한지는 보장하지 않습니다.

- 코드: 200
- 응답: `{ ok: true, data: { name: "noema" }, trace_id }`

### `GET /ready`

외부 network call이나 token minting 없이 credential-exchange runtime binding을 검증합니다.

필수 offline check에는 다음이 포함됩니다.

- GitHub Actions issuer와 bounded audience
- repository owner와 central workflow repository
- 하나의 exact workflow ref
- canonical lowercase 40자리 `ALLOWED_WORKFLOW_SHA`
- exact GitHub Cloud API origin
- GitHub App identifiers와 import 가능한 PKCS#8 private key
- rate limiter와 OIDC replay guard Durable Object namespace

성공:

```json
{
  "ok": true,
  "data": {
    "name": "noema",
    "status": "ready",
    "checks": { "configuration": "pass" }
  },
  "trace_id": "uuid-v4"
}
```

실패 시 503 `ERR_SERVICE_NOT_READY`, `retry-after: 30`, `x-noema-readiness: not-ready`를 반환합니다. 응답에는 실패한 check identifier만 포함하며 설정값·SHA·private key를 반사하지 않습니다.

### `HEAD /ready`

`GET /ready`와 같은 decision과 헤더를 반환하지만 body는 없습니다.

### `POST /exchange`

헤더:

- `authorization: Bearer <github_actions_oidc_jwt>`
- `content-type: application/json` (body가 있으면 사용)

선택 body:

```json
{
  "target_repository": "owner/repository"
}
```

`application/json` 요청 body는 UTF-8 wire bytes 기준 최대 **8,192 bytes**입니다. `Content-Length`가 이 한도를 초과하면 body를 읽지 않고 413으로 거부하며, 길이 헤더가 없거나 신뢰할 수 없는 경우에도 stream을 최대 한도까지만 읽어 chunked 전송 우회를 차단합니다. 이 검사는 OIDC/JWKS 조회, GitHub App private-key 사용, GitHub API 호출 전에 수행됩니다.

`target_repository`가 포함되면 문자열이어야 하며, `owner/repository` 형식과 허용된 organization owner를 만족해야 합니다. 객체/배열/null 등 문자열이 아닌 값은 GitHub token 생성 전에 `ERR_VALIDATION_INPUT`으로 거부됩니다.

## Workflow source trust

OIDC workflow trust는 ref와 immutable workflow-file SHA의 pair를 사용합니다.

| 실행 형태 | 필요한 claim pair |
| --- | --- |
| 일반 caller workflow | `workflow_ref` + `workflow_sha` |
| reusable workflow | `job_workflow_ref` + `job_workflow_sha` |

- `ALLOWED_WORKFLOW_REF_PREFIX`는 하위 호환을 위한 변수명이며 실제로는 단일 전체 ref를 exact match합니다.
- `ALLOWED_WORKFLOW_SHA`는 해당 신뢰 workflow source를 포함하는 canonical lowercase 40자리 commit SHA입니다.
- `job_workflow_ref`가 존재하면 같은 OIDC token의 `job_workflow_sha`만 pair로 사용합니다. caller `workflow_sha`를 reusable ref에 대입하지 않습니다.
- `workflow_ref`가 선택되면 같은 token의 `workflow_sha`를 사용합니다.
- ref 또는 paired SHA가 누락·비정규·불일치하면 JWKS/GitHub App token 사용 전에 403 또는 잘못된 deployment binding의 경우 503으로 실패-폐쇄합니다.
- `...@refs/heads/main-attacker`처럼 prefix만 공유하는 ref도 차단됩니다.
- wildcard·쉼표·공백·불완전한 workflow/ref 구분자 또는 noncanonical SHA 설정은 503입니다.
- wrapper의 exact ref/SHA 사전 점검을 통과한 뒤에도 core verifier의 RS256 서명, GitHub JWKS, issuer, audience, repository owner, expiry 검증을 모두 요구합니다.

성공 응답 200:

```json
{
  "ok": true,
  "data": {
    "token": "ghs_xxx",
    "repository": "owner/repository",
    "workflow_ref": "owner/.github/.github/workflows/noema-review.yml@refs/heads/main",
    "token_expires_at": "2026-07-02T05:00:00Z"
  },
  "trace_id": "uuid-v4"
}
```

응답의 `token`은 caller가 보관·로그·model input으로 전달해서는 안 되는 short-lived credential입니다.

대표 에러 코드:

- `ERR_AUTH_MISSING`
- `ERR_AUTH_INVALID`
- `ERR_AUTH_REPLAY`
- `ERR_TOKEN_MALFORMED`
- `ERR_OIDC_VERIFICATION`
- `ERR_REPO_NOT_ALLOWED`
- `ERR_WORKFLOW_NOT_ALLOWED`
- `ERR_GITHUB_API`
- `ERR_GITHUB_INSTALLATION`
- `ERR_RATE_LIMIT`
- `ERR_VALIDATION_INPUT`
- `ERR_INTERNAL`

Workflow ref 또는 SHA 불일치 403:

```json
{
  "ok": false,
  "error_code": "ERR_WORKFLOW_NOT_ALLOWED",
  "message": "OIDC workflow SHA is not allowed",
  "details": {
    "hint": "Run the request from the exact reviewed workflow source commit configured by the operator.",
    "match_policy": "exact"
  },
  "trace_id": "uuid-v4"
}
```

Workflow trust deployment binding 누락·오류 503:

```json
{
  "ok": false,
  "error_code": "ERR_WORKFLOW_NOT_ALLOWED",
  "message": "Workflow trust configuration unavailable",
  "details": {
    "hint": "Configure one concrete workflow file at one exact ref and its immutable 40-character workflow SHA.",
    "match_policy": "exact"
  },
  "trace_id": "uuid-v4"
}
```

Method 제한 405:

- `/exchange`: `allow: POST`
- `/ready`: `allow: GET, HEAD`

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

Distributed rate limit 응답 429:

헤더:

- `retry-after: <seconds>`
- `x-rate-limit-limit: <limit>`
- `x-rate-limit-remaining: 0`
- `x-rate-limit-scope: distributed`

```json
{
  "ok": false,
  "error_code": "ERR_RATE_LIMIT",
  "message": "Rate limit exceeded",
  "details": {
    "hint": "Back off and retry after the distributed rate-limit window resets.",
    "retry_after_seconds": "60",
    "scope": "distributed"
  },
  "trace_id": "uuid-v4"
}
```

Raw client IP, bucket hash, bearer token, OIDC `jti`, App private key는 public response에 포함하지 않습니다.
