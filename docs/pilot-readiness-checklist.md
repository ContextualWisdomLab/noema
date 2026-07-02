# Noema 파일럿 온보딩 체크리스트

## 기술 준비
- [ ] `/health` 200 응답 확인
- [ ] `/exchange` 성공 응답 1건 이상 확인 (`ok: true`, `trace_id` 존재)
- [ ] 에러 응답이 `ERR_*` 스키마로 일관성 있게 반환되는지 확인
- [ ] `x-trace-id` 및 `x-latency-ms` 헤더 확인

## 운영 준비
- [ ] 관측성 대시보드에 `event=http_request` 로그 저장
- [ ] 알림 규칙(5분 실패율, p95, ERR_RATE_LIMIT) 연결
- [ ] Runbook/DR 문서 수신 확인
- [ ] 인시던트 책임자 배정 완료

## 보안 및 계약
- [ ] `GITHUB_APP_PRIVATE_KEY_PEM` 비밀관리 확인
- [ ] 회수/재발급 프로세스 공유
- [ ] SLA·지원·약관 초안 합의

## 성능/안정성
- [ ] 최근 30일 `exchange_failure_rate <= 0.02` 확인
- [ ] 최근 30일 `exchange_p95_latency_ms < 300` 확인
- [ ] 30일 데이터가 없을 경우 7일/14일 롤링 지표로 초기 검증 후 추세 모니터링

## 승인
- [ ] 공급자 사전 점검서 서명
- [ ] 고객 사용 가이드 전달
- [ ] 정식 파일럿 시작일 확정
- [ ] [파일럿 온보딩 기록](./pilot-readiness-log.md)에 완료 이력 저장
