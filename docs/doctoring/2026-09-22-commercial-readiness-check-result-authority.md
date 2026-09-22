# Commercial readiness check-result authority

Status: Proposed
Date: 2026-09-22 KST
Owner: Noema commercial-readiness governance lane

## Problem

The merge evaluator already treated required check names, producer identity, App identity, workflow provenance, target PR/head/base, and pull-request identity as exact authority. Required and observed check terminal results were different: `status` and `conclusion` were normalized with trim/case folding before admission. That allowed malformed lookalikes such as `" completed "`, `"COMPLETED"`, `" success "`, or `"SUCCESS"` to be promoted to canonical GitHub result authority.

A terminal result participates directly in merge admission, so permissive normalization is a fail-open authority transformation rather than a presentation concern.

## Constraints

- Preserve the existing required-check names, producer/App/workflow provenance, review-head binding, and normal-merge contracts.
- Do not acquire central Security Scan implementation, provider routing, quarantine/security runtime, outbound, product-domain, or release authority.
- Keep human-facing diagnostic normalization separate from authority decisions.
- Do not weaken hosted checks or substitute local evidence for hosted exact-head GREEN.

## Decision

Treat check-run `status` and `conclusion` as exact GitHub API enum authority in `validateRequiredChecks()` and `validateObservedChecks()`.

Only exact `status === "completed"` and exact `conclusion === "success"` satisfy successful terminal check authority. Whitespace- or case-altered lookalikes remain non-canonical and block merge admission.

RED `14f0fa95da978b2abd7c4b4af6164dbf1d077e10` adds hostile required and observed check cases for whitespace/case-altered terminal result fields. The predecessor normalizes those values and therefore admits them. GREEN `5197f653cf79b2d89eca58bee53ac30573964188` replaces only the result-authority normalization in the two existing evaluator functions; check identity, producer identity, and diagnostics remain otherwise unchanged.

## Alternatives rejected

### Keep trim/case normalization for resilience

Rejected. GitHub publishes bounded enum values for check-run status and conclusion. Normalizing malformed values before a merge decision expands authority beyond the source API contract.

### Reject malformed values in the collection adapter only

Rejected as the sole control. The evaluator is independently callable and is the final merge-admission boundary. It must fail closed even if a future adapter change passes malformed evidence through.

## Risk and effect

The repair can convert previously tolerated malformed check evidence into `required_check_pending`, `required_check_failed`, `review_dependent_check_pending`, `review_dependent_check_failed`, `observed_check_pending`, or `observed_check_failed`. Canonical GitHub values are unchanged.

No hosted run is treated as GREEN merely because this source repair exists. Current-head hosted evidence and qualifying independent review remain separate merge gates.

## TRACEABILITY

Primary API contract:

- GitHub REST API, Check Runs: https://docs.github.com/en/rest/checks/runs
- GitHub REST API, Commit Statuses: https://docs.github.com/en/rest/commits/statuses

Repository evidence:

- RED: `14f0fa95da978b2abd7c4b4af6164dbf1d077e10`
- GREEN: `5197f653cf79b2d89eca58bee53ac30573964188`
- Production boundary: `scripts/lib/commercial-readiness-loop.mjs`
- Hostile contract: `test/commercial-readiness-check-result-authority.test.ts`

## Follow-up

Revalidate this exact head with hosted CI/reviewer/security/image gates and a fresh independent review. Do not promote the PR to Ready until those exact-head gates are terminal GREEN and no valid review finding remains.
