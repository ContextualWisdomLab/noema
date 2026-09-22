# Commercial readiness: exact Noema decision authority

Status: Proposed

## Problem

`parseNoemaReviewDecision()` already admits a Noema review only after exact current-head `commit_id`, trusted bot identity, credential marker, review marker, and compatible GitHub review state are observed. The downstream evaluator nevertheless normalized `snapshot.noemaReviewDecision` with `trim().toLowerCase()` before granting merge authority. That meant a non-canonical projected token such as `APPROVE`, `Approve`, or ` approve ` could become the canonical `approve` decision at the final merge-admission boundary.

The adapter currently emits canonical lowercase decision tokens, but the evaluator is an independently exported production boundary. Authority-bearing projections must not regain authority by downstream normalization after an upstream exactness check.

## Constraint

The repair must not change reviewer identity, GitHub review-state semantics, current-head binding, hosted check authority, workflow provenance, provider routing, security/quarantine ownership, release/deployment authority, or issue #27/#29 control-plane ownership. Diagnostics may still normalize values for display, but merge authority must compare the decision token exactly.

## RED

Commit `95ef32135e97150e5f2a849da398f72fd2c4ea0d` adds `test/commercial-readiness-noema-decision-authority.test.ts`. The canonical `approve` fixture remains merge-ready, while `APPROVE`, `Approve`, and ` approve ` must be blocked. The predecessor evaluator normalizes all three to `approve`, so the hostile cases are deterministic RED against the predecessor production source.

## Decision and GREEN

Commit `232675e62c8bd2a183715967b7de37572aea2553` changes only the downstream decision admission from normalized lowercase text to `exactAuthorityString(snapshot.noemaReviewDecision)`. Exact `approve` retains authority. Case- or whitespace-altered tokens no longer become merge authority.

Because `validateReviews()` is now behaviorally changed authority-bearing production code, the same repair adds direct contract-oriented JSDoc. Successors `075f750bc6bccf0424fd5909bc97dcae4af985ed` and `fbcdafa5bf216787c528954aeca0d53be797dbb9` extend the executable production-docstring contract and its scope oracle to include `validateReviews()`. The owned production-docstring scope is therefore 37 functions: hourly commercial-readiness 19, evaluator 9, main-governance 9.

## Alternatives rejected

Keeping normalization in the evaluator was rejected because it makes the final authority boundary more permissive than the exact parser that precedes it. Re-normalizing only case or only whitespace was rejected for the same reason. Adding another independent decision vocabulary was rejected because `approve`, `request_changes`, and `blocked` are already the canonical Noema marker vocabulary; the repair should preserve that contract rather than widen it.

## Risk and effect

The intentional compatibility change is fail-closed: a caller that bypasses the canonical adapter and supplies a case- or whitespace-altered approval token can no longer merge. The normal production path is unchanged because `parseNoemaReviewDecision()` already returns canonical lowercase tokens. Failure remains observable through `noema_current_head_approval_missing` or `noema_current_head_rejected` rather than being silently promoted to approval.

## TRACEABILITY

GitHub's pull-request review REST contract binds reviews to a `commit_id` and a platform review state. GitHub documents review actions as `APPROVE`, `REQUEST_CHANGES`, and `COMMENT`, while the Noema-owned marker vocabulary remains the lowercase internal decision contract. The evaluator must therefore consume the already-validated Noema projection exactly instead of inventing a second normalization layer.

Primary references:

- GitHub Docs, REST API endpoints for pull request reviews: https://docs.github.com/en/rest/pulls/reviews
- GitHub Docs, issue event type `reviewed` (`commit_id`, `submitted_at`, review `state`): https://docs.github.com/en/rest/using-the-rest-api/issue-event-types

## Follow-up

Fresh exact-head hosted checks and an independent current-head review remain required before Ready or merge. This source repair is not immutable-release, deployment, recovery, control-plane, or buyer-evidence authority by itself.
