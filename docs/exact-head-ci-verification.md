# Exact-Head Pull-Request Verification

Noema의 pull-request CI는 GitHub가 만드는 임시 merge commit을 제품 소스의 exact head로 간주하지 않는다. `ci`와 `reviewer-ci`는 검증할 source identity를 `github.event.pull_request.head.sha`에 고정하고, push 실행에서는 `github.sha`를 사용한다.

## Required invariant

Pull request의 한 검증 실행이 merge 또는 release evidence로 사용되려면 다음 조건이 모두 참이어야 한다.

1. `SOURCE_SHA`가 이벤트 payload의 현재 pull-request head SHA에서 계산된다.
2. `actions/checkout`은 `ref: ${{ env.SOURCE_SHA }}`로 해당 commit을 직접 checkout한다.
3. checkout 직후 `git rev-parse HEAD`가 `SOURCE_SHA`와 정확히 같아야 한다.
4. 검증을 시작하기 직전 GitHub Pulls API의 live `head.sha`가 `SOURCE_SHA`와 같아야 한다.
5. 테스트, coverage, audit, sandbox 검증이 모두 끝난 뒤 live `head.sha`를 다시 읽고 같은 SHA인지 확인한다.
6. workflow의 `GITHUB_TOKEN`은 `contents: read`와 stale-head 조회에 필요한 `pull-requests: read`만 가진다.
7. checkout credential은 `persist-credentials: false`로 제거한다.
8. 모든 외부 action은 immutable commit SHA로 고정한다.

어느 단계라도 실패하면 해당 실행은 stale, misbound 또는 incomplete evidence다. 재실행, commit status, check-run 이름, model judgement, PR mergeability가 이 실패를 승인으로 바꿀 수 없다.

## Why the default checkout is insufficient for this evidence plane

GitHub의 `pull_request` 이벤트에서 `GITHUB_SHA`와 기본 checkout은 일반적으로 PR의 임시 merge commit을 가리킨다. 이는 base와 head의 통합 가능성을 검증하는 데 유용하지만, PR branch의 exact current head가 독립적으로 통과했다는 증거와 동일하지 않다.

Noema는 두 identity를 혼동하지 않는다.

- **PR head source identity:** 작성자가 제안한 exact commit이며 `SOURCE_SHA`로 인증한다.
- **merge-result identity:** GitHub가 base와 head를 조합한 임시 commit으로, 별도의 integration evidence다.

현재 `ci`와 `reviewer-ci`는 exact PR head source를 검증한다. Branch protection이 merge queue 또는 merge-result 검사를 별도로 요구한다면 그 결과도 별도 check-run으로 수집해야 하며, exact-head 성공을 임시 merge commit 성공으로 대체하거나 그 반대로 대체해서는 안 된다.

## Stale-head refusal

검증 도중 새 commit이 push되면 이미 실행 중인 job의 결과는 최신 head를 승인할 수 없다. Noema는 다음 두 경계에서 Pulls API의 live `head.sha`를 다시 읽는다.

```text
checkout exact SOURCE_SHA
  -> verify HEAD == SOURCE_SHA
  -> live head pre-check
  -> tests/security/coverage/sandbox
  -> live head post-check
```

Concurrency cancellation은 처리량 최적화일 뿐 보안 통제가 아니다. 이전 runner가 취소 요청을 늦게 받거나 완료 직전에 새 head가 생길 수 있으므로 post-check가 반드시 남아야 한다.

## Fork and credential boundary

이 workflow는 `pull_request_target`으로 전환하지 않는다. PR head의 code, package scripts, test configuration, Docker build context를 실행하면서 base-repository write token이나 secret을 부여하면 공급망 공격 경계가 무너질 수 있다.

`pull_request` 실행은 다음 제한을 유지한다.

- repository contents와 PR metadata에 대한 read-only token;
- publication, package, OIDC, signing, deployment, reviewer-model, NVIDIA NIM secret 없음;
- PR source checkout 뒤 persisted Git credential 없음;
- 검증 결과와 publication/merge authority의 분리.

## Evidence interpretation

Exact-head verification 성공은 다음을 의미하지 않는다.

- 독립 reviewer의 GitHub `APPROVE`;
- branch protection 또는 ruleset 충족;
- merge-result compatibility;
- release provenance 또는 immutable publication;
- production deployment acceptance;
- buyer KPI, revenue, transfer 또는 governance readiness.

Check run, commit status, review evidence, model judgement, protected-branch approval, provenance와 release acceptance는 서로 다른 evidence plane으로 보존한다.

## Operational diagnosis

검증 로그에서 다음 값을 함께 확인한다.

```text
event pull_request.head.sha
SOURCE_SHA
git rev-parse HEAD
pre-verification live head.sha
post-verification live head.sha
```

다섯 값이 같지 않으면 해당 실행은 exact-head evidence가 아니다. Queued, pending, skipped, cancelled, missing 또는 stale execution을 성공으로 취급하지 않는다.

## References

GitHub. (2026). *Events that trigger workflows*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

GitHub. (2026). *Securely using pull_request_target*. GitHub Docs. https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target

GitHub. (2026). *Workflow syntax for GitHub Actions*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

GitHub. (2026). *actions/checkout*. GitHub. https://github.com/actions/checkout
