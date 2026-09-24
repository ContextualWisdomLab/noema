# Commercial readiness check-retry chronology authority

Status: Proposed  
Date: 2026-09-22  
Owner boundary: Noema commercial merge-admission only

## Problem

`latestCheckRunsBySuite()` intentionally requests every check run with `filter=all` so a retry can replace stale evidence only after Noema evaluates the complete same-suite history. The original comparator treated numeric `check_run.id` as chronology before considering `started_at` or `completed_at`. GitHub documents `id` as a check-run identifier, not as a chronological contract. By contrast, the Checks REST API defines `filter=latest` in terms of `completed_at` and exposes `started_at`/`completed_at` as the temporal fields of a run.

The first repair moved retry ordering to observed timestamps. A fresh audit found a remaining fail-open case: `checkRunTimestamp()` converted a run with no parseable `started_at` and no parseable `completed_at` to `0`. If that unorderable observation shared the exact suite/producer/name identity with an older timestamped success, the older success could survive without Noema ever proving whether the timestamp-less observation was earlier or later. Missing chronology is therefore not neutral evidence; it is an operational-evidence failure.

## Constraints

- Keep `filter=all`; Noema still needs every retry so a historical failed attempt does not permanently block a later real success and duplicate suites remain independently visible.
- Preserve the exact same-suite identity tuple (`check_suite.id`, unmodified producer slug, unmodified check name).
- Do not normalize check identity or substitute workflow/status evidence.
- Do not infer chronology from undocumented monotonicity of opaque identifiers.
- A queued or in-progress check may legitimately have no `completed_at`; a valid `started_at` is sufficient temporal evidence.
- When neither timestamp is parseable, fail closed rather than assigning an invented timestamp or ordering solely by ID.
- Keep deterministic ID ordering only as a tie-breaker after both observations have valid effective timestamps.

## Decision

The earlier RED `166314216beaa2245c93108e7b8ab8bcc49fb9ff` demonstrated that numeric IDs cannot be chronology authority when the observed timestamps disagree. GREEN `221b398f05f74ef79877251beec29b73f9dc3e36` changed `checkRunChronologicalOrder()` to compare temporal fields first and retain the check-run ID only as a deterministic tie-breaker.

Fresh RED `0b15aff7bad66dca299b5da29a88b91c21ef2bd6` adds a same-suite hostile case in which an older successful run has valid timestamps while a second observation has neither parseable `started_at` nor `completed_at`. The predecessor silently retained the timestamped success. GREEN `805f7920bb24882e716b7b15650cbeb910eab9ea` makes `checkRunTimestamp()` return no chronology authority when both temporal fields are absent/invalid and makes `checkRunChronologicalOrder()` raise `TypeError` instead of inventing an order. The commercial loop already maps snapshot exceptions to `operational_error`, so the run cannot become merge authority.

Docstring-contract successors `257dc0541de99230e74cfcca4feeeccef3750ac5` and `c172a634091d0fb4f323568759fbddbf32d3a583` add the behaviorally changed timestamp helper to the executable owned-production scope; `0f44d9afd1a480c75900d5d8dffd719ebe3d6663` adds its decision-oriented JSDoc without changing the repaired execution path.

No required-check name, producer, App-id, workflow-source, target PR/head/base, review, normal-merge or owner-boundary rule changes in this repair.

## Alternatives considered

Using only numeric IDs was rejected because GitHub does not specify monotonic ID ordering as retry chronology. Calling the API with `filter=latest` and deleting Noema's local retry selection was rejected because the commercial loop deliberately consumes `filter=all` to retain fail-closed visibility across same-head observations and separately validates exact producer/workflow provenance. Treating every retry forever as simultaneously authoritative was rejected because it would let stale historical failures permanently block a corrected unchanged-head retry. Mapping missing timestamps to epoch/zero or choosing by ID was rejected because either approach manufactures chronology that the source API did not provide.

## Risk and follow-up

A queued/in-progress retry with a valid `started_at` remains orderable even when `completed_at` is null. A check with neither parseable temporal field now causes an operational error and blocks that commercial loop pass. This is intentionally stricter than guessing from opaque IDs. If GitHub later publishes an explicit retry-attempt ordinal for Check Runs, evaluate that field as a separate authority change rather than silently substituting it.

Hosted current-head checks and independent review remain revision-scoped. This repair is not merge authority until the unchanged successor head has terminal hosted GREEN and qualifying independent current-head review.

## TRACEABILITY

GitHub. (n.d.). *REST API endpoints for check runs*. GitHub Docs. Retrieved September 22, 2026, from https://docs.github.com/en/rest/checks/runs?apiVersion=2026-03-10

Relevant API contract: Check Runs list endpoints expose `started_at` and `completed_at`; their `filter` parameter is defined against `completed_at`, with `latest` returning the most recent check runs. The endpoint treats `check_run_id` as the unique identifier used to address a run; the documentation does not define that identifier as a chronological sequence.
