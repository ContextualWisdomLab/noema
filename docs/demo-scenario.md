# Noema Demo 시나리오

## 5분 빠른 데모

### 준비
1. Noema Worker URL을 환경변수로 지정 (`NOEMA_EXCHANGE_URL`)
2. `x-request-id`를 추적할 수 있게 클라이언트 로그 수집 설정
3. (선택) `NOEMA_OIDC_TOKEN`에 유효한 OIDC를 설정

### 실행 스크립트
```bash
NOEMA_EXCHANGE_URL="https://your-worker-url/exchange" \
NOEMA_OIDC_TOKEN="..." \
./scripts/demo-exchange.sh
```

### 실행
1. `GET /health`
2. 잘못된 token으로 `/exchange` 401 응답 확인 (`ERR_AUTH_MISSING`, `ERR_TOKEN_MALFORMED`)
3. 정상 워크플로에서 발급된 OIDC를 사용해 `/exchange` 성공 응답 확인
4. 반환 `trace_id`와 중앙 로그의 `event=http_request`를 같은 값으로 연결

### 확인 포인트
- 성공 응답은 `ok:true`와 `trace_id`를 포함해야 함
- 에러 응답은 `error_code`가 일관되게 노출되어야 함
- 중앙 로그에 `latency_ms`와 `route`가 남아야 함

## PoC 종료 체크리스트
- 실패율 집계가 2% 미만인지 확인
- p95 레이턴시가 300ms 근접치인지 확인
- 운영 인계자에게 온보딩 문서/Runbook가 전달되었는지 확인
