# Commercial-readiness check-suite identity

Date: 2026-09-22 KST

## Problem

`latestCheckRunsBySuite()` collected `filter=all` check runs before merge admission, but its deduplication key normalized both `check_run.name` and `check_run.app.slug` with whitespace trimming and lower-casing. Two distinct GitHub Checks identities such as `verify` and ` verify `, or `github-actions` and ` GitHub-Actions `, could therefore collapse into one map entry when they shared a check-suite id. A later canonical success could hide a distinct malformed failed check before the fail-closed evaluator observed it.

## Constraint

Noema needs retry selection without inventing identity equivalence. The Checks API exposes `check_suite.id`, each check run's `name`, and the producing App object as separate fields. The commercial loop may choose the newest retry only inside the same exact API identity; it must not normalize authority-bearing name or producer fields while forming that identity. Required-check trust, App id `15368`, workflow provenance, target PR/head/base binding, and self-modified workflow rejection remain separate downstream controls.

## Alternatives

1. Keep normalized suite keys and rely on the later evaluator. Rejected because the earlier map can discard a distinct check before downstream validation sees it.
2. Reject every non-canonical name or producer value inside `latestCheckRunsBySuite()`. Rejected because this helper owns retry grouping, not producer trust; preserving the raw identity lets the existing evaluator classify the observation fail closed.
3. Build the retry key from the exact serialized check name and exact serialized App slug. Selected because it changes only grouping semantics and preserves all observations for downstream authority checks.

## Decision

`checkRunSuiteKey()` now accepts only string `name` and `app.slug` values without transforming them and uses the exact tuple `check_suite.id + app.slug + name`. A focused hostile contract proves whitespace/case lookalikes remain separate observations. Missing or non-string identity metadata still fails closed.

## RED → GREEN evidence

- RED `423b076130e2ec9d97a7a869673975c129829d57` adds `test/commercial-readiness-check-suite-identity.test.ts`. The predecessor implementation collapses each hostile pair to one entry.
- GREEN `20d89f7becfaeac7274b26e606b50d2a5f5950a8` changes only `scripts/hourly-commercial-readiness.mjs` (+3/-2 from RED): exact raw `name` and `app.slug` replace trim/lower-case normalization, with a short authority-boundary docstring.
- RED → GREEN compare is ordinary-forward, one commit, `behind=0` relative to the RED parent.

## Risks and follow-up

Exact grouping can retain more observations when an external producer emits near-duplicate names. That is intentional: the downstream commercial evaluator already blocks non-success observed checks and separately rejects untrusted required-check producers. Current-head hosted CI and independent review must validate this exact source before merge; predecessor workflow/review evidence is not reusable after mutation.

## TRACEABILITY

GitHub's REST Checks documentation models a check run with its own `name`, `check_suite.id`, and producing `app` object, and the list endpoint supports `filter=all` so callers can observe all runs rather than asking GitHub to collapse them to the latest result. Noema therefore treats those identity fields as exact API evidence before performing its own retry selection.

Primary source: GitHub. (2026). *REST API endpoints for check runs*. https://docs.github.com/en/rest/checks/runs

Supporting source: GitHub. (2026). *Using the REST API to interact with checks*. https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks
