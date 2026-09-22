# Commercial readiness check-result authority

Status: Proposed
Date: 2026-09-22 KST
Owner: Noema commercial-readiness governance lane

## Problem

The merge evaluator already treated required check names, producer identity, App identity, workflow provenance, target PR/head/base, and pull-request identity as exact authority. Result fields were different. Required and observed Check Runs normalized `status` and `conclusion` with trim/case folding, and the legacy Commit Status path normalized `state` the same way. That allowed malformed lookalikes such as `" completed "`, `"COMPLETED"`, `" success "`, or `"SUCCESS"` to be promoted to canonical terminal-success authority.

The first evaluator repair removed that normalization at the final merge-admission boundary, but fresh projection review found a second fail-open boundary in `latestStatuses()`: the collection adapter still trimmed `context` and lower-cased `state` before `validateChecks()` saw the evidence. Distinct malformed/canonical GitHub Commit Status observations could therefore be collapsed or rewritten before the exact evaluator ran.

A terminal result participates directly in merge admission, so permissive normalization at either collection or evaluation is an authority transformation rather than a presentation concern.

## Constraints

- Preserve required-check names, producer/App/workflow provenance, target PR/head/base, review-head binding, and normal-merge contracts.
- Keep human-facing diagnostic normalization separate from authority decisions.
- Preserve raw Commit Status `context` and `state` identity before evaluator admission; do not manufacture a canonical value in the adapter.
- Do not acquire central Security Scan implementation, provider routing, quarantine/security runtime, outbound, product-domain, release, or deployment authority.
- Do not weaken hosted checks or substitute local source evidence for hosted exact-head GREEN.

## Decision

Treat GitHub terminal-result fields as exact authority from collection through final evaluation.

- Check Runs: only exact `status === "completed"` and exact `conclusion === "success"` satisfy successful terminal authority in `validateRequiredChecks()` and `validateObservedChecks()`.
- Commit Status collection: `latestStatuses()` preserves exact non-empty `context` and exact string `state`; it does not trim context or case-fold state.
- Commit Status evaluation: only exact `state === "success"` satisfies status authority in `validateChecks()`.

Whitespace- or case-altered lookalikes remain distinct non-canonical observations and block merge admission.

The first RED `14f0fa95da978b2abd7c4b4af6164dbf1d077e10` adds hostile required and observed Check Run cases. GREEN `5197f653cf79b2d89eca58bee53ac30573964188` makes Check Run terminal fields exact.

Fresh review then found the same fail-open normalization in the legacy Commit Status evaluator. RED `2d91c4277b7be21737ece14e30dab1b1586e882b` adds whitespace/case-altered `status.state` hostile cases; GREEN `46f6df9e9eb34fdd7abf62633bf7186d8348151c` makes evaluator state exact and adds decision-oriented JSDoc.

A further adapter audit found `latestStatuses()` still rewrote the evidence before that evaluator. RED `8c04138e5553b6298b787d88670b280b51fc7c78` requires a malformed `" policy "` / `"SUCCESS"` observation and canonical `policy` / `failure` observation to remain distinct and blocked. Docstring-scope successors `d784672f869ba20df7c315a06950010b3747f4c7` and `d8fd8adcc61a21aa9e648575a7f0113756fb3641` add the projection boundary to the executable scope. GREEN `40d78034a5b100851ddde1c47f0d1add8de1edb1` preserves exact Commit Status context/state identity before terminal merge-authority evaluation and adds the decision-oriented `latestStatuses()` JSDoc.

## Alternatives rejected

### Keep trim/case normalization for resilience

Rejected. GitHub publishes bounded result values and opaque status contexts. Normalizing malformed values before a merge decision expands authority beyond the source API contract and can collapse distinct observations.

### Enforce exactness only in the final evaluator

Rejected as insufficient. The evaluator must fail closed, but an upstream adapter that rewrites or collapses identity-bearing evidence can destroy the information needed for that evaluator to distinguish malformed and canonical observations.

### Enforce exactness only in the collection adapter

Rejected as the sole control. The evaluator is independently callable and is the final merge-admission boundary. Both collection and evaluation must preserve/fail closed on the source identity.

### Treat Commit Status as a lower-authority compatibility channel

Rejected while the status collection remains part of merge admission. Any evidence class that can block or satisfy the final decision must preserve the source API's exact terminal identity.

## Risk and effect

The repair can convert previously tolerated malformed evidence into `required_check_pending`, `required_check_failed`, `review_dependent_check_pending`, `review_dependent_check_failed`, `observed_check_pending`, `observed_check_failed`, or `status_not_success`. Canonical GitHub values are unchanged.

Preserving exact status contexts also means whitespace-distinct contexts remain distinct observations rather than being deduplicated by the adapter. This is intentional: deduplication occurs only on exact identity.

No hosted run is treated as GREEN merely because this source repair exists. Current-head hosted evidence and qualifying independent review remain separate merge gates.

## TRACEABILITY

Primary API contracts:

- GitHub REST API, Check Runs: https://docs.github.com/en/rest/checks/runs
- GitHub REST API, Commit Statuses: https://docs.github.com/en/rest/commits/statuses

Repository evidence:

- Check Run RED: `14f0fa95da978b2abd7c4b4af6164dbf1d077e10`
- Check Run GREEN: `5197f653cf79b2d89eca58bee53ac30573964188`
- Commit Status evaluator RED: `2d91c4277b7be21737ece14e30dab1b1586e882b`
- Commit Status evaluator GREEN: `46f6df9e9eb34fdd7abf62633bf7186d8348151c`
- Commit Status projection RED: `8c04138e5553b6298b787d88670b280b51fc7c78`
- Projection docstring-scope successors: `d784672f869ba20df7c315a06950010b3747f4c7`, `d8fd8adcc61a21aa9e648575a7f0113756fb3641`
- Commit Status projection GREEN: `40d78034a5b100851ddde1c47f0d1add8de1edb1`
- Collection boundary: `scripts/hourly-commercial-readiness.mjs` / `latestStatuses()`
- Evaluation boundary: `scripts/lib/commercial-readiness-loop.mjs` / `validateChecks()`
- Hostile contracts: `test/hourly-commercial-readiness-script.test.ts`, `test/commercial-readiness-check-result-authority.test.ts`

## Follow-up

Revalidate the unchanged exact head with hosted CI/reviewer/security/image gates and a fresh independent review. Do not promote the PR to Ready until those exact-head gates are terminal GREEN and no valid review finding remains.
