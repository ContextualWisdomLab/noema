# Commercial readiness — exact Noema reviewer login authority

Status: Proposed

## Problem

The operator contract says that only the GitHub Bot whose login is exactly `NOEMA_REVIEWER_LOGIN` may create Noema review authority. Production still case-folded both `review.user.login` and the configured trusted login inside `isTrustedNoemaBot()`. A synthetically malformed review payload with `Noema-reviewer[bot]` or `NOEMA-REVIEWER[BOT]` could therefore be admitted as the configured `noema-reviewer[bot]` when every other exact-head gate was valid.

GitHub's Pull Request Reviews API exposes the review `user`, `state`, `body`, and `commit_id` as distinct response fields and returns the review list in chronological order. Noema should consume that platform identity as observed, not manufacture a second identity by case folding.

## Constraints

- Preserve chronological review-list authority, exact `review.commit_id`, exact GitHub review `state`, credential marker, canonical marker serialization, marker-envelope cardinality, and prior-revocation semantics.
- Do not broaden issue #29 Reviewer/Maintainer App identity or eligibility ownership into this lane; this change only makes the existing configured reviewer-login consumption exact.
- Do not change provider/model routing, quarantine/security runtime, outbound authority, product-domain truth, release/deployment authority, or the normal-merge write boundary.
- Keep the 38-function production-docstring scope unchanged by implementing the admission check inside the already-scoped `parseNoemaReviewDecision()` function.

## Alternatives

1. Keep case-folding because GitHub account lookup is case-insensitive: rejected. Repository/account lookup semantics do not justify normalizing an authority-bearing field already returned by the review API, and the operator contract explicitly requires exact reviewer identity.
2. Make `isTrustedNoemaBot()` itself exact and add it to the production-docstring scope: valid but wider than necessary for this repair.
3. Preserve the helper and add an exact `review.user.login === configured login` guard inside `parseNoemaReviewDecision()`: selected. It is the smallest causal change at the merge-authority boundary already covered by the production-docstring contract.

## RED → repair evidence

Executable RED `6c38a7516b8dc25958d36457efa0dff9a3ca43d8` adds `test/commercial-readiness-noema-reviewer-login-authority.test.ts`. It preserves the canonical reviewer as `approve` but requires case variants to return `null`. The hosted runs for that intermediate exact were superseded and cancelled after the ordinary-forward repair, so they are not claimed as hosted RED evidence.

A direct semantic probe against the predecessor logic produced `oldCanonical=approve`, `oldCaseVariant=approve`; the repaired admission produced `newCanonical=approve`, `newCaseVariant=null`. This is source-level evidence only and does not substitute for exact-head hosted CI.

Production commit `da776350675a756c95d567d6a6157d14d8eff102` added the exact reviewer-login guard, but whole-file contents replacement accidentally serialized one unrelated newline as the literal characters `\\n` in `dispatchProductDevelopment()`. Commit diff inspection caught that preservation regression immediately. Ordinary-forward repair `6d305d047a8b72573f93bd05b164daae1852020b` restores that line without reverting the reviewer-login fix. Therefore `da776350…` is not treated as GREEN; `6d305d047…` is the first source exact carrying both the intended repair and the restored unrelated behavior.

## TRACEABILITY

- GitHub. (2026). *REST API endpoints for pull request reviews*. GitHub Docs. https://docs.github.com/en/rest/pulls/reviews
- Executable RED: `test/commercial-readiness-noema-reviewer-login-authority.test.ts` @ `6c38a7516b8dc25958d36457efa0dff9a3ca43d8`
- Production exact-login repair: `scripts/hourly-commercial-readiness.mjs` @ `da776350675a756c95d567d6a6157d14d8eff102`
- Immediate preservation repair / source GREEN candidate: `scripts/hourly-commercial-readiness.mjs` @ `6d305d047a8b72573f93bd05b164daae1852020b`
- Operator contract: `docs/hourly-commercial-readiness-loop.md` already requires `NOEMA_REVIEWER_LOGIN` to match the trusted GitHub Bot exactly.

## Risk and follow-up

The exact comparison assumes the configured reviewer login uses the same canonical spelling returned by GitHub. Current Noema configuration and historical review evidence use `noema-reviewer[bot]`; a mismatched operator configuration will fail closed and request a fresh review rather than manufacture authority.

Fresh hosted application CI, reviewer-ci, required Security Scan, patch-validator-image, and formal current-head Noema review remain mandatory before Ready/merge. This repair does not establish immutable-release or deployment evidence.
