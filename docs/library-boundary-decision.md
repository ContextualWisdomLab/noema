# Noema Library Boundary Decision

## Decision

현재는 submodule을 만들지 않는다. 별도 library도 아직 만들지 않는다.

## Rationale

Ponytail 기준으로 지금의 가장 작은 이전 가능 구조는 단일 repo, 단일 Worker, 단일 CI/CD다.

- 현재 구현은 하나의 배포 단위(`Cloudflare Worker`)와 하나의 핵심 API(`/exchange`)다.
- submodule은 buyer checkout, GitHub 권한 이전, release provenance, CI required workflow를 복잡하게 만든다.
- 별도 npm package는 두 번째 소비자가 없으면 versioning과 publishing 부담만 추가한다.
- 매각 실사에서는 코드 분리보다 ownership transfer, KPI provenance, customer evidence가 먼저다.

## Split Triggers

다음 중 하나가 실제로 발생하면 workspace package 분리를 시작한다.

1. 다른 runtime이 같은 OIDC/GitHub App exchange core를 재사용한다.
2. 고객이 typed SDK 또는 self-hosted package를 요구한다.
3. CLI, dashboard, worker가 동일 domain logic을 공유한다.
4. 외부 구매자가 core logic의 독립 라이선스/버전 관리를 요구한다.

## Future Shape

submodule 대신 npm workspaces를 우선한다.

```text
packages/
  core/      # token validation, exchange policy, error contract
  client/    # optional typed API client after API stability is proven
src/
  index.ts   # Cloudflare Worker adapter
```

Submodule은 별도 법인, 별도 라이선스, 별도 release cadence가 확정될 때만 검토한다.

## Current Action

- `src/index.ts`를 지금 즉시 쪼개지 않는다.
- 20억 매각 readiness는 `docs/acquisition-readiness-2b.md`와 `npm run acquisition:audit`로 추적한다.
- core package 분리는 위 trigger가 발생한 뒤 test-first로 진행한다.
