# Noema Threat Model (초안)

## 주요 자산
- GitHub App 비밀키(`GITHUB_APP_PRIVATE_KEY_PEM`)
- OIDC 검증 신뢰성
- 발급되는 설치 토큰(`contents`/`pull_requests` 권한 범위)
- 감사 로그(trace_id, 에러 코드, 레이턴시)
- Cloudflare Worker isolate의 128MB 메모리와 요청 처리 가용성

## 위협
1. 위조된 OIDC 토큰으로 허가되지 않은 토큰 발급 시도
2. JWT 페이로드 위변조 또는 만료 토큰 재사용
3. 중앙 워크플로 권한 변경을 통한 권한 상승
4. 신뢰된 ref와 접두사만 같은 브랜치·태그(예: `main-attacker`)를 이용한 workflow trust 우회
5. 로그 유출을 통한 민감 토큰 노출
6. Cloudflare가 허용하는 대용량 또는 chunked JSON request를 이용한 isolate 메모리·CPU 고갈

## 대응
- `iss`, `aud`, `repository_owner`, `workflow_ref` 엄격 검증
  - 기본값은 중앙 workflow 파일과 `refs/heads/main`까지 고정함
  - 배포 entrypoint는 서명 검증 전에 OIDC payload를 deny-only 방식으로 점검하고, `ALLOWED_WORKFLOW_REF_PREFIX`의 역사적 변수명과 무관하게 전체 `job_workflow_ref` 또는 `workflow_ref`가 설정값과 바이트 단위로 정확히 일치할 때만 후속 서명 검증으로 진행함
  - 설정값에 wildcard, 쉼표, 공백, 누락된 workflow/ref 구분자가 있으면 503으로 실패-폐쇄하며, `main-attacker`처럼 접두사만 공유하는 ref는 403 `ERR_WORKFLOW_NOT_ALLOWED`로 차단함
  - 사전 점검은 미검증 claim을 승인 근거로 사용하지 않으며, 정확히 일치하는 경우에도 기존 RS256/JWKS 검증과 issuer/audience/repository 검증을 반드시 통과해야 함
- OIDC 캐시 및 키 조회 실패 시 502 실패로 중단
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

## 참고
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers best practices: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
