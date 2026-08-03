# Hourly Commercial-Readiness Loop Design

## Status

Approved for autonomous implementation under the repository's existing fail-closed review and release policy.

## Problem

Noema already has strong release, security, readiness, and acquisition audits, but the operational loop that connects them is manual. Pull requests can remain open after every substantive requirement is satisfied, current-head Noema review can be omitted until a maintainer dispatches it, and a no-PR period does not produce an hourly commercial-readiness evidence trail. The absence of protected-branch enforcement is tracked separately in issue #27 and cannot be replaced by workflow code.

## Goals

1. Inspect every open pull request once per hour and on manual dispatch.
2. Never execute or check out pull-request code in the privileged maintenance workflow.
3. Require the exact current head, a mergeable clean state, resolved review threads, no effective change request, a current-head Noema approval marker, all mandatory release/security checks, and successful observed status contexts before merge.
4. Dispatch the trusted default-branch `central-review` workflow when all machine checks are complete and only the current-head Noema approval is missing.
5. Merge with GitHub's SHA precondition so a head movement cannot race the final decision.
6. When there are no open pull requests, refresh saleable and acquisition-readiness evidence in report-only mode without fabricating production, revenue, transfer, or customer evidence.
7. Persist an auditable JSON report and human-readable workflow summary for every run.

## Non-goals

- The workflow will not autonomously edit untrusted pull-request code. Agentic code changes remain blocked on the quarantine sandbox tracked in issue #9.
- The workflow will not manufacture 30-day production KPI, ARR, LOI, paid-pilot, customer, or transferability evidence.
- The workflow will not weaken Security Scan, dependency, coverage, docstring, or Noema review gates.
- The workflow does not substitute for repository rulesets or protected-branch configuration in issue #27.
- Figma and Product Design are not used because this slice changes governance automation rather than a buyer-facing visual workflow.

## Architecture

### Pure decision engine

`scripts/lib/commercial-readiness-loop.mjs` owns deterministic pull-request evaluation. It receives a normalized snapshot and returns one of:

- `merge`: every fail-closed condition is satisfied.
- `request_review`: all merge conditions except a current-head Noema approval are satisfied.
- `blocked`: one or more concrete reasons prevent merge or review dispatch.

The evaluator has no network or filesystem access, making every decision branch unit-testable.

### GitHub adapter and orchestrator

`scripts/hourly-commercial-readiness.mjs` is the only GitHub I/O layer. It uses `gh api` without a shell, paginates every list endpoint, normalizes the latest check/status/review state, and feeds the pure evaluator. In apply mode it may perform only two writes:

1. Send a same-repository `noema-review` dispatch bound to the exact PR head.
2. Squash-merge a PR using the exact head SHA as GitHub's merge precondition.

Before either write it re-fetches the live PR. Before merge it requires the state, base, head repository, head SHA, mergeability, and clean merge state to remain unchanged.

### Scheduled workflow

`.github/workflows/hourly-commercial-readiness.yml` runs at minute 17 of every hour and via `workflow_dispatch`. It executes only default-branch trusted code, grants explicit least-privilege permissions, prevents overlapping runs, installs lockfile dependencies, runs the orchestrator in apply mode, uploads the JSON report, and writes a summary. If the report records zero open pull requests, it runs the existing readiness and acquisition audits with `NOEMA_AUDIT_REPORT_ONLY=1` and uploads their artifacts.

## Required merge evidence

The decision engine requires these exact check-run names to exist and conclude `success` on the current head:

- `verify`
- `reviewer`
- `scorecard`
- `osv-scan`
- `trivy-fs`
- `dependency-review`

Every additional observed check run must be completed with one of `success`, `neutral`, or `skipped`. Every observed commit status context must be `success`. Missing mandatory checks, pending work, failed/cancelled/timed-out checks, status errors, unresolved threads, effective `CHANGES_REQUESTED`, draft state, non-`main` base, cross-repository head, stale head, dirty/behind/unknown merge state, or absent current-head Noema approval all fail closed.

A Noema approval is current only when the newest Noema marker in submitted reviews exactly matches:

`<!-- noema-review-gate head_sha=<40-hex-head> decision=approve -->`

A newer current-head `request_changes` or `blocked` marker takes precedence.

## Review-state normalization

GitHub review submissions are reduced to the latest non-dismissed decision per reviewer. A latest `CHANGES_REQUESTED` blocks. Stale approvals do not satisfy the Noema marker rule because the marker must contain the exact current head SHA.

## Error handling

- Read or parse failures fail the workflow and preserve the partial report when possible.
- A blocked PR is an expected business state: it is recorded with reasons and does not cause a false infrastructure failure.
- A dispatch or merge write failure is an operational error and makes the workflow fail.
- A merge response with `merged != true` is an error even if the HTTP request succeeds.
- Reports bound untrusted text lengths and contain no tokens or response headers.

## Testing

Unit tests cover:

- missing, pending, and failed mandatory checks;
- failures in additional observed checks and status contexts;
- unresolved threads and effective change requests;
- exact-head Noema marker enforcement;
- the distinction between `request_review` and `blocked`;
- clean merge eligibility;
- pagination, explicit workflow permissions, hourly schedule, concurrency, report-only no-PR audit behavior, and SHA-bound merge contract through static workflow/script contracts.

The implementation must pass the repository's existing `npm run release:verify` gate before merge.

## Commercial-readiness effect

This slice turns maintainer discipline into repeatable operational evidence: each hour records why a PR merged, why it remained blocked, or which commercial-readiness gaps remain when the queue is empty. It closes a buyer-visible governance and supportability gap while preserving the distinction between code-computable readiness and evidence that must come from real customers and production operations.
