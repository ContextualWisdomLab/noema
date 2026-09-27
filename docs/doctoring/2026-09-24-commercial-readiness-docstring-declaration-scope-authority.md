# Commercial-readiness docstring declaration-scope authority

Status: Proposed
Date: 2026-09-24 KST

## Problem

PR #730의 direct-JSDoc executable contract는 template literal 내부의 function-like text를 배제하기 위해 TypeScript AST를 사용하도록 수리됐지만, predecessor `8bb181f5c51c814507df2721bc69567e36f190ae`의 `functionDeclarationStart()`는 전체 AST를 재귀 순회했습니다. 따라서 실제 top-level production declaration보다 먼저 나타나는 nested `FunctionDeclaration`이 같은 이름과 충분한 JSDoc을 가지면, nested declaration이 production declaration authority를 대신할 수 있었습니다.

이는 기존 semantic/token/adjacency 수리와 별개의 declaration-scope false PASS입니다. 이 테스트의 소유 범위는 세 production module의 top-level named function declarations이며 nested helper lookalike는 해당 production contract의 증거가 아닙니다.

## Constraints

- Production source와 38-function allowlist는 변경하지 않습니다.
- TypeScript parser 사용은 유지하되, repository contract가 실제로 소유하는 top-level named function declaration만 authority로 인정합니다.
- raw-text regex나 재귀 AST 검색으로 되돌아가지 않습니다.
- 다른 제품 domain truth, LLM provider routing, quarantine/security runtime, outbound authority, release authority를 취득하지 않습니다.

## Alternatives

1. 전체 AST에서 첫 matching `FunctionDeclaration`을 선택: nested declaration이 top-level production declaration을 가릴 수 있어 기각했습니다.
2. declaration depth를 별도 visitor state로 추적: 구현 가능하지만 `SourceFile.statements`가 이 contract의 top-level scope를 직접 표현하므로 불필요한 복잡성을 추가합니다.
3. `SourceFile.statements`에서 matching named `FunctionDeclaration`을 선택: production scope와 AST authority가 일치하고 nested lookalike를 자연스럽게 배제하므로 채택했습니다.

## Decision

RED `1048c4866eda1354b60b5461346d6961c58397b0`은 semantic direct JSDoc이 붙은 nested `weakContract()`를 실제 undocumented top-level `weakContract()`보다 먼저 배치합니다. Predecessor recursive visitor는 nested declaration을 선택해 fixture를 false PASS하므로 새 hostile test가 실패합니다.

GREEN `b7a746bee2f5a126be9fd512e6139d45bf704277`은 `functionDeclarationStart()`를 `sourceFile.statements`의 named `FunctionDeclaration` 탐색으로 제한합니다. Nested declaration은 production declaration authority가 될 수 없고, 기존 template-literal/token/adjacency/semantic hostile fixtures와 38-function allowlist는 그대로 유지됩니다.

RED→GREEN production execution 변화는 없으며 변경은 executable test oracle 내부에만 한정됩니다.

## Evidence and traceability

- Predecessor exact: `8bb181f5c51c814507df2721bc69567e36f190ae`.
- RED: `1048c4866eda1354b60b5461346d6961c58397b0`.
- GREEN: `b7a746bee2f5a126be9fd512e6139d45bf704277`.
- Executable contract: `test/commercial-readiness-production-docstrings.test.ts`.
- Related semantic/token authority record: `docs/doctoring/2026-09-24-commercial-readiness-docstring-semantic-contract.md`.

## Residual risk

이 contract는 Noema #730이 소유한 top-level named function declarations에 의도적으로 한정됩니다. Arrow function, class method, function expression까지 범용 JSDoc framework로 확장하지 않습니다. 동일 이름의 top-level declarations가 복수 존재하는 비정상 source shape는 현재 별도 ambiguity contract로 모델링하지 않으며, production source 또는 scope가 그 형태로 변하면 executable scope contract를 함께 갱신해야 합니다. Hosted exact-head GREEN과 independent/formal current-head review는 별도 merge evidence로 계속 요구됩니다.