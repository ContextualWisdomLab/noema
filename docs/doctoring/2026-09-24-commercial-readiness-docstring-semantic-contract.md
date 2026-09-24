# Commercial-readiness docstring semantic contract

Status: Proposed
Date: 2026-09-24 KST

## Problem

PR #730의 current-head independent review는 `test/commercial-readiness-production-docstrings.test.ts`가 direct JSDoc의 의미를 단일 alternation keyword 한 개로만 판정해 false PASS를 허용한다고 지적했습니다. 예를 들어 `/** current */`, `/** Reports the status. */`, `/** check */`처럼 authority boundary를 설명하지 않는 문구도 기존 oracle을 통과할 수 있었습니다. 이는 owned production Docstring 100% 계약을 단순 존재 여부가 아니라 비직관적 권한·증거 순서·fail-closed 제약을 설명하는 계약으로 유지하려는 repository policy와 맞지 않습니다.

첫 repair `485c443e1768f3ad109a5bd385229bf00386c316`은 서로 다른 vocabulary term 두 개를 요구했지만, owner follow-up은 `/** Returns the current status. */`가 `current` + `status` 두 generic token만으로 여전히 통과함을 확인했습니다. 따라서 단순 term-count는 review finding을 완전히 닫지 못했습니다.

Final semantic repair 뒤 owner follow-up audit에서 별개의 adjacency false PASS도 확인했습니다. 기존 helper는 declaration 앞 prefix가 `*/`로 끝나고 그보다 앞에 `/**`가 있기만 하면 direct JSDoc으로 취급했습니다. 따라서 의미상 충분한 JSDoc 뒤에 별도 `/* ... */` block comment가 끼어 있어도 앞선 JSDoc을 declaration의 직접 계약으로 잘못 승인할 수 있었습니다.

## Constraints

- Production 주석의 표현을 테스트 keyword에 맞추기 위해 인위적으로 바꾸지 않습니다.
- 이미 존재하는 38-function scope와 direct-JSDoc adjacency contract는 유지합니다.
- generic keyword 개수 대신 실제 계약 동작과 authority/evidence boundary가 함께 드러나야 합니다.
- `direct`는 JSDoc 종료와 function declaration 사이에 whitespace 외 다른 comment/code가 없는 구조적 조건이어야 합니다.
- 특정 문구 하나를 강제해 서로 다른 authority boundary의 자연스러운 설명을 깨지 않습니다.
- Production execution, merge-admission logic, provider routing, foreign domain truth, quarantine/security runtime, outbound authority는 변경하지 않습니다.

## Alternatives

1. `status`만 제거하거나 특별 취급: `current`, `check`, `workflow` 같은 다른 단일 generic token이 그대로 false PASS를 만들기 때문에 기각했습니다.
2. 서로 다른 vocabulary term 두 개 이상만 요구: RED `17298a4202b5f7cfa0f5183a1e8e26b8f7defe41`이 `/** Returns the current status. */`를 통과시키는 false confidence를 입증해 기각했습니다.
3. 모든 함수에 하나의 고정 문구를 요구: 각 함수의 실제 authority/evidence semantics를 문구 템플릿에 맞추게 되어 기각했습니다.
4. JSDoc이 계약 동작(action)과 authority/evidence boundary를 각각 최소 하나씩 명시하도록 두 축을 분리: 기존 자연어 JSDoc을 유지하면서 generic 상태 보고 문구를 배제할 수 있어 채택했습니다.
5. adjacency는 prefix의 마지막 `*/`만 확인: intervening block comment를 direct JSDoc으로 오인하므로 기각했습니다. 선택한 방식은 마지막 `/**`에서 시작한 JSDoc의 첫 `*/`가 trimmed declaration prefix의 마지막 두 바이트와 정확히 일치하도록 요구합니다.

## Decision

초기 RED `af1bfe808cf4364013a970ffcf66fbdd31953151`은 `/** current */`만 가진 `weakContract()`가 predecessor helper를 통과한다는 약점을 executable하게 고정했습니다. 첫 repair `485c443e1768f3ad109a5bd385229bf00386c316`은 서로 다른 contract term 두 개를 요구했습니다.

Fresh owner audit의 second RED `17298a4202b5f7cfa0f5183a1e8e26b8f7defe41`은 `/** Returns the current status. */`도 거부되어야 함을 executable하게 추가했습니다. 이 fixture는 `485c443e…`의 two-term gate를 통과하므로 첫 repair가 충분하지 않다는 현실 RED입니다.

Semantic GREEN `64ebbaa75e3724c885abd0236cfd760f576729f5`은 `expectDirectJsDoc()`을 두 개의 독립 축으로 바꿨습니다. 첫 축은 `preserve`, `reject`, `require`, `bind`, `accept`, `admit`, `retain`, `resolve`, `classify`, `revalidate`, `assemble`, `execute`, `record`, `select`, `match`, `order`, `evaluate`, `build`, `detect`, `extract`, `trust`, `fail-closed` 계열의 계약 동작을 요구합니다. 둘째 축은 authority/identity/evidence/chronology/workflow/check/status/review/head/base/producer/publisher/credential/rule/audit/result/parameter/merge/retry/source/control/failure/governance 계열의 경계를 요구합니다. 따라서 `current`, `status`, `check`, `workflow` 같은 상태·도메인 단어만 나열해서는 통과할 수 없습니다.

Adjacency RED `ed80b497c00a22be89a9d11085b8a3ce0fdd9baa`은 `/** Reject invalid status authority. */` 뒤에 unrelated block comment를 삽입한 fixture가 거부되어야 한다고 요구합니다. Predecessor helper는 의미 vocabulary를 만족하는 앞선 JSDoc과 마지막 block-comment terminator를 하나의 direct contract처럼 결합해 이 fixture를 false PASS했습니다. GREEN `291a60ce77587e647a3bf09e90cbc5eddfc99b09`은 마지막 JSDoc 시작 뒤 첫 `*/`의 위치가 trimmed declaration prefix의 끝과 정확히 같아야 한다고 요구합니다. 따라서 JSDoc과 declaration 사이에는 whitespace만 허용되며 별도 comment/code가 끼면 fail closed합니다.

38-function allowlist와 production source는 변경하지 않았습니다.

## Evidence and traceability

- Independent review finding: PR #730, CodeRabbit review run `ce099b85-b0c4-4037-b8eb-e2e2465efc31`, review comment `4091398548`.
- Pre-fix exact: `1cfc08e0be9b922ba332825f1327a728afd28a8c`.
- Initial RED: `af1bfe808cf4364013a970ffcf66fbdd31953151`.
- Insufficient first repair: `485c443e1768f3ad109a5bd385229bf00386c316`.
- Follow-up RED proving two generic terms still false-pass: `17298a4202b5f7cfa0f5183a1e8e26b8f7defe41`.
- Semantic GREEN repair: `64ebbaa75e3724c885abd0236cfd760f576729f5`.
- Follow-up adjacency RED: `ed80b497c00a22be89a9d11085b8a3ce0fdd9baa`.
- Adjacency GREEN repair: `291a60ce77587e647a3bf09e90cbc5eddfc99b09`.
- Executable contract: `test/commercial-readiness-production-docstrings.test.ts`.
- Existing scope authority: `docs/doctoring/2026-09-22-commercial-readiness-production-docstring-contract.md` and `test/commercial-readiness-production-docstring-scope.test.ts`.

## Residual risk

Action/boundary vocabulary 역시 자연어 의미를 완전히 증명하는 정적 분석은 아닙니다. 하지만 single-token 또는 generic `current status`형 false PASS와 non-direct block-comment separation을 차단하면서 기존 38개 production JSDoc의 서로 다른 계약 표현을 보존합니다. Independent review와 hosted exact-head tests는 계속 별도 evidence이며, current exact는 두 evidence가 완료되기 전 merge authority가 아닙니다.