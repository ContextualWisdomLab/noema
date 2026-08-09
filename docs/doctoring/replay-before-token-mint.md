# GitHub 토큰 발급 전 검증된 OIDC 재사용 방지 claim

## 상태와 범위

2026-08-09 Draft PR #83 기준으로 검토했습니다. 이 문서는 Noema credential exchange의 한 가지 보안 실행 순서 변경을 설명합니다. 이 기록 자체는 merge, release, deployment, reviewer 또는 App provisioning 권한을 부여하지 않으며, stacked PR이 통합되고 운영 검증되기 전에는 protected `main` 또는 production acceptance가 완료되었다고 주장하지 않습니다.

## 문제

기존 production wrapper는 core exchange가 GitHub installation token을 성공적으로 반환한 뒤에야 distributed single-use OIDC replay claim을 수행했습니다. 재사용 요청의 호출자에게 토큰이 전달되지는 않았지만, 동일한 유효 OIDC 요청이 반복되면 Noema의 atomic replay guard가 중복을 거부하기 전에 privileged GitHub App access-token 생성 endpoint까지 도달할 수 있었습니다.

반대로 claim을 검증되지 않은 JWT prefilter 단계까지 앞당기면 다른 문제가 생깁니다. 공격자가 임의의 unsigned payload에 선택한 `jti` 값을 넣어 제출하고 cryptographic authentication 전에 replay namespace를 선점할 수 있기 때문입니다.

따라서 보안 경계에는 다음과 같은 정확한 중간 지점이 필요합니다.

```text
untrusted compact JWT envelope
→ bounded payload prefilter
→ cryptographic GitHub OIDC verification
→ request/target authorization
→ atomic distributed replay claim
→ GitHub App privileged token creation
```

## 결정

production wrapper에서는 credential-bearing core를 호출하기 전에 replay Durable Object binding이 반드시 존재해야 합니다. Core가 GitHub Actions OIDC token을 검증하고 요청 대상 repository를 승인한 다음, 검증된 `jti`/`exp`를 distributed replay guard를 통해 claim합니다. 최초 사용 claim이 승인된 요청만 GitHub App installation-token 생성으로 진행할 수 있습니다.

Replay conflict는 401 `ERR_AUTH_REPLAY`를 반환하며, replay state를 사용할 수 없거나 검증된 replay claim이 누락되면 503을 반환합니다. 어느 경로도 GitHub access-token 생성 endpoint에 도달해서는 안 됩니다.

Core는 production replay binding 없이도 독립적으로 테스트할 수 있으므로, focused cryptographic/token-exchange test가 외부 deployment topology를 흉내 낼 필요는 없습니다. 그러나 production wrapper는 binding이 없으면 fail closed하며, 성공한 core response에는 replay가 token mint 전에 검증되었다는 내부 evidence가 있어야 합니다. 기존의 post-success outer claim은 이 증거 header가 없는 mock/legacy core response를 위한 방어적 compatibility path로만 남기고, 실제 production core는 반드시 pre-mint path를 사용합니다.

## Replay state 변경보다 검증이 먼저인 이유

GitHub Actions OIDC 문서는 identity token을 workflow 및 repository identity를 입증하는 데 사용할 수 있는 claim이 담긴 signed JWT로 설명합니다. Noema는 decoded payload JSON이 구문상 올바르다는 이유만으로 이를 인증된 데이터로 취급하지 않습니다. 따라서 JWT signature와 관련 trust claim이 cryptographic verifier를 통과하기 전에는 replay state를 선점할 수 없습니다.

GitHub는 `workflow_sha`, 그리고 reusable workflow의 경우 `job_workflow_sha`를 workflow-source commit identity claim으로 문서화합니다. PR #71은 trusted workflow ref와 대응하는 immutable workflow SHA를 별도로 결합합니다. 이번 replay 변경은 그 source-identity 검사를 약화하거나 대체하지 않습니다.

## Token 생성보다 claim이 먼저인 이유

GitHub installation-token request는 privileged side effect입니다. GitHub App identity에서 파생된 repository-scoped capability를 GitHub에 생성하도록 요청하기 때문입니다. Noema가 이후 그 capability를 호출자에게 전달하지 않더라도 이미 소비된 caller credential로 privileged upstream mint를 반복하면 불필요한 증폭과 audit noise가 발생합니다. 따라서 요청이 authentic하고 authorized하다고 확인된 뒤에는 single-use 결정이 해당 side effect보다 먼저 이뤄져야 합니다.

## Distributed state 근거

Replay 방지는 isolate 간 coordination 문제입니다. Cloudflare Durable Objects는 object별 single-threaded coordination point와 strongly consistent storage를 제공하며, SQLite-backed storage API는 transactional update를 지원합니다. Noema는 raw `jti`를 claim body에 저장하는 대신 검증된 `jti`의 hash를 object identity로 사용합니다. Guard는 bounded expiry/first-use state만 기록하고, 지연된 alarm은 삭제 또는 재예약 전에 현재 state를 다시 읽습니다.

## 실행 가능한 검증

`test/replay-before-token-mint.test.ts`는 decoded fake payload를 신뢰하는 대신 실제 RS256으로 서명한 GitHub-Actions-like OIDC fixture를 사용해 production wrapper를 검증합니다.

보안 계약은 두 방향을 모두 검증합니다.

1. **Replay path:** replay Durable Object가 conflict를 반환하면 테스트는 401 `ERR_AUTH_REPLAY`와 `/app/installations/{id}/access_tokens`에 대한 POST 0회를 요구합니다.
2. **First-use path:** replay guard가 `replay_claim`을 기록하고 GitHub token endpoint가 `token_mint`를 기록하며, 정확한 순서는 `replay_claim`이 `token_mint`보다 먼저여야 합니다. 동시에 response는 public `x-oidc-replay-protection: single-use` evidence를 유지합니다.

기존 wrapper test는 malformed/missing replay claim과 unavailable replay state에 대한 fail-closed coverage를 계속 유지합니다. Exact-head CI, branch/statement/function/line coverage, central Security Scan과 formal review는 서로 독립된 acceptance gate입니다.

## 잔여 위험과 비목표

- 유효한 최초 사용 요청은 여전히 GitHub App installation lookup/token 생성에 도달할 수 있습니다. Replay protection은 일반 request rate limiter가 아니며 distributed rate limiter가 계속 pre-auth abuse-control plane을 담당합니다.
- 이번 변경은 decoded workflow claim을 signature verification 전에 권위 있는 정보로 만들지 않습니다.
- 이번 변경은 model verdict나 passing test를 GitHub approval로 만들지 않습니다.
- 이번 변경은 organization Actions queue capacity, App provisioning 또는 `main` ruleset gap을 해결하지 않습니다.
- 이번 변경은 Draft stack의 release/deployment를 승인하지 않습니다.

## 주요 참고문헌 — APA 7th

GitHub, Inc. (2026). *OpenID Connect reference*. GitHub Docs. https://docs.github.com/en/actions/reference/security/oidc

GitHub, Inc. (2026). *OpenID Connect*. GitHub Docs. https://docs.github.com/en/actions/concepts/security/openid-connect

Cloudflare, Inc. (2026). *Durable Objects*. Cloudflare Developers. https://developers.cloudflare.com/durable-objects/

Cloudflare, Inc. (2026). *Storage API*. Cloudflare Developers. https://developers.cloudflare.com/durable-objects/api/storage-api/

## Evidence 분류

위 GitHub 및 Cloudflare 문서는 identity와 coordination primitive를 뒷받침합니다. 정확한 실행 순서—검증된 request authorization, atomic replay claim, privileged token mint—는 해당 primitive와 #81/#83에서 재현한 구체적인 side-effect threat를 바탕으로 한 Noema의 보안 아키텍처 결정입니다. GitHub installation-token semantics가 바뀌거나 Noema가 credential minting을 다른 authority boundary로 이동하면 이 결정도 다시 검토해야 합니다.
