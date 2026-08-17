# 시간 단위 제품 개발 게시 전제조건

## 목적

`.github/workflows/hourly-product-development.yml`은 OpenCode가 `contextual-orchestrator`를 호출하기 전에 모델이 만든 제안을 실제 pull request로 게시할 수 있는지 먼저 확인합니다. 게시 경로가 준비되지 않은 상태에서 추론 비용만 소비하고 마지막 단계에서 실패하는 동작을 허용하지 않습니다.

## 필수 입력

일반 실행에는 다음 값이 모두 필요합니다.

- `NOEMA_LLM_API_URL`: `/v1`로 끝나는 HTTPS `contextual-orchestrator` 주소
- `NOEMA_LLM_API_KEY`: 전용 게이트웨이 추론 토큰. 상위 공급자 키가 아님
- `NOEMA_LLM_MODEL`: 보통 라우팅 별칭 `contextual-orchestrator`
- `NOEMA_MAINTAINER_APP_CLIENT_ID`: `ContextualWisdomLab/noema`에만 설치된 Maintainer GitHub App의 repository variable
- `NOEMA_MAINTAINER_APP_PRIVATE_KEY`: 같은 App의 private-key secret

리뷰어 App 신원과 OIDC 토큰 중개, 샌드박스 경계는 이 전제조건에서 변경하지 않습니다. 개발과 리뷰는 같은 게이트웨이 계약을 쓰지만 Maintainer App과 Reviewer App 자격 증명은 분리되어 있습니다.

## 실패 폐쇄 동작

열린 pull request가 없더라도 Maintainer App의 client ID 또는 private key가 없으면 gate는 다음 결과를 기록하고 checkout·OpenCode 다운로드·게이트웨이 호출 전에 종료합니다.

```text
dispatch=false
reason=maintainer_app_unavailable
```

`NOEMA_LLM_API_KEY` 또는 `NOEMA_LLM_API_URL`이 없으면 `orchestrator_gateway_unavailable`로 종료합니다. pull request inventory를 읽지 못하거나 열린 PR이 있으면 각각 `pull_request_inventory_unavailable`, `open_pull_request`로 종료합니다.

## dry_run

`workflow_dispatch`에서 `dry_run=true`를 선택하면 secret이나 App credential이 없어도 queue gate와 전체 task contract를 검토할 수 있습니다. dry run은 checkout, OpenCode 설치, 게이트웨이 호출, artifact 업로드, branch push, pull request 생성 중 어느 것도 수행하지 않습니다.

## 활성화 확인

1. Maintainer App이 `ContextualWisdomLab/noema`에만 설치되어 있는지 확인합니다.
2. App 권한을 Metadata read, Contents write, Pull requests write로 제한합니다.
3. `NOEMA_MAINTAINER_APP_CLIENT_ID`와 `NOEMA_MAINTAINER_APP_PRIVATE_KEY`를 설정합니다.
4. 리뷰와 동일한 `NOEMA_LLM_API_URL`, `NOEMA_LLM_MODEL`, `NOEMA_LLM_API_KEY`를 설정합니다.
5. `dry_run=true`로 prompt와 queue 판단을 검토합니다.
6. 임시 검증 PR에서 publication job이 짧은 수명의 repository-scoped token을 생성하고 정확히 한 branch와 한 PR만 만드는지 확인합니다.
7. 리뷰어 App 신원이나 `/exchange` OIDC 경계가 변경되지 않았는지 확인합니다.

## 운영 복구

`maintainer_app_unavailable`이 나타나면 모델이나 timeout을 조정하지 않습니다. App 설치 범위, client ID variable, private-key secret과 key rotation 상태를 복구한 뒤 다시 실행합니다. `orchestrator_gateway_unavailable`이면 게이트웨이 URL, 전용 추론 토큰, `/healthz` 신원을 복구합니다. 의도적인 중지는 workflow를 비활성화하거나 App credential 또는 게이트웨이 토큰을 회수하여 수행합니다.
