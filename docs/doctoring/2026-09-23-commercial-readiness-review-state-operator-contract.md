# Commercial readiness review-state operator contract

Status: Proposed

## Problem

`parseNoemaReviewDecision()` already binds a current-head Noema marker to GitHub's platform review state exactly: `approve` is authoritative only with `APPROVED`, while `request_changes` and `blocked` require `CHANGES_REQUESTED`. The active operator guide documented bot identity, `commit_id`, credential marker and exact head marker, but omitted this final platform-state predicate. A current-head operator could therefore troubleshoot a marker as authoritative even when `review.state` was missing, noncanonical, or incompatible with the marker decision.

Fresh independent review of exact `b131ee030fca8cf66050023a270d7375b246d352` identified this docs-to-code drift. Production behavior was already fail closed; this repair does not change executable review authority.

## Constraints and owner boundary

Noema owns review admission for its commercial merge loop. Reviewer App identity and eligibility remain issue #29 authority; repository ruleset and branch governance remain issue #27 authority. This decision does not alter contextual-orchestrator provider routing, quarantine/security runtime, outbound authority, product-domain truth, or release/deployment authority.

The operator contract must preserve GitHub platform review state as observed. It must not case-fold, trim, infer, or synthesize `APPROVED` or `CHANGES_REQUESTED` from reviewer-authored body text.

## Alternatives

1. Leave state compatibility implicit in production source. Rejected because the active runbook is used for incident diagnosis and would remain weaker than the code it operates.
2. Normalize GitHub review state in the operator model. Rejected because normalization can promote a noncanonical observation into authority and diverges from the existing fail-closed production predicate.
3. Document the exact state-to-marker mapping and make the guide contract executable. Selected because it preserves the current production boundary without expanding authority.

## Decision

The active review section now states that `approve` requires exact GitHub review `state=APPROVED`, while `request_changes` and `blocked` require exact `state=CHANGES_REQUESTED`. Missing, lowercase/noncanonical, or marker-incompatible state is non-authoritative. The operational checklist now asks operators to verify this mapping together with exact reviewer login and exact-head `commit_id`.

RED `5eda0dea62e268f21cb26712d04cb729cb75d6af` adds an executable guide contract before the guide is changed. GREEN `0594f474652566b7ba2b233bd5e4395a4960ded2` updates only the active operator guide. No production statement changes in this RED→GREEN pair.

## Evidence and TRACEABILITY

GitHub's Pull Request Reviews REST API exposes submitted review actions such as `APPROVE` and `REQUEST_CHANGES`; the review object separately carries the platform review state and `commit_id`. Primary reference: GitHub, *REST API endpoints for pull request reviews*, https://docs.github.com/en/rest/pulls/reviews (retrieved 2026-09-23).

Current production authority is `scripts/hourly-commercial-readiness.mjs::parseNoemaReviewDecision()`. The current-head independent finding is recorded on PR #730 against predecessor exact `b131ee030fca8cf66050023a270d7375b246d352`.

## Risk, effect, and follow-up

The repair reduces operator false-positive interpretation but does not itself provide merge authority. Current exact still requires fresh independent current-head review and every applicable hosted gate to reach terminal GREEN. Any later change to accepted Noema marker decisions or GitHub review-state handling must update production, executable guide contract, operator guide, and this decision record together.
