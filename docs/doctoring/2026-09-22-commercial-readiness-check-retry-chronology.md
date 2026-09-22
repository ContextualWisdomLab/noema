# Commercial readiness check-retry chronology authority

Status: Proposed  
Date: 2026-09-22  
Owner boundary: Noema commercial merge-admission only

## Problem

`latestCheckRunsBySuite()` intentionally requests every check run with `filter=all` so a retry can replace stale evidence only after Noema evaluates the complete same-suite history. The predecessor comparator treated the numeric `check_run.id` as chronology before considering `started_at` or `completed_at`. GitHub documents `id` as a check-run identifier, not as a chronological contract. By contrast, the Checks REST API defines `filter=latest` in terms of the `completed_at` timestamp and exposes `started_at`/`completed_at` as the temporal fields of the run.

That left a fail-open merge-evidence path: two observations with the same exact `check_suite.id`, producer and check name could be ordered by an undocumented numeric-ID assumption. If a newer failure had a lower numeric ID than an older success, the older success could survive as the authoritative retry observation.

## Constraints

- Keep `filter=all`; Noema still needs every retry so a historical failed attempt does not permanently block a later real success and duplicate suites remain independently visible.
- Preserve the exact same-suite identity tuple (`check_suite.id`, unmodified producer slug, unmodified check name).
- Do not normalize check identity or substitute workflow/status evidence.
- Do not infer chronology from undocumented monotonicity of opaque identifiers.
- Keep deterministic ordering when two observations expose the same effective timestamp.

## Decision

RED `166314216beaa2245c93108e7b8ab8bcc49fb9ff` adds a hostile same-suite case where the older successful observation has the larger numeric ID while the newer failed observation has later `started_at`/`completed_at` timestamps. The predecessor implementation selects the stale success.

GREEN `221b398f05f74ef79877251beec29b73f9dc3e36` changes `checkRunChronologicalOrder()` to compare the observed temporal fields first and use the check-run ID only as a deterministic tie-breaker. No required-check name, producer, App-id, workflow-source, target PR/head/base, review, normal-merge or owner-boundary rule changes.

## Alternatives considered

Using only numeric IDs was rejected because GitHub does not specify monotonic ID ordering as retry chronology. Calling the API with `filter=latest` and deleting Noema's local retry selection was rejected because the commercial loop deliberately consumes `filter=all` to retain fail-closed visibility across same-head observations and separately validates exact producer/workflow provenance. Treating every retry forever as simultaneously authoritative was rejected because it would let stale historical failures permanently block a corrected unchanged-head retry.

## Risk and follow-up

A queued/in-progress retry has no `completed_at`; `checkRunTimestamp()` therefore retains the later of `started_at` and `completed_at`, so a newer active retry cannot be hidden by an older completed success. If GitHub later publishes an explicit retry-attempt ordinal for Check Runs, evaluate that field as a separate authority change rather than silently substituting it.

Hosted current-head checks and independent review remain revision-scoped. This repair is not merge authority until the unchanged successor head has terminal hosted GREEN and qualifying independent current-head review.

## TRACEABILITY

GitHub. (n.d.). *REST API endpoints for check runs*. GitHub Docs. Retrieved September 22, 2026, from https://docs.github.com/en/rest/checks/runs?apiVersion=2026-03-10

Relevant API contract: Check Runs list endpoints expose `started_at` and `completed_at`; their `filter` parameter is defined against `completed_at`, with `latest` returning the most recent check runs. The endpoint also treats `check_run_id` as the unique identifier used to address a run; the documentation does not define that identifier as a chronological sequence.
