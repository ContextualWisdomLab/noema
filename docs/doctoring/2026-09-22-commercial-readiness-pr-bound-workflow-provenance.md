# Commercial readiness: PR-bound workflow provenance

Date: 2026-09-22 KST
Status: Proposed source evidence; hosted exact-head verification and independent review remain required.

## Problem

The commercial-readiness collector already joined check runs to exact-head GitHub Actions workflow runs by `check_suite_id`, event, head SHA, workflow path and workflow source. That was not sufficient to prove that the workflow run belonged to the pull request currently being evaluated. GitHub check evidence is commit-scoped, so two pull requests may reference the same head commit. Without a pull-request association check, a canonical workflow run associated with another pull request could be reused as merge evidence for the target pull request.

A live Noema CI run provides the missing authority surface: run `35674957757` for PR #730 reports `event=pull_request`, head `2b063eb621b1b40413de20b8853b5dcb1ddd0d45`, `check_suite_id=96588338511`, canonical `.github/workflows/ci.yml`, and a `pull_requests` association containing exactly PR #730 with the same head SHA. This is evidence of the API shape, not evidence that the current repaired head has passed hosted gates.

## Constraints

- Keep check identity fail closed and exact-head.
- Do not infer PR identity from branch names, titles, check names, or workflow names.
- Preserve the existing distinction between repository workflows and organization-required workflows.
- Preserve the self-modified `ci.yml` / `reviewer-ci.yml` rejection.
- Do not copy organization governance authority into Noema source.
- Do not weaken independent review, exact-head checks, or normal-merge admission.

## Alternatives considered

1. **Head SHA only.** Rejected because a commit can be referenced by more than one pull request; commit identity does not prove the target PR association.
2. **Branch/ref matching.** Rejected because refs are mutable presentation/state and are weaker than the API's explicit PR association.
3. **Accept any association containing the target PR.** Rejected for merge authority because an ambiguous multi-PR association leaves the evidence boundary wider than necessary.
4. **Require one explicit association matching both PR number and head SHA.** Selected. Missing, multiple, mismatched-number, or mismatched-head associations fail closed.

## Decision

`workflowAuthorityByCheckSuite()` now receives the target pull-request number in addition to repository and expected head SHA. A workflow run is canonical merge evidence only when all of the following hold:

- `event` is exactly `pull_request`;
- `head_sha` equals the evaluated exact head;
- `pull_requests` contains exactly one association;
- that association's `number` equals the evaluated PR number;
- that association's `head.sha` equals the evaluated exact head;
- the existing workflow path/source contract and check-suite binding also match.

The realistic RED is `1b7281134c4b5a0eacd4a71faa3b0d7e0511c164`: it adds hostile same-head cases for a different PR, an ambiguous two-PR association, and an association whose head SHA differs. The causal GREEN is `16d6af94a709a6fc30e0793f179cfc00385832e3`, which adds only the target-PR association predicate and passes the pull number from the current snapshot collector. `2b063eb621b1b40413de20b8853b5dcb1ddd0d45 → 16d6af94a709a6fc30e0793f179cfc00385832e3` is ordinary-forward by two commits and changes only the focused provenance test and commercial-readiness adapter.

## Risk and effect

This is deliberately conservative. If GitHub omits or ambiguously reports `pull_requests`, the collector will reject the workflow evidence even if a human could infer the intended PR from other fields. That false-negative risk is preferable to admitting cross-PR check evidence into an automated merge decision. No change is made to product domain truth, provider routing, quarantine/security runtime authority, outbound authority, or live organization rulesets.

## Follow-up

- Obtain fresh independent review on the final exact head after this decision record.
- Require fresh hosted exact-head terminal GREEN before Ready/merge.
- Keep issue #27 as the live governance/control-plane owner.
- If GitHub changes the workflow-run association schema, update this contract only from current primary API documentation and a fresh observed payload.

## TRACEABILITY

GitHub. (2026). *REST API endpoints for workflow runs* (API version 2026-03-10). GitHub Docs. https://docs.github.com/en/rest/actions/workflow-runs

Primary API facts used here: workflow-run retrieval/listing retains pull-request associations unless `exclude_pull_requests=true`; repository workflow-run listing supports `head_sha` and `check_suite_id` filters. The repository's observed run payload is retained separately as dated operational evidence.
