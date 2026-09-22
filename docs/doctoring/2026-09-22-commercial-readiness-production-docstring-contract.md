# Commercial-readiness production docstring contract

Status: Proposed

## Problem

PR #730의 predecessor `cca15b185f41b019748ecdb652b348a20b949d48`에 대한 CodeRabbit pre-merge analysis는 touched-function docstring coverage를 37.50%로 보고했습니다. 이후 provenance 및 review-authority repair가 추가되면서 authority-bearing production helper가 더 늘었지만, 일부 함수는 코드만으로는 fail-closed 이유와 identity boundary를 알기 어려운 상태였습니다.

## Constraint

이 repair는 실행 동작을 바꾸지 않습니다. 주석은 코드의 직역이 아니라 exact identity, canonical workflow, current-head/current-base 결속, required-check producer, SHA-bound normal merge처럼 코드만으로 놓치기 쉬운 권한 경계만 설명합니다. Test helper나 일반적인 기계적 동작을 문서화해 coverage 숫자만 올리는 방식은 채택하지 않습니다.

## Alternatives

1. CodeRabbit의 80% threshold만 충족하도록 일부 함수만 문서화: repository contract의 owned production Docstring 100%와 맞지 않아 기각했습니다.
2. 모든 함수에 자명한 설명을 추가: Anti-Slop 코드 주석 원칙에 반해 기각했습니다.
3. PR #730에서 실제로 authority 동작이 추가·변경된 production 함수만 executable allowlist로 고정하고, 각 함수에 decision/constraint 중심 JSDoc을 직접 배치: 채택했습니다.

## Decision

RED `3f54f08ada36dcaac16c350771fbd177967e6b87`은 `test/commercial-readiness-production-docstrings.test.ts`를 추가해 PR #730에서 authority 동작이 추가·변경된 production 함수 15개 모두에 direct JSDoc을 요구합니다. Predecessor에서는 `requiredWorkflowRunId`, `requiredWorkflowMetadataIsCanonical`, `workflowRunSource`, `workflowRunMatchesTargetPullRequest`, `observedRequiredWorkflows`, `canonicalRequiredWorkflowObservation`, `fetchPullRequestSnapshot`, `mergePullRequest`, `main`, 그리고 evaluator의 required-check/PR identity helper가 이 계약을 만족하지 않아 deterministic RED입니다.

GREEN `9bc667b1c3be7339d77416b069e9fb48e974cd1e`은 production 동작을 바꾸지 않고 `scripts/hourly-commercial-readiness.mjs`에 10개, `scripts/lib/commercial-readiness-loop.mjs`에 5개의 decision-oriented JSDoc을 추가합니다. Compare `ab97a018… → 9bc667b1…`은 ordinary-forward 3 commits, `behind=0`이며 production 두 파일은 주석 추가만 있습니다.

## Evidence and traceability

- PR #730 predecessor CodeRabbit pre-merge analysis: touched-function docstring coverage 37.50%, 48 functions/19 files analyzed, threshold 80%.
- `test/commercial-readiness-production-docstrings.test.ts`: authority-bearing touched production function의 declaration 바로 앞 direct JSDoc과 authority/identity/canonical/fail-closed 의미어를 executable하게 요구합니다.
- GitHub compare `ab97a0185f845af27f2b2ffb30cdd64d4f17d44b...9bc667b1c3be7339d77416b069e9fb48e974cd1e`: hourly script +10/-0, evaluator +5/-0, focused test +45/-0. Production execution code delta는 없습니다.

## Risk

이 계약은 PR #730의 touched production surface를 명시적으로 고정합니다. 이후 새로운 authority-bearing helper가 추가되면 allowlist 갱신 없이 coverage가 자동 확장되지는 않습니다. 따라서 후속 source change에서는 새 helper를 같은 test contract에 추가해야 합니다. CodeRabbit의 외부 coverage 산식이 test 함수까지 포함할 수 있으므로 hosted/pre-merge coverage 숫자 자체는 fresh review에서 다시 확인해야 합니다.

## Effect and follow-up

Current source는 repository의 owned-production 100% 문서화 계약을 PR #730 authority surface에서 executable하게 만족하도록 수리되었습니다. Fresh independent current-head review와 hosted exact-head GREEN은 별도 merge authority로 계속 필요합니다.
