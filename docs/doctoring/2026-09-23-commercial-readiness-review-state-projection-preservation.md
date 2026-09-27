# Commercial readiness review-state projection preservation

Status: Proposed

## Problem

The malformed-successor Noema gate repair at `d6fa2d3ef154832efb8aa23c490b97c122780baf` correctly made a later credentialed but malformed exact-head gate revoke an older Noema approval. In the same whole-file source update, however, the independent generic `latestReviewStates()` projection was deleted even though `fetchPullRequestSnapshot()` still called it. That left the runtime with a deterministic `ReferenceError` before `evaluatePullRequest()` could assess any open pull request.

This was not a review-policy decision. It was an unrelated source-preservation regression introduced while changing `parseNoemaReviewDecision()`.

## Constraints

- Preserve the malformed-successor revocation semantics added by `d6fa2d3e…`.
- Preserve GitHub REST review-list order and `DISMISSED` revocation in the generic reviewer projection.
- Do not normalize reviewer state or replace the generic projection with the Noema-specific gate decision.
- Do not weaken hosted gates, formal Noema review authority, or normal-merge checks.
- Repair ordinary-forward without force-push or destructive rebase.

## Alternatives considered

1. Revert `d6fa2d3e…`. Rejected because it would re-open the stale-approval fallback that the malformed-successor test was added to prevent.
2. Remove the snapshot field and rely only on `parseNoemaReviewDecision()`. Rejected because generic reviewer approval/change-request authority and the Noema gate are distinct contracts.
3. Restore only the deleted generic projection and add a focused preservation test. Chosen because it repairs the causal regression without changing the intended Noema gate behavior.

## Decision and evidence

RED `ca11159a2f0986da913f141a26bd1d728306e9f9` imports `latestReviewStates()` directly and requires both ordinary approval/change-request projection and later `DISMISSED` revocation. On predecessor `d6fa2d3e…`, the named export is absent while `fetchPullRequestSnapshot()` still references it, so the regression is executable rather than documentary.

Production repair `b59abfa7c8da022aa919413353f7f93879171e33` restores exactly the deleted `latestReviewStates()` implementation. The commit changes only `scripts/hourly-commercial-readiness.mjs` by +18/-0. It does not remove the malformed-successor `currentDecision = null` reset in `parseNoemaReviewDecision()`.

## Risk and follow-up

The source-level causal repair is complete, but it is not hosted exact-head GREEN evidence. #730 must remain Draft until all applicable current-head hosted gates are terminal-success and formal current-head Noema review authority exists. The whole-file write surface remains a maintenance risk; preservation contracts should continue to guard unrelated exported/runtime entrypoints whenever authority code is edited.
