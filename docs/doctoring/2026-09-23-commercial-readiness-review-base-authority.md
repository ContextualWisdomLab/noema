# Commercial-readiness review base authority

Date: 2026-09-23  
Owner: Noema commercial merge-admission review protocol  
Status: Proposed source repair; hosted exact-head verification and independent current-head review remain required

## Problem

Noema already bound formal review authority to the exact GitHub review `commit_id` and current PR head. That was insufficient when the target branch advanced without changing the pull-request head. A review produced while the PR evaluated base A could remain a canonical exact-head approval after the same head was re-evaluated against base B.

The commercial-readiness check/workflow provenance path and merge preflight already bind the target PR, head, and base. The reviewer manifest also already carries `base_sha`. The missing authority edge was the review publication protocol: the publisher did not serialize the evaluated base into the review body, publication revalidated only live state/head, and the consumer admitted the Noema marker without the current base.

GitHub exposes a pull-request review `commit_id` and platform state, while the pull request resource separately exposes its current head and base. Noema therefore must carry its evaluated base explicitly in the owner protocol rather than infer that GitHub's head-bound review is also base-bound.

## Constraints

- Preserve exact reviewer login and Bot identity, exact GitHub review `commit_id` and state, canonical reviewer credential, exact-one marker-like envelope cardinality, malformed-successor revocation, `DISMISSED` revocation, and GitHub REST review-list chronology.
- Preserve the independent generic reviewer-state projection and existing check/workflow PR-head-base provenance.
- Keep repository governance control-plane authority in issue #27 and Reviewer/Maintainer GitHub App identity and eligibility in issue #29.
- Do not transfer LLM-provider routing, foreign product-domain truth, quarantine/security runtime, outbound authority, release, or deployment authority into this lane.
- Repair ordinary-forward only; no force update, destructive rebase, self-approval, or gate weakening.

## RED and preservation finding

Executable RED `e003ec81fe7f9d3890b54cac2525fdbe6c01c360` added `test/commercial-readiness-noema-review-base-authority.test.ts`. It requires a legacy head-only review to be non-authoritative, a canonical review to bind both the exact head and evaluated base, and the production publisher/CLI path to carry and revalidate the manifest base.

An initial CLI-only trial `5cdf74e676e18d11ce103e8ff0904d07565c831b` was intentionally restored by ordinary-forward commit `70f06b15ab848347ea354be0ea9ba88b4640a738` because changing only the caller would leave publisher and consumer contracts inconsistent. The net compare from the RED through that restore retained only the RED contract.

## Decision

The repair is split across the actual authority boundaries and then converged:

- `01392b5721bb2ee322ac7adbbb445db9e9cb21b8` changes `parseNoemaReviewDecision()` to require `expectedBaseSha`. A canonical Noema decision now requires the publisher-owned tail to contain the exact `- Base SHA: <sha>` line immediately before the exact reviewer credential, blank line, and canonical gate marker. `fetchPullRequestSnapshot()` supplies the live PR `baseSha` to that admission function.
- `8d5d2816ab810e8b822d896c7572a3bef8084195` changes the reviewer publisher. When a base is supplied, `render_review_body()` serializes it, and `publish_verdict()` re-reads live pull-request `{state, head, base}` immediately before POST and refuses publication if any bound identity changed.
- `50c156ef373e1cf2fbb7c8c04575b8f0026c55a8` carries `manifest.base_sha` from the production CLI into `publish_verdict()`. The injectable five-argument publisher seam used by unit tests remains unchanged; production does not omit the manifest base.
- Subsequent focused test repairs ordinary-forward the existing reviewer-login, marker serialization/cardinality, credential-position, dismissal, malformed-successor, and review-order/head regressions so their hostile cases continue to exercise their intended predicate instead of passing merely because base authority is absent.
- `7a7b7338c8150ac97f4c7ff0ff54525979e84466` adds a focused current-base/stale-head regression so stale `commit_id` rejection remains independently executable under the new base-bound protocol.
- `36d5264b6a65f942fae0e53afe4fd1ad13c21222` repairs a test-contract false confidence in the legacy head-only negative fixture: the predecessor invoked the now four-argument parser with only three arguments, so `null` could be produced by argument misbinding rather than by rejection of head-only authority. The fixture now supplies the current base explicitly and therefore exercises the intended missing-base serialization predicate.

The resulting authority tuple is therefore reviewer identity + exact GitHub review state + exact review `commit_id` + exact evaluated base + canonical publisher serialization + canonical marker cardinality. None of those fields substitutes for the hosted check/workflow evidence or the live merge-write revalidation.

## Alternatives rejected

1. Rely on `review.commit_id` alone. Rejected because it authenticates the reviewed commit, not the target branch revision used to evaluate that commit.
2. Depend on repository stale-review dismissal. Rejected because live repository policy may not provide that control, and application protocol correctness must not silently depend on an optional policy setting.
3. Re-run review only when the head changes. Rejected because the defect is specifically a base-only movement with an unchanged head.
4. Encode the base only in model prose. Rejected because model-controlled prose is not publisher authority. The base must be in the exact publisher-owned tail consumed by the admission parser.

## Risk, effect, and follow-up

This change is intentionally fail closed. Existing head-only Noema review bodies cannot authorize a merge after this protocol version. A new current-head review must be produced by the repaired publisher against the current evaluated base.

Source and test convergence is not merge evidence. The exact current head still requires all applicable hosted gates to reach terminal GREEN, unresolved review threads to be zero, and a fresh independent formal Noema review using the repaired protocol. Protected-main integration, immutable release, SBOM/provenance/reproducibility, deployment, recovery rehearsal, and buyer evidence remain separate later gates.

## TRACEABILITY

GitHub. (2026). *REST API endpoints for pull request reviews*. GitHub Docs. Review objects expose the reviewed commit identity and platform review state. https://docs.github.com/en/rest/pulls/reviews

GitHub. (2026). *REST API endpoints for pull requests*. GitHub Docs. Pull-request resources expose current head and base identities used by Noema's live publication and merge preflights. https://docs.github.com/en/rest/pulls/pulls

Owner source: `scripts/hourly-commercial-readiness.mjs::parseNoemaReviewDecision`, `reviewer/noema_reviewer/github_io.py::{render_review_body,publish_verdict}`, and `reviewer/noema_reviewer/cli.py::run_review`.
