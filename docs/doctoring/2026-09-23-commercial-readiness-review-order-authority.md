# Commercial-readiness review order authority

## Problem

Noema의 commercial-readiness merge admission은 GitHub Pull Request Reviews REST 응답으로부터 일반 reviewer blocker(`latestReviewStates`)와 trusted Noema decision(`parseNoemaReviewDecision`)을 계산합니다. GitHub의 `List reviews for a pull request` endpoint는 review 목록을 chronological order로 반환한다고 명시합니다. 그런데 predecessor `8fdcf043e558d40795c835d8f55d455a2fe4ee1e`은 이미 순서가 부여된 REST observation을 다시 `submitted_at`과 numeric `id`로 정렬했습니다.

이 재정렬은 authority를 새로 만들어 냅니다. `submitted_at`이 누락되거나 parse되지 않으면 코드가 그 review를 epoch `0`으로 취급하므로, API 목록에서 나중에 온 current blocker가 earlier approval보다 앞으로 이동할 수 있습니다. 같은 defect가 exact-head Noema decision selection에도 존재해, later `request_changes`가 earlier approval보다 먼저 정렬된 뒤 approval이 최종 decision으로 선택될 수 있었습니다.

## Constraints

- GitHub가 반환한 review list chronology를 owner observation으로 보존합니다. 별도 timestamp/id 추정 순서를 만들지 않습니다.
- Reviewer login, platform `state`, trusted bot identity, exact `review.commit_id`, credential marker와 exact head marker 검증은 기존 fail-closed 계약을 유지합니다.
- 누락된 `submitted_at`을 현재 시각, epoch 또는 review id ordering으로 보충하지 않습니다.
- Issue #27의 control-plane governance, issue #29의 Reviewer/Maintainer App identity·eligibility, provider/model routing, quarantine/security runtime, outbound, release/deployment authority를 이 변경으로 취득하지 않습니다.

## Alternatives

1. `submitted_at` 누락을 operational error로 승격: 보수적이지만 GitHub REST가 이미 list ordering을 계약하고 있어 동일 chronology를 별도 field completeness gate로 다시 구성할 필요가 없습니다. 또한 historical review의 optional/legacy field shape가 전체 PR admission을 불필요하게 중단할 수 있습니다.
2. `submitted_at` 뒤 `id` tie-break를 계속 사용: rejected. 이 방식은 API chronology보다 locally synthesized chronology에 authority를 부여하며, missing/unparseable timestamp를 epoch으로 바꾸는 순간 later blocker loss가 가능합니다.
3. REST list order를 그대로 소비: selected. Pagination을 완전히 flatten한 현재 adapter의 순서를 보존하면서 exact reviewer/state/head identity 검증만 적용합니다.

## RED → GREEN

RED `9b76a53fc6c7ac342d7ee7cdc76df34d276141a2`은 두 hostile cases를 추가합니다. 첫째, earlier `APPROVED` 뒤 API list에서 later `CHANGES_REQUESTED`가 오지만 후자의 `submitted_at`이 null인 경우 `latestReviewStates()`가 blocker를 유지해야 합니다. 둘째, 같은 exact head의 trusted Noema approval 뒤 later `request_changes` review가 null timestamp로 오더라도 `parseNoemaReviewDecision()`의 최종 decision은 `request_changes`여야 합니다. Predecessor의 synthesized sort에서는 둘 다 approval 쪽으로 되돌아갑니다.

GREEN `4d7e6590d0d70ec7825154391c499fd7ee516248`은 `chronologicalReviewOrder()`를 제거하고 두 projection이 완전히 pagination된 GitHub REST review list order를 그대로 소비하게 합니다. Production change는 `scripts/hourly-commercial-readiness.mjs` 하나이며 RED→GREEN compare는 1 commit, +3/-13입니다. 기존 exact identity/state/head/credential checks는 변경하지 않습니다.

## Evidence and traceability

- GitHub. (2026). *REST API endpoints for pull request reviews: List reviews for a pull request*. GitHub Docs. Retrieved September 23, 2026, from https://docs.github.com/en/rest/pulls/reviews — endpoint contract: the review list is returned in chronological order.
- RED: `9b76a53fc6c7ac342d7ee7cdc76df34d276141a2`.
- GREEN: `4d7e6590d0d70ec7825154391c499fd7ee516248`.
- Production boundary: `scripts/hourly-commercial-readiness.mjs`.
- Regression boundary: `test/commercial-readiness-review-head-binding.test.ts`.

## Risk

이 선택은 GitHub REST endpoint의 documented chronological-order contract에 의존합니다. Noema가 향후 다른 API나 GraphQL collection으로 review source를 바꾸면 그 source의 ordering semantics를 별도로 검증하고 계약 테스트를 갱신해야 합니다. 또한 current-head hosted checks와 independent review는 이 source-level repair와 별개의 merge evidence입니다.

## Effect and follow-up

Later blocker가 malformed/missing timestamp 때문에 earlier approval 앞쪽으로 재배치되어 사라지는 false-PASS 경로를 제거했습니다. #730은 이 repair 이후에도 Draft를 유지하며, current exact에 대한 hosted terminal GREEN과 qualifying independent review가 있어야만 Ready/normal-merge authority를 얻습니다. Release inventory, immutable release, SBOM/provenance/reproducibility/rollback은 별도 acceptance입니다.
