# Doctoring: Exact-Head Pull-Request CI Binding

## Decision

Noema의 `ci`와 `reviewer-ci`는 pull-request event의 기본 merge commit을 PR source identity로 사용하지 않는다. Workflow는 `github.event.pull_request.head.sha`를 `SOURCE_SHA`로 캡처하고, `actions/checkout`에 exact commit ref를 전달하며, 검증 전후 GitHub Pulls API의 live `head.sha`와 다시 비교한다.

Push event에서는 pull-request object가 없으므로 `github.sha`가 `SOURCE_SHA`다. 이 fallback은 default-branch push verification에만 사용되고, pull-request exact-head evidence를 merge commit으로 대체하지 않는다.

## Evidence problem

GitHub의 `pull_request` event에서 `GITHUB_SHA`는 PR merge ref의 마지막 merge commit을 나타낼 수 있고, `actions/checkout`의 기본 동작도 해당 ref를 checkout한다. 이 통합 snapshot은 base와 head의 조합을 시험하는 데 유용하지만 다음 명제를 입증하지 않는다.

> 현재 PR head commit의 tracked source가 이 검증을 통과했다.

두 identity가 섞이면 check run은 현재 PR conversation에 연결되어 보여도 실제 test process는 임시 merge commit을 실행할 수 있다. 반대로 branch가 새 commit으로 이동한 뒤 오래 실행된 job이 성공하면 check 이름만 보고 최신 head를 승인하는 stale-evidence 오류가 생길 수 있다.

## Test-first control

회귀 테스트는 `.github/workflows/ci.yml`과 `.github/workflows/reviewer-ci.yml` 모두에 다음 contract가 없으면 실패한다.

- `SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}`;
- `PR_NUMBER: ${{ github.event.pull_request.number || '' }}`;
- explicit `contents: read` 및 `pull-requests: read`;
- job-wide environment에 `GH_TOKEN` 없음;
- pre/post stale-head step에만 `GH_TOKEN: ${{ github.token }}`이 정확히 두 번 존재함;
- `ref: ${{ env.SOURCE_SHA }}`;
- `persist-credentials: false`;
- checkout 직후 `git rev-parse HEAD == SOURCE_SHA`;
- verification 전후 Pulls API `head.sha == SOURCE_SHA`;
- pre/post stale-head comparison이 정확히 두 번 존재함.

Production workflow는 RED contract를 충족하도록 변경되었다. 검증 중 branch movement가 발생하면 post-check가 nonzero로 종료되어 이미 수행한 test 결과를 현재 head의 성공 evidence로 사용할 수 없다.

## Security boundary

### Least privilege

Workflow token은 repository contents와 live PR metadata의 read 권한만 가진다. `permissions`에 명시되지 않은 scope는 `none`이므로 contents write, checks write, statuses write, packages write, OIDC, deployments, issues write 권한을 얻지 않는다. Checkout은 credential persistence를 비활성화한다.

Read-only도 ambient exposure를 정당화하지 않는다. PR-controlled `npm` script, Python test, Docker build 또는 CodeGraph process가 job-wide `GH_TOKEN`을 상속하면 token을 외부로 전송하거나 허용된 metadata/content를 악용할 수 있다. 따라서 GitHub token은 live head를 읽는 두 metadata step의 local environment에만 전달하고, 나머지 untrusted execution environment에는 넣지 않는다.

### Untrusted source execution

Exact head를 checkout하는 목적은 PR code를 정확히 시험하는 것이다. 따라서 workflow는 secret-bearing `pull_request_target`으로 전환하지 않는다. GitHub는 base-context credential을 가진 event에서 untrusted PR head를 checkout하고 build/test script를 실행하는 형태를 공급망 위험으로 설명한다. Noema는 `pull_request`의 read-only boundary에서 head source를 실행하고 publication, signing, merge, release, deployment authority를 별도 trusted workflow와 governance gate에 남긴다.

### Immutable dependencies

`actions/checkout`, setup actions, security tooling 같은 외부 action은 mutable tag가 아니라 full commit SHA로 고정한다. Exact `SOURCE_SHA`는 repository source identity를, action commit pin은 workflow dependency identity를 각각 고정한다. 두 통제는 서로 대체되지 않는다.

### Stale-head refusal is independent of cancellation

Concurrency cancellation은 새 commit이 push되면 이전 run을 중단하도록 돕지만, cancellation delivery와 runner 종료는 원자적이지 않다. 따라서 pre/post API check는 cancellation과 독립적인 authorization condition이다. Queued, pending, skipped, cancelled 또는 이전 SHA의 success는 현재 head success가 아니다.

## Evidence-plane separation

Noema는 다음을 서로 다른 identity와 authority로 유지한다.

- PR exact-head source verification;
- temporary merge-result/integration verification;
- GitHub check runs;
- commit statuses;
- CodeRabbit, OpenCode, Noema 또는 다른 model judgement;
- human review와 independent `APPROVE`;
- branch protection/ruleset enforcement;
- build provenance와 artifact attestation;
- release acceptance와 deployment acceptance.

Exact-head CI가 green이어도 merge-result compatibility, independent approval, governance, provenance 또는 release readiness가 자동으로 green이 되지 않는다. 반대 방향의 대체도 허용하지 않는다.

## Residual trust and limitations

GitHub runner가 실행하는 workflow definition과 event payload, GitHub API response, pinned action commit의 서비스 제공 경계는 bootstrap trust root다. 이 변경은 GitHub-hosted execution 자체를 cryptographically self-attest한다고 주장하지 않는다.

또한 exact-head test는 base branch와 결합된 결과를 별도로 검증하지 않는다. Repository ruleset이 integration 또는 merge-queue check를 요구할 경우 exact-head check와 별도의 required check로 구성해야 한다. 인수 검토에서는 두 결과의 checked SHA와 producer를 각각 보존해야 한다.

## APA 7th references

GitHub. (2026). *actions/checkout*. https://github.com/actions/checkout

GitHub. (2026). *Events that trigger workflows*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

GitHub. (2026). *Securely using pull_request_target*. GitHub Docs. https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target

GitHub. (2026). *Workflow syntax for GitHub Actions*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
