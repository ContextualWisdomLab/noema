# Hourly Commercial-Readiness Loop Design

## Status

Approved for autonomous implementation under the repository's existing fail-closed review and release policy.

## Problem

Noema already has strong release, security, readiness, and acquisition audits, but the operational loop that connects them is manual. Pull requests can remain open after every substantive requirement is satisfied, current-head Noema review can be omitted until a maintainer dispatches it, and a no-PR period does not produce an hourly commercial-readiness evidence trail. The absence of protected-branch enforcement is tracked separately in issue #27 and cannot be replaced by workflow code.

## Goals

1. Inspect every open pull request once per hour and on trusted manual dispatch.
2. Never execute or check out pull-request code in the privileged maintenance workflow.
3. Require the exact current head, a mergeable clean state, resolved review threads, no effective change request, a current-head Noema approval marker, trusted mandatory release/security checks, and successful observed status contexts before merge.
4. Dispatch the trusted default-branch `central-review` workflow when all review-independent machine checks are complete and only the current-head Noema approval or review-dependent checks remain.
5. Deduplicate queued or in-progress central review runs for the exact repository, PR, and head SHA.
6. Merge with GitHub's SHA precondition and a dedicated Maintainer GitHub App token so head movement fails and downstream push workflows still run.
7. Require an explicit `NOEMA_MAINTENANCE_ENABLED=true` activation only after the Maintainer App is installed and its credentials and permissions are validated.
8. When no open pull request remains after writes, refresh saleable and acquisition-readiness evidence in report-only mode without fabricating production, revenue, transfer, or customer evidence.
9. Persist an auditable JSON report and human-readable workflow summary for every enabled run.

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
- `request_review`: all review-independent merge conditions are satisfied, current-head Noema approval is absent, and any remaining pending checks are exactly the two trusted review-dependent contexts.
- `blocked`: one or more concrete reasons prevent merge or review dispatch.

The evaluator has no network or filesystem access, making every decision branch unit-testable.

### GitHub adapter and orchestrator

`scripts/hourly-commercial-readiness.mjs` is the only GitHub I/O layer. It uses `gh api` without a shell, paginates every list endpoint, normalizes the latest check/status/review state, preserves each check run's producing App slug, and feeds the pure evaluator. In apply mode it may perform only two writes:

1. Send a same-repository `noema-review` dispatch bound to the exact PR head.
2. Squash-merge a PR using the exact head SHA as GitHub's merge precondition.

Before dispatch it scans every `central-review.yml` workflow run and suppresses duplicates whose `display_title`, event, and active status match the exact target. Before either write it re-fetches the live PR. Before merge it re-collects threads, reviews, check runs, statuses, mergeability, and current-head Noema evidence and requires the decision to remain `merge`.

### Maintainer identity and activation

The repository `GITHUB_TOKEN` is limited to `contents: read` and is used only for trusted default-branch checkout. A dedicated Maintainer GitHub App token performs PR reads, repository dispatch, and merge. This separation is required because events caused by `GITHUB_TOKEN` normally do not trigger downstream workflow runs; using an App token preserves post-merge `push` CI and release behavior.

The Maintainer App is separate from the Noema reviewer App and is installed only on `ContextualWisdomLab/noema` with Actions read, Checks read, Contents write, Metadata read, Pull requests write, and Commit statuses read.

The scheduled job is disabled unless repository variable `NOEMA_MAINTENANCE_ENABLED` is exactly `true`. This prevents an unconfigured App from creating hourly failures and prevents an unsafe fallback to `GITHUB_TOKEN`. Enabling the variable is an explicit operational cutover after the App client ID, private key, installation, and permission set are verified.

### Scheduled workflow

`.github/workflows/hourly-commercial-readiness.yml` runs at minute 17 of every hour and via a `commercial-readiness-loop` `repository_dispatch`. Both events evaluate workflow code from the default branch; branch-selectable `workflow_dispatch` is intentionally excluded. The workflow prevents overlap, installs lockfile dependencies, mints the dedicated Maintainer App token, runs the orchestrator in apply mode, uploads the JSON report, and writes a summary. If the post-action queue count is zero, it runs the existing readiness and acquisition audits with `NOEMA_AUDIT_REPORT_ONLY=1` and uploads their artifacts.

## Required merge evidence

The decision engine requires these exact check-run names to exist, be produced by GitHub Actions (`app.slug=github-actions`), and conclude `success` on the current head:

- `verify`
- `reviewer`
- `scorecard`
- `osv-scan`
- `trivy-fs`
- `dependency-review`

A third-party App cannot satisfy a mandatory gate by publishing a success with a colliding name. If multiple trusted GitHub Actions check runs share a required name, every matching run must succeed.

`reviewer-ci` runs on every PR rather than only reviewer-path changes, ensuring the `reviewer` context is always present for policy enforcement.

Every additional observed check run must be completed with one of `success`, `neutral`, or `skipped`. The exact `opencode-review` and `metadata-only gate evaluation` contexts are review-dependent checks only when produced by GitHub Actions: while Noema approval is absent, pending instances do not prevent `request_review`; after approval they block merge until complete. A third-party name collision receives no exception. Every observed commit status context must be `success`.

Missing mandatory checks, failed/cancelled/timed-out checks, non-review-dependent pending work, status errors, unresolved threads, effective `CHANGES_REQUESTED`, draft state, non-`main` base, cross-repository head, stale head, dirty/behind/unknown merge state, or a current-head Noema rejection all fail closed.

A Noema approval is current only when an authenticated Bot-authored review contains both:

- `Reviewer credential: noema-github-app`
- `<!-- noema-review-gate head_sha=<40-hex-head> decision=approve -->`

The review state must be compatible with the marker, and a newer current-head `request_changes` or `blocked` marker takes precedence.

## Review-state normalization

GitHub review submissions are reduced to the latest non-dismissed decision per reviewer. A latest `CHANGES_REQUESTED` blocks. Stale approvals do not satisfy the Noema marker rule because the marker must contain the exact current head SHA.

## Error handling

- Read or parse failures fail the workflow and preserve the partial report when possible.
- A blocked PR is an expected business state: it is recorded with reasons and does not cause a false infrastructure failure.
- A dispatch, App token, or merge write failure is an operational error and makes the workflow fail.
- A merge response with `merged != true` is an error even if the HTTP request succeeds.
- Failure to calculate the post-action queue count blocks no-PR audits and is recorded as an operational error.
- Reports bound untrusted text lengths and contain no tokens or response headers.
- Missing activation leaves the job skipped; it never silently switches to a weaker credential.

## Testing

Unit and contract tests cover:

- missing, pending, and failed mandatory checks;
- required-check and review-dependent-check name collisions from untrusted Apps;
- duplicate trusted mandatory checks;
- review-dependent pending checks before and after Noema approval;
- failures in additional observed checks and status contexts;
- unresolved threads and effective change requests;
- exact-head Noema marker and reviewer-credential enforcement;
- active central review run deduplication;
- the distinction between `request_review` and `blocked`;
- clean merge eligibility and exact-head revalidation;
- pagination, check producer identity, dedicated App identity, explicit activation, default-branch-only manual dispatch, explicit workflow permissions, hourly schedule, concurrency, report-only no-PR audit behavior, and SHA-bound merge contracts.

The implementation must pass the repository's existing `npm run release:verify` gate before merge.

## Commercial-readiness effect

This slice turns maintainer discipline into repeatable operational evidence: each enabled hourly run records why a PR merged, why it remained blocked, or which commercial-readiness gaps remain when the queue is empty. It closes buyer-visible governance and supportability gaps while preserving the distinction between code-computable readiness and evidence that must come from real customers and production operations.
