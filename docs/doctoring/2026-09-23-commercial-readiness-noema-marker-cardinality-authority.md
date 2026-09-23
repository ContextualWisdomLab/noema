# Noema review marker cardinality authority

Status: Proposed

## Problem

`parseNoemaReviewDecision()` accepted a trusted exact-head review body containing more than one canonical `noema-review-gate` marker and selected the final textual match. That created authority from an ordering that GitHub does not define: GitHub gives the review one body, one review state and one `commit_id`, but it does not assign chronology to multiple protocol markers embedded inside that body. A body containing `blocked` followed by `approve` could therefore be projected as `approve` solely because the approval marker appeared later in the Markdown.

This is different from chronology across separate review submissions. GitHub's list-reviews endpoint returns reviews in chronological order, so Noema may use that API order across review objects after each individual review has been admitted as unambiguous evidence. GitHub also exposes the review body, state and commit binding as fields of the review resource; the Noema HTML marker is an owner-defined protocol inside the body, not a second GitHub chronology source.

## Constraints

- Keep review ordering across separate GitHub review objects in GitHub REST list order.
- Keep exact `review.commit_id`, trusted reviewer Bot identity, reviewer credential marker and GitHub review-state compatibility requirements.
- Do not normalize marker case, head SHA or decision tokens.
- Do not infer authority from body text order when one review contains multiple canonical markers.
- Do not move GitHub identity, repository governance or provider-routing authority into this parser.

## Alternatives

1. **Use the last marker in the body.** Rejected because Markdown position is not an authenticated decision chronology and conflicting markers can promote one decision without an external ordering rule.
2. **Use the first marker in the body.** Rejected for the same reason; choosing the opposite arbitrary order is still invented authority.
3. **Accept repeated identical markers but reject conflicting markers.** Rejected because duplicate serialization still makes the owner protocol non-canonical and complicates audit/replay semantics without buyer value.
4. **Require exactly one canonical marker per trusted review body.** Selected. Zero or multiple canonical markers fail closed for that review object; later or earlier separate GitHub reviews remain ordered by the REST list contract.

## RED → GREEN

RED `4f89a4a6a232a8b598da23cc551a66c12d1d4233` adds hostile cases for one exact-head trusted `APPROVED` review containing (a) `blocked` then `approve`, and (b) the same `approve` marker twice. The predecessor parser returned `approve` because it retained the final regex match.

Production GREEN `161db073684844d0a0518126f0fa10246dc7d4f0` collects all canonical markers in the review body and admits the review only when the cardinality is exactly one and that marker carries the exact expected head SHA. The existing decision↔GitHub-state compatibility remains unchanged.

Operator-guide synchronization `7c0de078fc51e94314dc125b0ac02f6b74f826bf` records the same one-marker invariant and the corresponding diagnostic step.

## Effects and residual risk

The repair removes an ambiguous body-order false-PASS path without broadening merge authority. A malformed or duplicated reviewer body can now cause a current-head approval to be treated as missing, which is intentionally fail closed and should trigger a fresh canonical review rather than local marker repair.

This does not prove that the reviewer App emitted the body from a current contextual-orchestrator evaluation; that remains governed by the reviewer workflow, credential/head binding and GitHub review state. Hosted exact-head checks and current-head independent review remain required before merge.

## TRACEABILITY

- GitHub Docs. (2026). *REST API endpoints for pull request reviews*. https://docs.github.com/en/rest/pulls/reviews — pull request reviews are review objects with a state and optional body; list-reviews is returned in chronological order.
- Owner source: `scripts/hourly-commercial-readiness.mjs` → `parseNoemaReviewDecision()`.
- Hostile regression: `test/commercial-readiness-noema-marker-cardinality-authority.test.ts`.
- Operator contract: `docs/hourly-commercial-readiness-loop.md` → `리뷰와 head 결속`.

No immutable release, deployment, recovery rehearsal or buyer evidence is claimed by this source repair.