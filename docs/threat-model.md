# Noema Threat Model (초안)

## 주요 자산
- GitHub App 비밀키(`GITHUB_APP_PRIVATE_KEY_PEM`)
- OIDC 검증 신뢰성
- 발급되는 설치 토큰(`contents`/`pull_requests` 권한 범위)
- 감사 로그(trace_id, 에러 코드, 레이턴시)

## 위협
1. 위조된 OIDC 토큰으로 허가되지 않은 토큰 발급 시도
2. JWT 페이로드 위변조 또는 만료 토큰 재사용
3. 중앙 워크플로 권한 변경을 통한 권한 상승
4. 로그 유출을 통한 민감 토큰 노출

## 대응
- `iss`, `aud`, `repository_owner`, `workflow_ref` 엄격 검증
  - 기본값은 중앙 workflow 파일과 `refs/heads/main`까지 고정해 임의 브랜치/태그 ref의 권한 상승을 막음
- OIDC 캐시 및 키 조회 실패 시 502 실패로 중단
- 권한은 최소화: pull_requests write / checks read / contents read
- 토큰 교체 정책(회수)
  - 비밀키는 주기적 로테이션
  - 유출 의심 시 즉시 비밀키 폐기 후 신규 발급
  - 대상 조직 권한 재검토
- 로그에서 `Authorization`, `token`, `pem` 문자열 제거
