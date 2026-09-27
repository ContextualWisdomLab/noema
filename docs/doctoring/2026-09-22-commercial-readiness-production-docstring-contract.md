# Commercial-readiness production docstring contract

Status: Proposed
Date: 2026-09-22 KST

## Problem

PR #730의 predecessor `cca15b185f41b019748ecdb652b348a20b949d48`에 대한 CodeRabbit pre-merge analysis는 touched-function docstring coverage를 37.50%로 보고했습니다. Repository contract는 owned production Docstring 100%이므로 단순히 외부 80% threshold를 넘기는 것으로는 충분하지 않습니다.

초기 RED `3f54f08ada36dcaac16c350771fbd177967e6b87` → GREEN `9bc667b1c3be7339d77416b069e9fb48e974cd1e`은 당시 식별한 authority-bearing production 함수 15개에 direct decision-oriented JSDoc을 추가했습니다. Fresh patch audit에서는 production 주석 자체는 더 넓게 존재했지만 executable allowlist가 15개만 보호하고 있어 #730이 실제로 추가·변경한 authority-bearing 함수 17개가 contract 밖에 남아 있음을 확인했습니다. 즉 production 상태와 별개로 “100% executable contract” 주장은 false-complete였습니다.

Fresh terminal-result repair가 legacy Commit Status `state`까지 exact authority로 확장되면서 `validateChecks()` 자체도 behaviorally changed authority boundary가 됐고 executable scope는 32개에서 33개로 확장됐습니다. 이후 projection audit에서 `latestStatuses()`가 Commit Status `context`를 trim하고 `state`를 case-folding하는 별도 fail-open 경계를 확인했습니다. 이 adapter를 exact-identity projection으로 바꾸면서 `latestStatuses()`도 behaviorally changed authority boundary가 되어 scope는 34개가 됐습니다.

Fresh retry-chronology audit에서는 timestamp-less same-suite observation을 더 이상 epoch/ID 추정으로 정렬하지 않고 fail closed하도록 `checkRunTimestamp()`의 authority behavior를 변경했습니다. 이 helper 역시 merge-admission 증거의 시간 권위를 결정하므로 scope는 35개로 확장됐습니다.

Fresh review-state audit에서는 direct Noema decision parser뿐 아니라 general blocker aggregation인 `latestReviewStates()`도 reviewer login을 trim하고 state를 case-folding해 malformed lookalike가 canonical `CHANGES_REQUESTED`를 dismiss/replace할 수 있음을 확인했습니다. 이 projection을 exact reviewer/state identity로 바꾸면서 scope는 36개가 됐습니다. 이후 downstream merge evaluator가 이미 canonicalized된 Noema decision을 다시 trim/case-folding하던 문제를 수리하면서 `validateReviews()`가 behaviorally changed authority boundary가 되어 scope는 37개가 됐습니다.

2026-09-23 KST fresh independent review에서는 merge decision 재평가 뒤 실제 merge write 직전까지 base SHA가 다시 바뀔 수 있는 TOCTOU gap을 확인했습니다. `assertLiveHead()`가 fresh snapshot의 `baseSha`까지 검증하도록 authority behavior를 확장했으므로 current executable scope는 **38개 authority-bearing production 함수**입니다.

## Constraints

- 주석은 코드 직역이 아니라 exact identity, canonical workflow, current PR/head/base, required-check producer, retry chronology, review-head/review-state binding, terminal result/projection authority, merge-write 직전 base/head 재검증처럼 코드만으로 놓치기 쉬운 권한 경계만 설명합니다.
- Test helper나 일반 기계적 동작에 자명한 주석을 채워 coverage 숫자만 높이지 않습니다.
- Docstring scope repair 자체는 production 실행 동작을 바꾸지 않습니다. 다만 새 authority behavior를 추가·변경한 production 함수는 scope와 direct JSDoc contract에 즉시 포함합니다.
- Central Security Scan 구현, provider routing, product-domain truth, quarantine/security runtime, outbound, release/deployment authority를 취득하지 않습니다.

## Alternatives

1. CodeRabbit의 80% threshold만 맞추는 일부 문서화: repository 100% contract와 맞지 않아 기각했습니다.
2. 모든 함수에 자명한 설명을 추가: Anti-Slop 코드 주석 원칙에 반해 기각했습니다.
3. 초기 allowlist를 그대로 두고 review 관행에만 의존: 이후 regression이 executable gate를 통과할 수 있어 기각했습니다.
4. #730에서 authority 동작이 추가·변경된 production surface를 patch 기준으로 다시 열거하고 해당 scope 자체를 별도 executable contract로 고정: 채택했습니다.

## Decision

초기 단계의 RED `3f54f08ada36dcaac16c350771fbd177967e6b87`은 `test/commercial-readiness-production-docstrings.test.ts`를 추가했고, GREEN `9bc667b1c3be7339d77416b069e9fb48e974cd1e`은 당시 누락됐던 production JSDoc을 추가했습니다.

Fresh scope audit의 RED `75d15dab427067eadbb110029e6726e37a732c4f`은 `test/commercial-readiness-production-docstring-scope.test.ts`를 추가해 executable docstring contract가 #730의 authority-bearing production surface 전체를 열거하도록 요구했습니다. GREEN `09128ac93f1138b68a4adf5ffba9034e09ce8f19`은 allowlist를 32개로 확장했습니다.

Commit Status evaluator finding으로 `validateChecks()`가 behaviorally changed한 뒤, successor RED `c2e7e94f8be970bdea502b1a2c385c8ae8edc6ba`는 scope oracle에 `validateChecks()`를 추가해 33번째 production authority boundary를 요구했고 RED `68b3e439257b64f213d1064608ab7c3be73e60ec`은 direct-JSDoc contract에도 같은 함수를 추가했습니다. GREEN `46f6df9e9eb34fdd7abf62633bf7186d8348151c`은 `validateChecks()`에 terminal check/status authority의 decision-oriented JSDoc을 추가하고 Commit Status state를 exact identity로 평가합니다.

Fresh adapter audit의 RED `8c04138e5553b6298b787d88670b280b51fc7c78`은 `latestStatuses()`가 `" policy "`와 `policy`, `"SUCCESS"`와 `failure` 같은 distinct source observations를 정규화·병합하지 않고 그대로 projection해야 한다고 고정합니다. Scope RED `d784672f869ba20df7c315a06950010b3747f4c7`은 `latestStatuses()`를 patch-current authority surface에 추가하고 direct-JSDoc RED `d8fd8adcc61a21aa9e648575a7f0113756fb3641`은 같은 함수를 direct contract에 추가합니다. GREEN `40d78034a5b100851ddde1c47f0d1add8de1edb1`은 projection을 exact identity로 바꾸고 `latestStatuses()`에 decision-oriented JSDoc을 추가합니다.

Fresh retry-chronology RED `0b15aff7bad66dca299b5da29a88b91c21ef2bd6`은 temporal evidence가 없는 same-suite retry가 merge evidence에서 묵살되지 않고 operational error를 발생시키도록 요구합니다. Production GREEN `805f7920bb24882e716b7b15650cbeb910eab9ea`은 `checkRunTimestamp()`와 comparator를 fail closed로 바꿉니다. Scope RED `257dc0541de99230e74cfcca4feeeccef3750ac5`과 direct-JSDoc RED `c172a634091d0fb4f323568759fbddbf32d3a583`은 behaviorally changed `checkRunTimestamp()`를 owned production contract에 추가하고, GREEN `0f44d9afd1a480c75900d5d8dffd719ebe3d6663`은 해당 helper에 evidence-boundary JSDoc을 추가합니다.

Fresh review-state aggregation RED `b81a341534723f692de124d24f38f25fa7408b0e`은 malformed reviewer/state identity가 canonical `CHANGES_REQUESTED` blocker를 제거하지 못하도록 요구합니다. Scope RED `a5870164f8a4f215f8f2a4da8b3b025d68f30200`은 `latestReviewStates()`를 patch-current authority surface에 추가합니다. Production GREEN `80280e4ab73abe6833fa7b00cbcffa95af8de52a`은 exact reviewer/state projection과 decision-oriented JSDoc을 추가하고, direct-contract GREEN `c3aabb888235ede41a5674b8b9a0be9201b2be74`은 같은 함수를 executable JSDoc oracle에 포함합니다.

Noema decision downstream exactness repair는 RED `95ef32135e97150e5f2a849da398f72fd2c4ea0d` → GREEN `232675e62c8bd2a183715967b7de37572aea2553`으로 `validateReviews()`의 trim/case-folding을 제거했습니다. Successor scope/direct-contract repairs `075f750bc6bccf0424fd5909bc97dcae4af985ed` / `fbcdafa5bf216787c528954aeca0d53be797dbb9`이 evaluator authority surface를 9개로 확장해 total 37-function contract를 만들었습니다.

Fresh merge-write TOCTOU finding은 RED `f1136e60fc5af83cec2bba378d010bb53ca1b18d`에서 fresh-evaluated `baseSha`를 snapshot에 보존하고 merge write 직전에 다시 확인할 것을 executable contract로 고정했습니다. Scope/direct-JSDoc REDs `1f0b4475996084d1558fd17fa1f0b6ff662b17b6` / `d30f75eab29918cfeb5f809f76d52f20711838ad`은 behaviorally changed `assertLiveHead()`를 owned production surface에 추가합니다. Production GREEN `f6ba3a2f0a94ba54f94101cda581d1f4fd3972d2`은 `fetchPullRequestSnapshot()`에 `baseSha`를 보존하고 `assertLiveHead()`에 optional exact base-SHA authority와 direct JSDoc을 추가하며, fresh decision 직후 merge API call 전에 `freshSnapshot.baseSha`를 재검증합니다.

Current executable contract는 다음 **38개** authority-bearing production 함수를 직접 보호합니다.

- `scripts/hourly-commercial-readiness.mjs`: 20개 — retry timestamp/chronology/suite identity, required-workflow id/metadata/source, target PR association, suite authority projection, producer projection, required-workflow observation/binding, exact general review-state aggregation, review-head decision, exact Commit Status projection, snapshot assembly, `assertLiveHead()`의 exact head/base merge-write guard, SHA-bound normal merge, main loop.
- `scripts/lib/commercial-readiness-loop.mjs`: 9개 — exact authority/check-name identity, trusted producer, PR identity, exact Noema decision/review authority, required producer/check result, observed check result, aggregate check/status authority validation.
- `scripts/lib/main-governance-audit.mjs`: 9개 — exact authority strings, numeric identity, rule parameters/result recording, rule-type/workflow observation/canonical matching, empty fail-closed state, main-governance evaluation.

The docstring scope contract itself does not change executable production behavior. The Commit Status evaluator behavior is tracked in RED `2d91c4277b7be21737ece14e30dab1b1586e882b` → GREEN `46f6df9e9eb34fdd7abf62633bf7186d8348151c`; collection projection in RED `8c04138e5553b6298b787d88670b280b51fc7c78` → GREEN `40d78034a5b100851ddde1c47f0d1add8de1edb1`; retry chronology in RED `0b15aff7bad66dca299b5da29a88b91c21ef2bd6` → GREEN `805f7920bb24882e716b7b15650cbeb910eab9ea`; review-state aggregation in RED `b81a341534723f692de124d24f38f25fa7408b0e` → GREEN `80280e4ab73abe6833fa7b00cbcffa95af8de52a`; Noema decision exactness in RED `95ef32135e97150e5f2a849da398f72fd2c4ea0d` → GREEN `232675e62c8bd2a183715967b7de37572aea2553`; merge-write base-SHA revalidation in RED `f1136e60fc5af83cec2bba378d010bb53ca1b18d` → GREEN `f6ba3a2f0a94ba54f94101cda581d1f4fd3972d2`.

## Evidence and traceability

- Predecessor CodeRabbit analysis: touched-function docstring coverage 37.50%, 48 functions/19 files analyzed, external threshold 80%.
- Direct executable contract: `test/commercial-readiness-production-docstrings.test.ts`.
- Scope completeness oracle: `test/commercial-readiness-production-docstring-scope.test.ts`.
- Initial scope RED/GREEN: `75d15dab427067eadbb110029e6726e37a732c4f` → `09128ac93f1138b68a4adf5ffba9034e09ce8f19`.
- Commit Status evaluator scope REDs / GREEN: `c2e7e94f8be970bdea502b1a2c385c8ae8edc6ba`, `68b3e439257b64f213d1064608ab7c3be73e60ec` → `46f6df9e9eb34fdd7abf62633bf7186d8348151c`.
- Commit Status projection/scope/direct-JSDoc REDs / GREEN: `8c04138e5553b6298b787d88670b280b51fc7c78`, `d784672f869ba20df7c315a06950010b3747f4c7`, `d8fd8adcc61a21aa9e648575a7f0113756fb3641` → `40d78034a5b100851ddde1c47f0d1add8de1edb1`.
- Retry chronology RED/GREEN: `0b15aff7bad66dca299b5da29a88b91c21ef2bd6` → `805f7920bb24882e716b7b15650cbeb910eab9ea`.
- Retry chronology docstring scope/direct REDs / GREEN: `257dc0541de99230e74cfcca4feeeccef3750ac5`, `c172a634091d0fb4f323568759fbddbf32d3a583` → `0f44d9afd1a480c75900d5d8dffd719ebe3d6663`.
- Review-state aggregation RED/GREEN: `b81a341534723f692de124d24f38f25fa7408b0e` → `80280e4ab73abe6833fa7b00cbcffa95af8de52a`.
- Review-state docstring scope/direct contract: `a5870164f8a4f215f8f2a4da8b3b025d68f30200` → `c3aabb888235ede41a5674b8b9a0be9201b2be74`.
- Noema decision exactness and 37-function scope: `95ef32135e97150e5f2a849da398f72fd2c4ea0d` → `232675e62c8bd2a183715967b7de37572aea2553`, `075f750bc6bccf0424fd5909bc97dcae4af985ed`, `fbcdafa5bf216787c528954aeca0d53be797dbb9`.
- Merge-write base-SHA authority RED/scope/direct/GREEN: `f1136e60fc5af83cec2bba378d010bb53ca1b18d`, `1f0b4475996084d1558fd17fa1f0b6ff662b17b6`, `d30f75eab29918cfeb5f809f76d52f20711838ad` → `f6ba3a2f0a94ba54f94101cda581d1f4fd3972d2`.
- Production files covered by scope: `scripts/hourly-commercial-readiness.mjs`, `scripts/lib/commercial-readiness-loop.mjs`, `scripts/lib/main-governance-audit.mjs`.

## Risk

이 contract는 #730의 current touched authority surface를 명시적으로 고정합니다. 이후 새로운 authority-bearing production helper가 추가되거나 기존 helper의 authority behavior가 바뀌면 scope oracle과 direct JSDoc contract를 함께 갱신해야 합니다. 단순 allowlist 숫자는 의미가 없으며 patch-current surface와의 대응이 유지돼야 합니다.

Merge API 자체는 head SHA를 받지만 base SHA를 request payload에서 잠그지 않으므로, fresh decision 뒤 base가 이동하는 창은 Noema가 merge 직전 live PR을 다시 읽어 fail closed해야 합니다. 이 재검증과 merge API 호출 사이의 완전한 원자성은 GitHub 서버 계약 밖이므로, GitHub가 write 시점에 반환하는 merge 실패도 그대로 fail closed로 취급합니다.

CodeRabbit의 외부 coverage 산식은 test 함수 등 다른 범위를 포함할 수 있으므로 hosted/pre-merge coverage 숫자 자체는 fresh independent review에서 다시 확인합니다. 이 문서는 외부 scanner 숫자를 100%로 주장하지 않고 repository-owned production contract의 executable scope만 규정합니다.

## Effect and follow-up

#730의 authority-bearing production docstring contract는 현재 **38-function scope**를 executable하게 보호합니다. Fresh independent current-head review와 hosted exact-head GREEN은 별도 merge authority로 계속 필요하며, source mutation이 생기면 predecessor review/check evidence를 재사용하지 않습니다.
