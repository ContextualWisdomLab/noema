# Commercial-readiness Noema review dismissal authority

Status: Proposed  
Date: 2026-09-23 KST  
Owner boundary: Noema commercial-readiness merge admission only

## Problem

`parseNoemaReviewDecision()` consumed GitHub's chronological pull-request review list and retained the last compatible trusted Noema marker. A trusted exact-head review whose GitHub state later became `DISMISSED` was ignored as incompatible instead of revoking prior authority. With an older exact-head `APPROVED` review still present, the parser could therefore fall back to that older approval even though GitHub had explicitly dismissed a later trusted review.

GitHub's REST contract makes dismissal an authority-bearing state transition: the dismiss endpoint changes the specified review to `state: DISMISSED`, while GitHub's user documentation states that dismissing a review changes its status to a review comment. The commercial-readiness evaluator already removes `DISMISSED` reviews from effective reviewer state, so allowing the Noema-specific parser to retain an older approval would create two contradictory review authorities inside the same merge decision.

## Constraints

- Preserve GitHub REST list order; do not synthesize review chronology from timestamps or review ids.
- Keep `NOEMA_REVIEWER_LOGIN`, exact `commit_id`, credential marker, marker cardinality, exact marker serialization, and marker-to-platform-state compatibility unchanged.
- Do not let a dismissal of another reviewer or another head revoke the trusted exact-head Noema decision.
- A trusted exact-head `DISMISSED` review must revoke prior Noema authority even if its body is absent or no longer contains the interop marker. Dismissal is GitHub platform state, not body text authority.
- A later canonical exact-head Noema review may establish new authority after an earlier dismissal.

## Alternatives

1. Ignore `DISMISSED` in the Noema parser and rely on the generic reviewer-state projection. Rejected: the generic projection only blocks effective `CHANGES_REQUESTED`; it does not require a current trusted Noema `APPROVED` state, so an older parsed approval could still satisfy merge admission.
2. Re-sort reviews by dismissal time, `submitted_at`, or review id. Rejected: the list endpoint already supplies platform order and synthetic ordering reintroduces the chronology defects repaired earlier in this lane.
3. Treat trusted exact-head `DISMISSED` as a state-machine revocation. Selected: it aligns the Noema-specific authority with the generic review-state semantics and fails closed without expanding any foreign owner boundary.

## RED → repair evidence

- RED `769cf3806208aa862dfdc0ec1d74b5c4f3deb5d4` adds hostile cases proving that a later trusted exact-head dismissal cannot fall back to an older approval, that a later approval can supersede an earlier dismissal, and that dismissal revokes even when its body marker is absent.
- Production repair `9aa82cb310b21c1e77d6c096ab3655820dc5753d` changes only `parseNoemaReviewDecision()` authority semantics, replacing candidate fallback with one chronological decision state that is cleared by trusted exact-head `DISMISSED`.
- During the whole-file connector update, the CLI entrypoint tail was unintentionally omitted. Exact commit diff review detected this unrelated regression immediately. Repair `fb6026064997117acaf10281083ccc345aa2ed8e` restores only the pre-existing `import.meta.url` CLI invocation block. This incident is retained as evidence for why whole-file replacement is not treated as a safe substitute for a true patch surface.

Hosted exact-head CI and formal current-head Noema review remain independent evidence. Source repair does not claim terminal GREEN, merge authority, release, deployment, reviewer-App provisioning, repository governance, provider routing, quarantine/security, outbound authority, or foreign-domain truth.

## Risk and follow-up

The remaining behavioral risk is GitHub changing review-list or dismissal semantics. Keep the hostile dismissal cases executable and continue treating unknown states as non-authoritative. The active operator guide and commercial gap baseline must state that trusted exact-head `DISMISSED` revokes prior Noema review authority. `CHANGELOG.md` must be updated before release readiness is claimed.

## TRACEABILITY / References

GitHub. (2026). *REST API endpoints for pull request reviews: Dismiss a review for a pull request*. GitHub Docs. https://docs.github.com/en/rest/pulls/reviews#dismiss-a-review-for-a-pull-request

GitHub. (2026). *Dismissing a pull request review*. GitHub Docs. https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/dismissing-a-pull-request-review
