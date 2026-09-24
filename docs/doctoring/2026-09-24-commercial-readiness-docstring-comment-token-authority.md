# Commercial-readiness JSDoc comment-token authority

Status: Proposed
Date: 2026-09-24 KST

## Problem

The direct-production-JSDoc oracle on PR #730 already rejected generic wording, intervening comments, line-comment lookalikes, template-literal declaration lookalikes, and nested function declarations. A remaining lexical false PASS existed in the comment detector itself: the raw-text matcher could treat `/** ... */` text nested inside a regular `/* ... */` block as a real JSDoc token when that outer block ended immediately before the top-level function declaration.

This matters because the 38-function contract is evidence about production documentation, not about substrings that resemble documentation. A regular block comment that merely contains JSDoc-looking text must not acquire JSDoc authority.

## Constraints

- Preserve the existing 38-function owned production scope.
- Preserve the action + authority/evidence semantic contract.
- Keep declaration authority restricted to actual named top-level `FunctionDeclaration` nodes.
- Do not change production merge-admission behavior, workflow/check/review/base authority, provider routing, foreign domain truth, quarantine/security runtime, or outbound authority.
- Do not implement another partial JavaScript lexer in test code when the repository already depends on TypeScript's parser and comment scanner.

## Alternatives

1. Add another raw regular-expression exclusion for an earlier `/*`: rejected because nested lexical contexts and comment trivia are parser concerns, and another regex would continue the same false-confidence pattern.
2. Keep AST declaration binding but retain raw-text comment matching: rejected because declaration identity and comment-token identity would be proved by different lexical models.
3. Use TypeScript `getLeadingCommentRanges()` on the actual top-level declaration and require the final leading comment range to be `MultiLineCommentTrivia` whose source text starts with `/**`: selected. This reuses the parser/scanner already authoritative for the declaration and distinguishes a real JSDoc token from JSDoc-looking bytes inside another comment.

## Decision

RED `19ba79935e31b4e01d7bbdc2a939671d715c02b9` adds a hostile fixture containing a regular block comment whose body starts with `/** Reject invalid status authority. */` immediately before `weakContract()`. The predecessor raw-text matcher selects the inner substring and false-passes the fixture.

GREEN `15d54e2594bead51ca6666f916b9b27c5d967dce` replaces raw-text direct-comment discovery with TypeScript leading-comment ranges on the already-resolved top-level `FunctionDeclaration`. The final leading comment must be `MultiLineCommentTrivia`, its exact source token must start with `/**`, and only whitespace may appear between that comment range and the declaration start. The existing semantic action + authority/evidence checks remain unchanged.

A focused local parser probe using TypeScript 5.8.3 confirms the selected contract: canonical direct JSDoc passes; line-comment lookalikes, the new regular-block nested lookalike, an intervening regular block comment, nested declarations, and template-literal declaration lookalikes all fail closed.

## Evidence and traceability

- Predecessor exact: `08fcf73311bea0b67bc2123b9dd3508121231c56`.
- RED: `19ba79935e31b4e01d7bbdc2a939671d715c02b9`.
- GREEN: `15d54e2594bead51ca6666f916b9b27c5d967dce`.
- Executable contract: `test/commercial-readiness-production-docstrings.test.ts`.
- Related semantic/token/declaration lineage: `docs/doctoring/2026-09-24-commercial-readiness-docstring-semantic-contract.md`.

## Residual risk

The semantic vocabulary remains a bounded static contract rather than natural-language proof. The structural side now delegates declaration and leading-comment token identity to the same TypeScript parser/scanner instead of mixing AST declaration identity with raw-text comment identity. Hosted exact-head CI and fresh independent/formal current-head review remain separate merge evidence.