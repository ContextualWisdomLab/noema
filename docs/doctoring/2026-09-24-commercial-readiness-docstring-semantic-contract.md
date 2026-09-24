# Commercial-readiness docstring semantic contract

Status: Proposed
Date: 2026-09-24 KST

## Problem

PR #730의 current-head independent review는 `test/commercial-readiness-production-docstrings.test.ts`가 direct JSDoc의 의미를 단일 alternation keyword 한 개로만 판정해 false PASS를 허용한다고 지적했습니다. 예를 들어 `/** current */`, `/** Reports the status. */`, `/** check */`처럼 authority boundary를 설명하지 않는 문구도 기존 oracle을 통과할 수 있었습니다. 이는 owned production Docstring 100% 계약을 단순 존재 여부가 아니라 비직관적 권한·증거 순서·fail-closed 제약을 설명하는 계약으로 유지하려는 repository policy와 맞지 않습니다.

## Constraints

- Production 주석의 표현을 테스트 keyword에 맞추기 위해 인위적으로 바꾸지 않습니다.
- 이미 존재하는 38-function scope와 direct-JSDoc adjacency contract는 유지합니다.
- 단일 generic keyword가 의미 계약을 만족하지 못하도록 하되, 특정 문구 하나만 강제해 서로 다른 authority boundary의 자연스러운 설명을 깨지 않습니다.
- Production execution, merge-admission logic, provider routing, foreign domain truth, quarantine/security runtime, outbound authority는 변경하지 않습니다.

## Alternatives

1. `status`만 제거하거나 특별 취급: `current`, `check`, `workflow` 같은 다른 단일 generic token이 그대로 false PASS를 만들기 때문에 기각했습니다.
2. 모든 함수에 하나의 고정 문구를 요구: 각 함수의 실제 authority/evidence semantics를 문구 템플릿에 맞추게 되어 기각했습니다.
3. 의미 vocabulary에서 서로 다른 contract term이 최소 두 개 존재하도록 요구하고, generic single-keyword hostile fixture를 executable RED로 추가: 기존 자연어 JSDoc을 유지하면서 단일-token false PASS를 닫을 수 있어 채택했습니다.

## Decision

RED `af1bfe808cf4364013a970ffcf66fbdd31953151`은 `/** current */`만 가진 `weakContract()`가 기존 helper를 통과한다는 약점을 executable하게 고정했습니다. 이 commit에서는 helper 구현을 바꾸지 않아 negative fixture가 실패해야 합니다.

GREEN `485c443e1768f3ad109a5bd385229bf00386c316`은 동일 vocabulary에서 대소문자를 정규화한 서로 다른 contract term의 개수가 최소 2개인지 검사하도록 `expectDirectJsDoc()`을 수리했습니다. Direct JSDoc adjacency, 38-function allowlist, production source는 변경하지 않았습니다.

이 규칙은 semantic completeness의 완전한 자연어 검증을 주장하지 않습니다. 다만 current finding의 원인인 single-token false PASS를 executable하게 차단하고, 후속 review가 구체 문구의 정확성을 계속 판단할 수 있는 최소 causal gate입니다.

## Evidence and traceability

- Independent review finding: PR #730, CodeRabbit review run `ce099b85-b0c4-4037-b8eb-e2e2465efc31`, review comment `4091398548`.
- Pre-fix exact: `1cfc08e0be9b922ba332825f1327a728afd28a8c`.
- RED: `af1bfe808cf4364013a970ffcf66fbdd31953151`.
- GREEN repair: `485c443e1768f3ad109a5bd385229bf00386c316`.
- Executable contract: `test/commercial-readiness-production-docstrings.test.ts`.
- Existing scope authority: `docs/doctoring/2026-09-22-commercial-readiness-production-docstring-contract.md` and `test/commercial-readiness-production-docstring-scope.test.ts`.

## Residual risk

두 개의 vocabulary term이 존재해도 문장이 실제 설계 의도를 잘못 설명할 수 있습니다. 따라서 이 gate는 independent review와 hosted exact-head test 결과를 대체하지 않습니다. Current exact는 fresh hosted terminal GREEN과 current-head independent/formal review가 완료되기 전 merge authority가 아닙니다.
