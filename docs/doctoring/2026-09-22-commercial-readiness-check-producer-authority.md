# Commercial readiness required-check producer authority

## Problem

The commercial readiness decision already treated required check names as exact GitHub identities, but it still normalized the producer app slug with `trim().toLowerCase()` before trusting `github-actions`. That created an inconsistent authority boundary: a non-canonical producer identity such as `" GitHub-Actions "` could be promoted to the canonical GitHub Actions producer while the adjacent check-name contract correctly rejected equivalent normalization.

## Constraint

This lane may validate Noema merge evidence, but it must not acquire provider-routing, product-domain, quarantine/security-runtime, outbound, release, deployment, or organization-control authority. GitHub-supplied machine identities are evidence inputs; display normalization is not authority.

## Alternatives considered

1. Keep producer normalization because GitHub normally emits lowercase slugs. Rejected: merge admission should fail closed on malformed or non-canonical machine identity rather than silently manufacture canonical authority.
2. Bind the producer only by display slug plus workflow provenance. Rejected for this repair because the immediate defect is the evaluator normalizing the slug after provenance has already been collected; broader immutable App-ID binding is a separate change and should not be smuggled into this causal fix.
3. Require the exact GitHub-supplied slug `github-actions` at the final decision boundary. Selected: it is the smallest repair, preserves current workflow-provenance checks, and matches the exact-identity rule already applied to required check names.

## RED → GREEN evidence

- RED `de26ed3da9d9f3072443265f06b0787ad68da360` adds hostile cases for whitespace- and case-altered producer slugs. The predecessor evaluator normalizes both and would admit the otherwise merge-ready snapshot.
- GREEN `f8141fc07866992aed9e3ae545ea76ee86b2e12b` changes only `isTrustedGitHubActionsCheck()` from normalized comparison to exact string identity.
- RED → GREEN production diff is one line in `scripts/lib/commercial-readiness-loop.mjs`; the focused test adds 22 lines and preserves the prior exact check-name case.

## Risk and follow-up

This is deliberately narrow. The adapter still records the raw `app.slug`; current workflow provenance and target PR/head/base binding remain unchanged. A future hardening step may additionally bind the immutable GitHub Actions App ID if live API evidence and the canonical owner contract justify it. That should be test-first and separate from this repair.

## TRACEABILITY

- GitHub REST API, Check Runs: each check run exposes an `app` object and its slug as producer metadata.
- Noema `scripts/lib/commercial-readiness-loop.mjs`: final required-check producer admission.
- Noema `test/commercial-readiness-check-name-authority.test.ts`: executable exact-identity contract for required check names and producer slug.
