# Commercial-readiness docstring declaration-token authority

Status: Proposed
Date: 2026-09-24 KST

## Problem

PR #730의 direct-JSDoc executable oracle은 JSDoc comment 자체의 의미·adjacency·comment-token 형태를 강화했지만, 검사 대상 function declaration의 위치는 여전히 raw-text 정규식으로 찾았습니다. 따라서 template literal이나 다른 lexical context 안에 `function <name>(` 모양의 텍스트가 실제 production declaration보다 먼저 등장하면, helper가 그 문자열을 declaration으로 오인할 수 있었습니다.

이 경우 template literal 안에 `/** Reject invalid status authority. */`와 같은 JSDoc-like text가 바로 앞에 있으면 기존 helper는 실제 production function에 direct JSDoc이 없어도 계약을 통과시킬 수 있습니다. 이는 comment token만 lexical하게 보강하고 declaration token은 raw text로 남겨 둔 비대칭 false PASS입니다.

## Constraints

- Production source와 38-function allowlist는 변경하지 않습니다.
- Test oracle만 수리하며 production runtime dependency를 추가하지 않습니다.
- 저장소에 이미 devDependency로 존재하는 TypeScript compiler API를 사용합니다.
- `export`/`async` modifier와 top-level JavaScript function declaration을 정상적으로 인식해야 합니다.
- string/comment 내부의 function-like text는 declaration authority를 얻지 못해야 합니다.
- 기존 semantic action + authority/evidence boundary, direct JSDoc adjacency, line-comment/block-comment hostile fixtures는 그대로 유지합니다.

## Alternatives

1. Declaration 정규식에 line-start anchor만 추가: template literal 내부의 line-start `function ...`도 raw source에서는 동일하게 보이므로 false PASS를 닫지 못해 기각했습니다.
2. 문자열/주석을 별도 정규식으로 제거한 뒤 declaration을 검색: JavaScript lexical grammar를 부분 재구현하게 되고 template/escape/regex literal 처리에서 새 false confidence를 만들 수 있어 기각했습니다.
3. TypeScript parser로 실제 `FunctionDeclaration` AST node를 찾고, 그 token start를 기존 direct-JSDoc 구조/의미 검사에 전달: 이미 pinning된 devDependency를 재사용하고 lexical context를 parser에 위임하므로 채택했습니다.

## Decision

RED `223187b159782904cb279e495876b0359c9bfcaf`은 template literal 안에 semantic JSDoc-like text와 `function weakContract() {}`를 넣고, 그 뒤에 실제 `weakContract()` declaration을 별도로 둔 hostile fixture를 추가합니다. Predecessor helper는 첫 raw-text `function weakContract(`를 declaration으로 선택하므로 `expectDirectJsDoc()`가 throw하지 않아 이 테스트가 실패합니다.

GREEN `42183f7d7ed7949164bff140252164e8a80a057d`은 `typescript` compiler API의 `createSourceFile(..., ScriptKind.JS)`와 AST traversal을 사용해 실제 `FunctionDeclaration` node 중 이름이 정확히 일치하는 declaration의 `getStart()` 위치만 authority로 사용합니다. 이후 기존 direct-JSDoc structural matcher와 action/boundary semantic contract를 그대로 적용합니다.

이 변경은 test oracle에만 한정됩니다. Production merge-admission, workflow/check provenance, review/head/base binding, reviewer publisher, normal-merge authority는 변경하지 않습니다.

## Evidence and traceability

- Predecessor exact: `7f9d1264c513934cb55eeaa7a02ce506eac16a61`.
- Declaration-token RED: `223187b159782904cb279e495876b0359c9bfcaf`.
- AST-bound GREEN: `42183f7d7ed7949164bff140252164e8a80a057d`.
- Executable contract: `test/commercial-readiness-production-docstrings.test.ts`.
- Existing semantic/token doctoring: `docs/doctoring/2026-09-24-commercial-readiness-docstring-semantic-contract.md`.
- Dependency authority: repository `package.json` already declares `typescript` as a development dependency; no runtime dependency is introduced.

## Residual risk

이 oracle은 현재 #730이 소유한 named function declaration 38개를 대상으로 합니다. Arrow function, class method, anonymous function까지 일반화한 docstring framework가 아니며 이를 암묵적으로 지원한다고 주장하지 않습니다. AST declaration identity를 확보한 뒤에도 JSDoc 자연어의 의미 충분성은 action/boundary vocabulary를 이용한 보수적 정적 계약이므로 semantic completeness를 완전히 증명하지는 않습니다. Hosted exact-head tests와 fresh independent/formal current-head review는 별도 merge evidence로 남습니다.