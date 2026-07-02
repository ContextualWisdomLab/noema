# Noema 보안 검증 체크리스트

최종 Saleable PASS에서는 이 체크리스트의 모든 항목을 체크하는 것만으로 충분하지 않다.
`artifacts/security/security-validation-evidence.json`에 owner, source documents, validation artifacts를 남기고 `npm run readiness:audit`를 통과해야 한다.
작성 템플릿은 `docs/evidence-templates/security-validation-evidence.example.json`이다.

## 배포 전
- [ ] 비밀값은 `wrangler secret`로 저장 (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PEM`, 선택: `GITHUB_APP_INSTALLATION_ID`)
- [ ] 공개 변수는 `.github` 워크플로와 실제 배포값 일치 (`ALLOWED_*`)
- [ ] `npm run release:verify` 통과
- [ ] `npm run security:scan` 무경고
- [ ] `npm run release:verify:strict`(운영 배포 전) 결과 pass
- [ ] `.github/workflows/ci.yml` 존재 및 실행
- [ ] 배포 실패/성공 여부와 무관하게 `noema-kpi-evidence.json` 아티팩트가 생성/보관되는지 확인
- [ ] `exchange-30d.ndjson.provenance.json` 아티팩트가 생성되고 `sourceKind=production`, `sourceId`, `records`, `collectedAt`을 포함하는지 확인
- [ ] OIDC 페이로드 검증 포인트 수동 점검
  - `iss`, `aud`, `repository_owner`, `workflow_ref`, 만료/유효시각
  - `workflow_ref`가 승인된 중앙 workflow와 `refs/heads/main` prefix에 묶여 있는지 확인
- [ ] `NOEMA_RATE_LIMIT_PER_MINUTE` 운영값 확인 및 429 `ERR_RATE_LIMIT`/`Retry-After` 응답 검증
- [ ] 과도하게 긴 `x-request-id`/`x-correlation-id` 및 client IP 계열 헤더가 응답/로그/rate-limit key에 원문 반영되지 않는지 확인
- [ ] `/exchange` 성공/실패 JSON 응답이 `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`를 포함하는지 확인
- [ ] `/exchange` 401 응답이 `WWW-Authenticate: Bearer realm="noema"`를 포함하고 인증 누락/잘못된 토큰을 `invalid_request`/`invalid_token`으로 구분하는지 확인
- [ ] `/exchange` 405 응답이 `Allow: POST`를 포함하는지 확인
- [ ] `target_repository` 비문자열 입력이 GitHub token 생성 전에 `ERR_VALIDATION_INPUT`과 `details.field=target_repository`로 거부되는지 확인
- [ ] 성공 exchange 구조화 로그에 issued GitHub token(`ghs_...`)과 inbound OIDC token 원문이 없는지 확인

## 운영 배포 후 24시간
- [ ] `/health` 스키마(`ok=true`, `data.name=noema`, `trace_id`) 및 헤더(`x-trace-id`, `x-latency-ms`) 확인
- [ ] `/exchange` 401/`ERR_AUTH_MISSING` 스키마(`ok=false`, `error_code`, `trace_id`) 및 헤더(`x-trace-id`, `x-latency-ms`, `www-authenticate`) 확인
- [ ] `ERR_*` 로그가 표준 코드로만 발생하는지 확인
- [ ] 구조화 로그에 `trace_id`/`route`/`status_code`/`latency_ms`가 모두 존재
- [ ] `ERR_RATE_LIMIT`, `ERR_INTERNAL` 임계치 알림 규칙 연결
- [ ] `ERR_GITHUB_INSTALLATION` 발생 시 `details.field=token|expires_at` 여부를 확인해 GitHub App 설치/응답 이상을 분류
- [ ] `npm run kpi:alerts`로 5분 실패율/지연/예외 알림 규칙 실행 확인
- [ ] `cd` 워크플로의 수동 승인(환경 승인자) 정책 확인 및 `production` 배포 제한 적용
- [ ] `npm run kpi:check -- exchange-30d.ndjson 0.02 300` 정기 실행

## 분기별 보안 점검
- [ ] GitHub App 권한 최소권한 검토
- [ ] 비밀키 회수/교체 프로세스 드릴(분기 1회 이상)
- [ ] `/exchange` 실패 원인 상위 10개 코드 검토 및 룰셋 업데이트
