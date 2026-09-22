# Commercial readiness review-state authority

Status: Proposed  
Date: 2026-09-22  
Owner boundary: Noema commercial merge-admission only

## Problem

`parseNoemaReviewDecision()` already required the trusted Noema GitHub App review to carry the exact current `commit_id` and the reviewer-authored head/decision marker. The platform review `state`, however, was converted with `toUpperCase()` before authority admission. That meant a non-canonical value such as `approved` could be promoted to GitHub's canonical `APPROVED` state and combine with an `approve` marker to create merge authority.

Review state is platform evidence, not presentation text. Authority must therefore be admitted from the serialization GitHub supplied, not from a normalized derivative.

## Constraints

- Preserve exact current-head binding through `review.commit_id === expectedHeadSha`.
- Preserve the trusted Noema GitHub App identity and `Reviewer credential: noema-github-app` marker contract.
- Preserve the decision/body-marker compatibility check; this repair does not let reviewer-authored text replace platform state.
- Do not acquire issue #27 ruleset/control-plane ownership or issue #29 App identity/eligibility ownership.
- Do not self-approve, weaken hosted gates, or treat this source repair as merge authority.

## Decision

RED `94fbf94cd6d5e513879d84d87d0b75049e2d1f37` adds a hostile exact-head review whose body and `commit_id` are otherwise canonical but whose GitHub review state is lowercase `approved`. The predecessor implementation uppercased that value and returned `approve`, so the new contract is a deterministic RED.

GREEN `9ad9f44fa2487df05bc0758a2b1ca41cd3604c2e` removes case normalization at the Noema approval boundary. The parser now accepts the raw platform string only when it is exactly `APPROVED` for an approve decision or exactly `CHANGES_REQUESTED` for a rejecting decision. Missing, malformed, case-altered, or otherwise non-canonical review state cannot become Noema merge authority.

The production delta is deliberately narrow: one authority-bearing state projection changed; the remaining observed-check, workflow-provenance, current-PR/head/base, App-id, review-commit, normal-merge and owner-boundary contracts are unchanged.

## Alternatives considered

**Continue case-folding the platform state.** Rejected because normalization can manufacture canonical authority from malformed evidence.

**Trust only the reviewer-authored marker.** Rejected because the marker is content written by the reviewer; GitHub's review state and `commit_id` provide independent platform evidence that must agree with it.

**Broaden this repair to all review-state aggregation and chronology.** Rejected for this causal fix. `latestReviewStates()` and review chronology are separate evidence paths and should receive their own hostile contracts before behavior changes rather than being bundled into this repair.

## Risk and follow-up

The direct Noema approval path now fails closed on non-canonical platform review state. A separate audit should test whether general review-state aggregation (`latestReviewStates()`) can similarly promote malformed reviewer/state identities, and whether missing/invalid review chronology can create an authority ordering assumption. Those are follow-up findings, not claims of completion in this repair.

Hosted checks and a qualifying independent review remain revision-scoped. This repair is not merge authority until the final unchanged successor head has terminal hosted GREEN and fresh independent current-head evidence.

## TRACEABILITY

GitHub. (2026). *REST API endpoints for pull request reviews*. GitHub Docs. Retrieved September 22, 2026, from https://docs.github.com/en/rest/pulls/reviews?apiVersion=2026-03-10

Relevant contract: pull-request reviews are API objects grouped with a state, and the list-reviews operation returns reviews in chronological order. Noema treats the returned review-state serialization as authority-bearing evidence and does not case-fold it into an admissible state.
