# Commercial-readiness review head binding

Date: 2026-09-22 KST
Status: Proposed

## Problem

The commercial-readiness merge gate accepted a trusted Noema review when the review body carried the current `head_sha` marker even if GitHub's review object omitted `commit_id`. That made a body-controlled marker sufficient to supply the missing platform-side binding between the submitted review and the reviewed commit.

The merge gate already rejects an explicitly stale `commit_id`, but the previous condition treated an absent value as acceptable. A trusted reviewer response therefore had two different identity requirements depending on whether GitHub returned the field: mismatched platform identity failed closed, while missing platform identity failed open.

## Constraint

Noema may interpret its own reviewer credential and decision marker, but it must not manufacture GitHub review provenance. Current-head merge authority requires both the trusted reviewer decision and GitHub's review-to-commit association. Missing platform identity is incomplete evidence, not equivalent evidence.

This repair does not change reviewer eligibility, App installation authority, provider routing, product-domain truth, quarantine/security runtime, outbound authority, or repository governance ownership. Issue #29 remains the owner for Reviewer/Maintainer App identity and eligibility; issue #27 remains the repository governance control-plane owner.

## Decision

`parseNoemaReviewDecision()` now requires `review.commit_id === expectedHeadSha` before inspecting the credential marker or Noema decision marker. A missing, malformed, or different `commit_id` is ignored as non-authoritative review evidence.

RED `d878a43b4eaaa083433561bf4df2b82d3ff067bd` adds a hostile trusted-bot approval with the current marker but no `commit_id`; the predecessor parser admits it. GREEN `1fd432a50ce969d73dba4f16fbb8281e297d9773` changes only the review-head predicate plus its production docstring so that the same case returns no Noema decision.

## Alternatives rejected

- Trust the body `head_sha` marker when `commit_id` is absent: rejected because the marker is reviewer-authored payload, not GitHub's review-to-commit binding.
- Accept any review whose `commit_id` is absent but whose PR currently points at the marked head: rejected because PR head identity and review submission identity are separate facts.
- Require only `commit_id` and drop the signed/credentialed marker: rejected because the platform commit association alone does not establish the Noema reviewer protocol decision.

## Effects and risks

The change is fail closed. Legitimate reviewer responses that do not expose `commit_id` will not become merge authority and may cause another exact-head review request. This is preferable to accepting unverifiable review provenance. Existing reviews with a matching exact `commit_id`, trusted bot identity, Noema credential marker, compatible GitHub review state, and matching Noema decision marker are unchanged.

No hosted result is inferred from this source repair. The successor exact head must obtain its own hosted checks and independent current-head review before Ready/normal merge.

## TRACEABILITY

GitHub. (2026). *REST API endpoints for pull request reviews*. GitHub Docs. https://docs.github.com/en/rest/pulls/reviews

The GitHub REST review collection is the authoritative platform surface consumed by the commercial-readiness loop. Live Noema review payloads on 2026-09-22 expose a `commit_id` for submitted reviews; current-head authority therefore binds to that platform field rather than treating its absence as equivalent to the expected head.
