# Commercial-readiness review credential successor authority

Date: 2026-09-23
Owner: Noema commercial merge-admission boundary
Status: Proposed; exact-head hosted verification and formal Noema review remain required

## Problem

`parseNoemaReviewDecision()` consumes GitHub's chronological pull-request review list and projects the latest trustworthy Noema gate decision for the exact current head. The predecessor correctly revoked an older approval when a later credentialed exact-head gate was malformed, dismissed, or incompatible with its GitHub review state. It did not revoke that approval when the later trusted exact-head review contained a canonical `noema-review-gate` marker but omitted the required Noema reviewer credential marker (`Reviewer credential: noema-github-app`).

That sequence could leave the older `approve` decision active even though a later gate-shaped review had lost one of Noema's authentication predicates. Generic review-state projection would still observe the later GitHub `APPROVED` state, so downstream validation could not distinguish the stale credentialed approval from the later uncredentialed gate attempt. This was a merge-authority false-PASS condition.

GitHub documents that the pull-request reviews endpoint returns reviews in chronological order and exposes the review body and state. Noema therefore treats that observed order as chronology authority and keeps its credential/marker protocol as a separate owner-controlled admission contract rather than synthesizing order from review IDs or timestamps.

Primary reference:

GitHub. (2026). *REST API endpoints for pull request reviews*. GitHub Docs. https://docs.github.com/en/rest/pulls/reviews

## Constraints

- Ordinary later trusted-bot reviews that do not contain a canonical Noema gate marker and do not claim the Noema credential must not revoke a valid gate decision merely because they are comments.
- A canonical Noema gate marker without the required credential cannot grant authority and must not allow an older credentialed approval to remain authoritative.
- Existing exact `review.commit_id`, GitHub review state, exact marker serialization, marker cardinality, dismissal, and chronological-list-order contracts must remain unchanged.
- The repair must not widen Reviewer/Maintainer App identity or eligibility authority, which remains owned by the existing governance lanes.

## Decision

For each trusted exact-head review, `parseNoemaReviewDecision()` now parses canonical gate markers before deciding whether the review is relevant to Noema gate authority.

- If neither the exact credential marker nor a canonical gate marker is present, the review is ordinary review traffic and does not alter the current Noema gate decision.
- If a canonical Noema gate marker is present without the exact credential marker, the current Noema gate decision is revoked and the review cannot grant replacement authority.
- If the credential marker is present, the prior fail-closed path remains: the current decision is cleared first, then exactly one exact-head canonical marker whose decision is compatible with the GitHub review state may establish the replacement decision.

This keeps ordinary comments non-authoritative while ensuring that a later gate-shaped review cannot silently fall back to an older approval after losing its credential predicate.

## RED → causal repair evidence

RED `d58b36940fa7130e769e6a406a2ef3d70c899a9c` adds an executable hostile sequence to `test/commercial-readiness-noema-review-malformed-successor-authority.test.ts`: an older exact-head credentialed approval followed by a later trusted exact-head `APPROVED` review containing the canonical approval marker but no Noema credential. The predecessor parser returns `approve`; a direct semantic reproduction observed `actual="approve"` where the required result is `null`.

Production repair `a0ee709d56d5a0df47b4f3d253ab79824f1e893f` changes only `scripts/hourly-commercial-readiness.mjs` relative to RED, with 8 additions and 4 deletions. The repaired semantic probe preserves canonical approval and an ordinary later comment, while the uncredentialed canonical-gate successor returns `null`.

Hosted exact-head GREEN is not inferred from that local semantic probe. The current successor still requires the repository's application CI, reviewer-ci, central Security Scan, patch-validator-image, and formal current-head Noema review before it can become merge authority.

## Alternatives rejected

**Ignore every uncredentialed review.** Rejected because a later canonical gate marker would then leave an older credentialed approval active, recreating the false PASS.

**Revoke on every later trusted-bot comment lacking the credential.** Rejected because ordinary review commentary is not a gate attempt and must not invalidate an otherwise valid current-head decision.

**Infer gate intent from free-form text containing `noema-review-gate`.** Rejected because quoted documentation or discussion could then revoke authority. Only a canonical marker parsed by the existing exact marker grammar triggers the uncredentialed-successor revocation path.

**Use review ID or `submitted_at` to choose a winner.** Rejected because GitHub already defines the list endpoint's result order as chronological; synthesizing an independent ordering can reorder malformed or incomplete observations.

## Residual risk and follow-up

The repair is source-level and test-level evidence, not a protected merge or immutable release. A future protocol change that adds a second credential form or changes gate serialization must update the parser, hostile fixtures, operator contract, and doctoring together. Formal reviewer App identity/eligibility, branch/ruleset governance, immutable release, deployment, recovery, and buyer-operability evidence remain separate authority classes.
