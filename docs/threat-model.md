# Noema Threat Model (초안)

## 주요 자산
- GitHub App 비밀키(`GITHUB_APP_PRIVATE_KEY_PEM`)
- OIDC 검증 신뢰성
- 발급되는 설치 토큰(`contents`/`pull_requests` 권한 범위)
- 감사 로그(trace_id, 에러 코드, 레이턴시)
- Cloudflare Worker isolate의 128MB 메모리와 요청 처리 가용성

## Continuation dispatch boundary

`POST /v1/continuation-dispatches`는 mutable alias/TOCTOU, repository/workflow identity confusion, stale PR evidence, replay, caller-selected destination/event, broad GitHub capability exfiltration, duplicate effect와 indeterminate outcome을 위협으로 다룬다. Exact URL, closed JSON, OIDC workflow SHA, fresh PR, fixed event, terminal state와 RFC 8785/Ed25519 receipt를 결합하며 GitHub credential을 반환하지 않는다. Retry 1/2는 하나의 logical-effect owner에서 직렬화되고 complete-digest drift는 conflict다. Central App credential 준비는 durable pre-dispatch commit보다 먼저 끝내며, 준비/commit 실패는 reservation을 해제하고 external effect 없이 실패-폐쇄한다. Commit 뒤 crash/finalization failure는 retained indeterminate evidence 때문에 재dispatch를 허용하지 않는다. Commit 전 crash로 고립된 reservation만 retained OIDC authorization `exp`의 정확한 alarm에서 회수하며 terminal evidence는 보존한다. 임의 timeout·retry 횟수·fallback은 recovery authority가 아니다. GitHub live-read와 repository-dispatch 사이를 원자화할 수 없으므로 event는 exact expected head/base/ref를 보존하며, downstream `.github#2540`은 실행 직전 이를 다시 검증해야 한다. Missing state/signing/App/replay authority와 ambiguous outcome은 실패-폐쇄한다.

## 위협
1. 위조된 OIDC 토큰으로 허가되지 않은 토큰 발급 시도
2. JWT 페이로드 위변조 또는 만료 토큰 재사용
3. 중앙 워크플로 권한 변경을 통한 권한 상승
4. 신뢰된 ref와 접두사만 같은 브랜치·태그(예: `main-attacker`)를 이용한 workflow trust 우회
5. 로그 유출을 통한 민감 토큰 노출
6. Cloudflare가 허용하는 대용량 또는 chunked JSON request를 이용한 isolate 메모리·CPU 고갈
7. GitHub OIDC/JWKS 또는 GitHub App API subrequest가 응답하지 않아 `/exchange` 요청과 Worker 자원을 장시간 점유하는 가용성 저하
8. 신뢰된 GitHub endpoint가 과대 또는 길이 미상 response body를 반환해 `response.json()` 이전에 isolate 메모리를 고갈시키는 가용성 저하
9. Claude community plugin 마켓플레이스 메타데이터, Anthropic 리뷰, 가변 브랜치/태그, 또는 플러그인 지시문을 런타임 권한으로 승격하려는 시도

## 대응
- `iss`, `aud`, `repository_owner`, `workflow_ref` 엄격 검증
  - 기본값은 중앙 workflow 파일과 `refs/heads/main`까지 고정함
  - 배포 entrypoint는 서명 검증 전에 OIDC payload를 deny-only 방식으로 점검하고, `ALLOWED_WORKFLOW_REF_PREFIX`의 역사적 변수명과 무관하게 전체 `job_workflow_ref` 또는 `workflow_ref`가 설정값과 바이트 단위로 정확히 일치할 때만 후속 서명 검증으로 진행함
  - 설정값에 wildcard, 쉼표, 공백, 누락된 workflow/ref 구분자가 있으면 503으로 실패-폐쇄하며, `main-attacker`처럼 접두사만 공유하는 ref는 403 `ERR_WORKFLOW_NOT_ALLOWED`로 차단함
  - 사전 점검은 미검증 claim을 승인 근거로 사용하지 않으며, 정확히 일치하는 경우에도 기존 RS256/JWKS 검증과 issuer/audience/repository 검증을 반드시 통과해야 함
- OIDC 캐시 및 키 조회 실패 시 502 실패로 중단
- credential-bearing outbound fetch를 요청별 10초 deadline으로 제한
  - exact GitHub API/OIDC allowlist와 manual redirect 정책을 통과한 subrequest에도 독립 `AbortSignal` deadline을 결합함
  - 호출자가 이미 제공한 `Request.signal` 또는 `RequestInit.signal`을 함께 보존하여 client cancellation을 timeout으로 오분류하지 않음
  - deadline 초과 시 원격 body·redirect를 전달하지 않는 bodyless `504` 정책 응답으로 변환하며, timer는 성공·실패 후 즉시 정리함
  - 근거: Cloudflare Workers Fetch API는 `RequestInit.signal`을 통한 subrequest 취소를 지원하고 `AbortSignal.any()`를 제공함
- credential-bearing outbound response body를 1,048,576 wire bytes로 제한
  - 유효한 `Content-Length`가 한도를 넘으면 JSON parser에 전달하지 않고 body를 취소한 뒤 bodyless `502 blocked-response-size`로 실패-폐쇄함
  - 길이 헤더가 없거나 비정상인 경우에도 response stream을 bounded-read하며 1,048,577번째 byte에서 읽기와 upstream body를 취소함
  - 정상 범위 body만 고정 길이 `Uint8Array`로 재구성하고 원격 `Content-Length`를 제거한 뒤 기존 OIDC/JWKS 및 GitHub API parser에 전달함
  - oversized body의 원문, GitHub token, discovery/JWKS 내용은 응답·로그에 기록하지 않음
  - 근거: Cloudflare Workers response body에는 플랫폼 크기 제한이 없지만 isolate 메모리는 128MB이며, 공식 best practice는 전체 body buffering 전에 크기 제한 또는 streaming을 적용하도록 권고함
- `/exchange`의 `application/json` body를 8,192 wire bytes로 제한
  - 신뢰할 수 있는 `Content-Length`가 한도를 넘으면 body를 읽지 않고 413으로 거부함
  - `Content-Length`가 없거나 잘못되어도 stream을 bounded-read하고 8,193번째 byte에서 취소하여 chunked 우회를 차단함
  - 검증된 작은 body만 새 Request로 재구성해 downstream JSON parser로 전달하며 원본 `Content-Length`는 제거함
  - 거부는 OIDC/JWKS 조회, GitHub App private-key 사용, GitHub API subrequest 전에 발생하고 body 내용은 응답·로그에 기록하지 않음
  - 근거: Cloudflare Workers는 요청 body를 계정 플랜에 따라 최대 100MB 이상 허용하지만 isolate 메모리는 128MB이며, 공식 best practice도 JSON처럼 전체 소비하는 body는 읽기 전에 최대 크기를 강제하도록 권고함
- 권한은 최소화: pull_requests write / checks read / contents read
- 토큰 교체 정책(회수)
  - 비밀키는 주기적 로테이션
  - 유출 의심 시 즉시 비밀키 폐기 후 신규 발급
  - 대상 조직 권한 재검토
- 로그에서 `Authorization`, `token`, `pem`, JSON request body 제거
- Claude community plugin은 exact commit/path/digest와 별도 AppGuardrail·격리 영수증으로만 승인하고, 마켓플레이스 설치·제품 런타임 래퍼·비밀/제품 데이터 영수증은 실패-폐쇄함 (ADR 0015)

## 참고
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers best practices: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Cloudflare Workers Streams API: https://developers.cloudflare.com/workers/runtime-apis/streams/
- Cloudflare Workers Request signal: https://developers.cloudflare.com/workers/runtime-apis/request/
- Cloudflare Workers runtime changelog (`AbortSignal.any()`): https://developers.cloudflare.com/workers/platform/changelog/
