# Commercial readiness pull-request identity authority

## Problem

The commercial readiness evaluator treated pull-request identity fields as display text before admission. `state`, `baseRef`, `repository`, `headRepository`, `headSha`, and `mergeableState` were normalized with trimming (and, for enum-like values, case folding) before comparison. An otherwise merge-ready snapshot could therefore promote values such as `" main "`, `" clean "`, or a whitespace-wrapped head SHA into canonical merge authority.

This differs from the adjacent governance and required-check repairs, where authority-bearing API values are intentionally fail-closed and are not normalized into a trusted identity.

## Constraint

Noema owns the merge-readiness decision for its own runtime/workflow lane, but it does not acquire organization ruleset mutation, provider routing, product-domain truth, quarantine/security-runtime, outbound, release, or deployment authority. The repair must change only evidence admission, not the underlying GitHub control plane.

## Alternatives considered

1. Keep normalization because GitHub currently emits canonical REST values. Rejected: a merge decision should reject malformed evidence rather than rely on an upstream serialization assumption, especially when the same code is exercised through tests and retained reports.
2. Canonicalize only the head SHA. Rejected: branch, repository, state, and mergeable-state identities participate in the same admission tuple and can be converted from malformed lookalikes by the predecessor logic.
3. Require exact non-empty API strings for the pull-request identity tuple, while retaining normalized values only for human-readable error details. Selected: it is bounded, consistent with the existing governance exactness model, and does not change review/check semantics.

## RED → GREEN evidence

- RED `5fd4d3c5a109576c4e833a8720e6f51dab869a34` adds hostile otherwise-merge-ready snapshots for whitespace-altered `state`, `baseRef`, `repository`, `headRepository`, `headSha`, and `mergeableState`. The predecessor evaluator trims these values and therefore admits the malformed identity tuple.
- GREEN `40ea39aee037663530ca2962496e99bf343c3ea4` adds one shared exact-authority string predicate and applies it only to pull-request identity admission. Normalization remains available for diagnostic text and for non-identity status/conclusion handling.
- The required-check producer, check-name, workflow provenance, review, and normal-merge gates are unchanged by this repair.

## Risk and follow-up

The fail-closed boundary may reject an unexpected future GitHub serialization before other checks run. That is intentional for merge authority. If GitHub changes an authoritative REST enum or field shape, the owner path should update the executable contract from fresh primary evidence rather than silently normalize the new shape.

## TRACEABILITY

- GitHub REST API, Pull requests, `Get a pull request`, API version `2026-03-10`: the pull-request resource supplies state, draft/mergeability information, base/head repository and ref data, and commit identities used by the Noema snapshot adapter.
- Noema `scripts/lib/commercial-readiness-loop.mjs`: final pull-request identity admission.
- Noema `test/commercial-readiness-pr-identity-authority.test.ts`: executable hostile normalization contract.
- Noema `scripts/lib/main-governance-audit.mjs`: adjacent exact-authority precedent for governance API identities.
