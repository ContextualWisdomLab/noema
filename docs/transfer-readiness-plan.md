# Noema Transfer Readiness Plan

이 문서는 Noema를 구매자에게 이전할 때 필요한 운영 절차를 정리한다.
`artifacts/acquisition/transfer-evidence.json`의 `pass` 증빙을 대체하지 않는다.
최종 판정은 `npm run acquisition:audit`가 수행한다.

## Scope

이전 대상은 다음으로 한정한다.

- `ContextualWisdomLab/noema` repository
- Cloudflare Worker 배포 설정과 runtime secrets
- GitHub App 설정, private key, installation 권한
- 중앙 required workflow에서 사용하는 `NOEMA_EXCHANGE_URL` 및 연계 변수
- 운영 문서, readiness audit artifact, buyer data-room manifest

## Required Transfer Evidence

`transfer-evidence.json`는 다음 key가 모두 `"pass"`여야 한다.

```json
{
  "license_review": "pass",
  "third_party_review": "pass",
  "github_app_transfer_plan": "pass",
  "cloudflare_transfer_plan": "pass",
  "secrets_rotation_plan": "pass",
  "owner_transfer_plan": "pass",
  "privacy_review": "pass"
}
```

또한 `owner`, `source_documents`, 기본 45일 이내 `updated_at`이 필요하다.

## Handover Steps

### 1. License and dependency review

- `package-lock.json` 기준 dependency license를 검토한다.
- `npm audit --audit-level=high` 결과를 보존한다.
- third-party runtime dependency와 Cloudflare/GitHub API 사용 조건을 buyer data room에 기록한다.

### 2. Repository ownership

- repository admin, branch/ruleset 관리자, CI secret 관리자 목록을 정리한다.
- 구매자 organization으로 이전할 경우 GitHub App installation target과 required workflow reference를 함께 갱신한다.
- 이전 직전 `npm run release:verify:strict`와 `npm run acquisition:audit` 결과를 artifact로 보존한다.

### 3. GitHub App

- App owner, App ID, installation ID, private key 생성/폐기 절차를 기록한다.
- 구매자 환경에서 새 private key를 발급한 뒤 기존 key를 폐기한다.
- target repository installation scope가 최소권한인지 확인한다.

### 4. Cloudflare Worker

- Worker account, route/domain, environment, KV/D1 사용 여부, deploy token 권한을 정리한다.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PEM`, 선택적 `GITHUB_APP_INSTALLATION_ID` secret을 구매자 계정에서 재주입한다.
- `NOEMA_EXCHANGE_URL`을 구매자 domain 또는 route로 갱신하고 smoke check를 실행한다.

### 5. Secrets rotation

- 이전 시점에 모든 production secret을 구매자 소유 값으로 교체한다.
- 기존 owner가 접근 가능한 token, private key, deploy token을 폐기한다.
- rotation evidence에는 폐기 시각, 새 key owner, smoke check 결과를 포함한다.

### 6. Customer and privacy handling

- Noema가 inbound GitHub OIDC token과 outbound installation token을 operational log에 남기지 않는지 확인한다.
- 파일럿 고객의 repository name, workflow identity, audit trail 보존 범위를 계약서와 맞춘다.
- 고객 데이터 이전 또는 삭제 요청 절차를 buyer runbook에 포함한다.

## Final Acceptance

구매자 reliance 전에 다음이 모두 필요하다.

- `npm run release:verify:strict` PASS
- `npm run readiness:audit` PASS
- `npm run acquisition:manifest` PASS
- `npm run acquisition:audit` PASS
- `transfer-evidence.json`의 source documents가 실제 법무, 계정, 보안 검토 문서로 연결됨
