# Commercial-readiness equal-timestamp retry authority

Date: 2026-09-23 KST
Owner: Noema commercial-readiness check-run projection
Status: Proposed source repair; hosted exact-head GREEN and formal current-head review remain separate evidence.

## Problem

`latestCheckRunsBySuite()` intentionally requests every Check Run (`filter=all`) so Noema can preserve retry evidence and fail closed when chronology is incomplete. Its helper `checkRunChronologicalOrder()` already rejected a retry when neither `completed_at` nor `started_at` supplied an observable timestamp. When two distinct same-suite retries had the same observable timestamp, however, the helper fell back to numeric Check Run `id` order.

That fallback manufactured chronology from an identifier. GitHub documents the Check Runs endpoint's `latest` filter in terms of `completed_at` timestamps; the REST contract does not make the numeric Check Run id a retry-order authority. Two distinct observations with the same retained chronology therefore cannot safely be reduced to one latest authority by comparing ids.

## Constraints

- Preserve the existing exact identity key: check-suite id + exact producer slug + exact check name.
- Preserve all current PR/head/base/workflow/App-id and result-authority gates.
- Do not infer chronology from list position, opaque numeric identifiers, or locally invented ordering.
- Missing or ambiguous chronology must fail closed rather than selecting a success or failure arbitrarily.
- This repair does not acquire provider routing, product-domain truth, quarantine/security, outbound, release, or deployment authority.

## Evidence and decision

RED `b5a96fdbdcd6b796791f2b0bf891352d50b7d419` adds a hostile same-suite pair with distinct Check Run ids (`400`, `401`) and identical `started_at` / `completed_at` values. The predecessor production path reaches its numeric-id tie-break and therefore cannot emit the required `Check run chronology is ambiguous ...` failure.

GREEN `1cd7a298f7ddf12a88e011bd2d5ca021883a0e45` removes numeric-id ordering as chronology authority. Different timestamps retain their observed ordering. An exact duplicate id with the same timestamp compares equal. Distinct ids with the same observed timestamp now raise a stable operational `TypeError` before either result can become merge authority.

The selected policy deliberately prefers a false negative over a false PASS. If GitHub later publishes an authoritative retry sequence for equal timestamps, Noema may adopt that owner contract with a new hostile fixture and TRACEABILITY update rather than inferring it locally.

## Alternatives rejected

**Keep numeric id as a tie-breaker.** Rejected because uniqueness does not establish temporal order.

**Prefer the later item in the REST array.** Rejected because this path uses `filter=all` and no local contract establishes response position as the authoritative retry sequence for equal timestamps.

**Treat equal timestamps as equivalent and keep the first observation.** Rejected because distinct success/failure observations would then become order-dependent while appearing deterministic.

## Primary reference

GitHub. (2026). *REST API endpoints for check runs*. GitHub Docs. The `List check runs for a Git reference` contract defines `filter=latest` by `completed_at` timestamp and `filter=all` as the complete observation set. https://docs.github.com/en/rest/checks/runs

## Risk and follow-up

Equal-timestamp retries can now surface an operational error and block a commercial-readiness pass even if one result would otherwise be mergeable. That is intentional until an authoritative sequence exists. Hosted tests on the exact repaired head and a fresh independent current-head review remain required before Ready/merge.

## TRACEABILITY

GitHub Check Runs REST `completed_at` chronology → `checkRunTimestamp()` → `checkRunChronologicalOrder()` fail-closed ambiguity rule → `latestCheckRunsBySuite()` → current-head check projection → `evaluatePullRequest()` merge admission.
