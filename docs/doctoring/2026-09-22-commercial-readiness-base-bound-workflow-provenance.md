# Commercial-readiness base-bound workflow provenance

Date: 2026-09-22 KST
Status: Proposed source authority; live governance remains issue #27.

## Problem

The commercial-readiness merge gate already bound required checks to one `pull_request` workflow run with the target PR number, exact head SHA, canonical workflow path, and repository-vs-required workflow source. It did not bind that run to the PR base revision that is being evaluated.

GitHub's workflow-run payload exposes the associated pull request's `base.ref` and `base.sha` as well as its head identity. A run can therefore remain associated with the same PR number and head SHA even when the PR is later evaluated against a different base revision. Reusing that older run would make a stale-base check suite look like current merge evidence.

Dated live evidence: run `35679054760` for PR #730 reports `pull_requests[0].head.sha = 948c93a042e0c5541368e9542b7aaafe803f71b2`, `base.ref = main`, and `base.sha = c3a3a42170ac06fbfc5c1a3b32e34827d967b5c9`.

## Constraints

- Do not infer freshness from timestamps or queue order.
- Do not treat current PR metadata alone as proof that a check suite ran against that base.
- Preserve the organization-required Security Scan as external owner authority rather than copying it into Noema.
- Missing or malformed provenance must fail closed; it must not be normalized into authority.

## Decision

A check suite is eligible for canonical workflow authority only when one explicit workflow-run `pull_requests` association matches all four evaluated identities: target PR number, exact head SHA, canonical base ref `main`, and exact current base SHA. `fetchPullRequestSnapshot()` passes the live PR base ref/SHA into `workflowAuthorityByCheckSuite()`, and the association matcher compares them without trimming or fallback.

The RED commit `7ef5599fe5838f1fa62a6a07c2bec37ad49d22cc` adds hostile same-PR/same-head cases with a stale base SHA and a wrong base ref. GREEN `bbbcfcf9271554181ce34ed30eca3db687f8a80e` makes only the base-binding production repair. Existing current-PR/current-head, workflow-path/source, changed-file completeness, and self-modified local-gate controls remain in force.

## Alternatives rejected

Relying on `pull.base` while ignoring workflow-run base provenance was rejected because it proves the PR's current target, not the target used when the run was created. Selecting the newest workflow run was rejected because chronology is not identity. Re-running checks solely to refresh evidence was rejected because the correct fix is to make stale evidence non-authoritative, not manufacture activity.

## Risks and effects

The fail-closed rule may reject a valid run if GitHub omits the association base identity. That is preferable to admitting ambiguous merge authority. No product-domain, provider-routing, quarantine/security-runtime, outbound, or live-ruleset authority moves into this lane. Issue #27 remains the owner for live PR/review/history/deletion/bypass controls.

## TRACEABILITY

GitHub. (2026). *REST API endpoints for workflow runs*. GitHub Docs. https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28

GitHub. (2026). *REST API endpoints for pull requests*. GitHub Docs. https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28

Repository evidence: PR #730, workflow run `35679054760`, RED `7ef5599f…`, GREEN `bbbcfcf9…`.
