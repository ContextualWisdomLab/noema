# GitHub API egress 신뢰 경계

Noema는 검증된 GitHub Actions OIDC token을 repository 범위의 GitHub App
installation token으로 교환합니다. 따라서 Worker는 수명이 짧은 GitHub App
JWT와 installation-token 요청을 검토된 GitHub Cloud REST API origin으로만
전송해야 합니다.

## 정책

production entrypoint는 `GITHUB_API_BASE`가 다음 GitHub Cloud root origin의
허용된 원본 형태와 정확히 일치할 때만 받아들입니다.

```text
https://api.github.com
```

기본 HTTPS port `:443`과 선택적 trailing slash는 허용합니다. HTTP, URL
userinfo, non-default port, path, query string, fragment, malformed value,
앞뒤 공백, 대소문자 변형 및 lookalike hostname은 거부합니다. URL parser가
`.` 또는 percent-encoded dot segment를 `/`로 정규화하기 전의 원본 문자열도
검증하므로 root가 아닌 경로가 root로 오인되지 않습니다. 거부된 설정값은
응답이나 로그에 반영하지 않습니다.

GitHub Enterprise Server 또는 별도 API gateway는 암묵적으로 지원하지
않습니다. 이를 지원하려면 exact host, TLS·DNS 소유권, GitHub App tenant,
credential rotation, audit logging, 배포별 테스트를 포함하는 별도 신뢰
정책을 검토해야 합니다. GitHub Cloud 정책을 suffix, substring 또는
caller-provided allowlist 방식으로 완화해서는 안 됩니다.

참고 자료:

- https://docs.github.com/en/rest/apps/installations
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/rest/about-the-rest-api/api-versions

## 실패 동작

이 gate는 `/exchange`에만 적용됩니다. `GITHUB_API_BASE`가 없거나 신뢰할 수
없으면 entrypoint는 distributed rate-limit lookup, OIDC parsing, GitHub App
private-key 사용 및 outbound GitHub 요청 전에 `503 ERR_GITHUB_API`를
반환합니다. 응답은 cache할 수 없으며, 설정 URL을 노출하지 않고 bounded
trace identifier와 `github-cloud-exact-origin` policy 이름만 포함합니다.

운영자가 설정을 복구하는 동안에도 `/health`와 일반 JSON 404 동작은
유지됩니다. 구조화된 `github_api_egress` 로그에는 route, method, status,
error code, outcome, policy만 기록합니다.

## 배포 검증

production 승격 전에 다음을 확인합니다.

1. `wrangler.toml`이 `main = "src/entrypoint.ts"`를 사용하는지 확인합니다.
2. 배포된 Worker 설정의 `GITHUB_API_BASE = "https://api.github.com"`을
   확인합니다.
3. non-production 환경에서 lookalike hostname을 임시 설정하고 GitHub API
   호출 없이 `/exchange`가 `503 ERR_GITHUB_API`를 반환하는지 확인합니다.
4. exact GitHub Cloud origin을 복원한 뒤 표준 authenticated `/exchange`
   smoke test가 기존 rate-limit, OIDC, replay 및 installation-token 통제를
   통과하는지 확인합니다.
5. 배포 설정과 smoke evidence를 release evidence package와 함께 보존합니다.

## 롤백

credential-bearing GitHub API 요청 앞에 동등한 exact-origin egress gate가
있는 release로만 롤백합니다. 검증하지 않은 runtime 값을 GitHub App JWT 또는
installation-token 요청 URL에 연결하는 entrypoint로 롤백해서는 안 됩니다.
현재 배포의 설정이 잘못된 경우 gated entrypoint를 유지한 채 Worker 변수를
먼저 복구합니다.
