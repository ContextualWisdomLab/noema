# Commercial readiness check-result authority

Status: Proposed
Date: 2026-09-22 KST
Owner: Noema commercial-readiness governance lane

## Problem

The merge evaluator already treated required check names, producer identity, App identity, workflow provenance, target PR/head/base, and pull-request identity as exact authority. Result fields were different. Required and observed Check Runs normalized `status` and `conclusion` with trim/case folding, and the legacy Commit Status projection normalized `state` the same way. That allowed malformed lookalikes such as `" completed "`, `"COMPLETED"`, `" success "`, or `"SUCCESS"` to be promoted to canonical terminal-success authority.

A terminal result participates directly in merge admission, so permissive normalization is a fail-open authority transformation rather than a presentation concern.

## Constraints

- Preserve required-check names, producer/App/workflow provenance, target PR/head/base, review-head binding, and normal-merge contracts.
- Keep human-facing diagnostic normalization separate from authority decisions.
- Do not acquire central Security Scan implementation, provider routing, quarantine/security runtime, outbound, product-domain, release, or deployment authority.
- Do not weaken hosted checks or substitute local source evidence for hosted exact-head GREEN.

## Decision

Treat GitHub terminal-result enums as exact authority at the final evaluator boundary.

- Check Runs: only exact `status === "completed"` and exact `conclusion === "success"` satisfy successful terminal authority in `validateRequiredChecks()` and `validateObservedChecks()`.
- Commit Statuses: only exact `state === "success"` satisfies status authority in `validateChecks()`.

Whitespace- or case-altered lookalikes remain non-canonical and block merge admission.

The first RED `14f0fa95da978b2abd7c4b4af6164dbf1d077e10` adds hostile required and observed Check Run cases. GREEN `5197f653cf79b2d89eca58bee53ac30573964188` makes Check Run terminal fields exact.

Fresh review then found the same fail-open normalization still existed in the legacy Commit Status path. RED **`2d91c4277b7be21737ece14e30dab1b1586e882b`** adds whitespace/case-altered `status.state` hostile cases; the predecessor admits them after trim/case folding. Scope successors `c2e7e94f8be970bdea502b1a2c385c8ae8edc6ba` and `68b3e439257b64f213d1064608ab7c3be73e60ec` extend the owned docstring contract to the now-behavioral `validateChecks()` boundary. GREEN **`46f6df9e9eb34fdd7abf62633bf7186d8348151c`** makes Commit Status state exact and adds the decision-oriented JSDoc. Canonical GitHub enum values keep the same behavior.

## Alternatives rejected

### Keep trim/case normalization for resilience

Rejected. GitHub publishes bounded enum values for Check Run status/conclusion and Commit Status state. Normalizing malformed values before a merge decision expands authority beyond the source API contract.

### Reject malformed values in the collection adapter only

Rejected as the sole control. The evaluator is independently callable and is the final merge-admission boundary. It must fail closed even if a future adapter change passes malformed evidence through.

### Treat Commit Status as a lower-authority compatibility channel

Rejected while the status collection remains part of merge admission. Any evidence class that can block or satisfy the final decision must preserve the source API's exact terminal identity.

## Risk and effect

The repair can convert previously tolerated malformed evidence into `required_check_pending`, `required_check_failed`, `review_dependent_check_pending`, `review_dependent_check_failed`, `observed_check_pending`, `observed_check_failed`, or `status_not_success`. Canonical GitHub values are unchanged.

No hosted run is treated as GREEN merely because this source repair exists. Current-head hosted evidence and qualifying independent review remain separate merge gates.

## TRACEABILITY

Primary API contracts:

- GitHub REST API, Check Runs: https://docs.github.com/en/rest/checks/runs
- GitHub REST API, Commit Statuses: https://docs.github.com/en/rest/commits/statuses

Repository evidence:

- Check Run RED: `14f0fa95da978b2abd7c4b4af6164dbf1d077e10`
- Check Run GREEN: `5197f653cf79b2d89eca58bee53ac30573964188`
- Commit Status RED: `2d91c4277b7be21737ece14e30dab1b1586e882b`
- Commit Status scope successors: `c2e7e94f8be970bdea502b1a2c385c8ae8edc6ba`, `68b3e439257b64f213d1064608ab7c3be73e60ec`
- Commit Status GREEN: `46f6df9e9eb34fdd7abf62633bf7186d8348151c`
- Production boundary: `scripts/lib/commercial-readiness-loop.mjs`
- Hostile contract: `test/commercial-readiness-check-result-authority.test.ts`

## Follow-up

Revalidate the unchanged exact head with hosted CI/reviewer/security/image gates and a fresh independent review. Do not promote the PR to Ready until those exact-head gates are terminal GREEN and no valid review finding remains.
