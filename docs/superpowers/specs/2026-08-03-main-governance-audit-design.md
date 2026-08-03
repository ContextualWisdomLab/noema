# Main Governance Audit Design

## Status

Approved for autonomous implementation under the commercial-readiness loop. This slice addresses the enforceable-governance gap tracked in issue #27 without granting the maintenance App repository administration permission.

## Problem

Noema's hourly maintainer loop now makes fail-closed merge decisions in code, but `main` still lacks independently verifiable repository rules. A buyer or auditor cannot treat workflow discipline as equivalent to platform-enforced controls. The maintenance loop must refuse write actions unless GitHub reports active rules for `main` that require pull requests, current-head checks, resolved conversations, stale-review dismissal, and protection from force pushes and deletion.

## Goals

1. Read all active repository and organization rules applying to `main` through GitHub's `GET /repos/{owner}/{repo}/rules/branches/main` endpoint.
2. Evaluate the response with a pure, deterministic module.
3. Require these active rule types: `pull_request`, `required_status_checks`, `non_fast_forward`, and `deletion`.
4. Require pull-request parameters to dismiss stale reviews, resolve review threads, and allow squash merge.
5. Require strict status checks for `verify`, `reviewer`, `scorecard`, `osv-scan`, `trivy-fs`, and `dependency-review`.
6. Require each mandatory status check to be pinned to an integration ID rather than accepting an arbitrary producer.
7. Emit bounded JSON evidence and a GitHub Actions summary.
8. Run the audit before the hourly loop can dispatch review or merge a pull request.

## Non-goals

- The audit does not create or modify rulesets. That action requires repository administration write permission and remains an explicit operator task in issue #27.
- The audit does not claim bypass actors are safe. GitHub may omit `bypass_actors` unless the caller has ruleset write visibility; break-glass configuration remains reviewed operational evidence.
- The audit does not replace Noema's own current-head producer checks.

## Architecture

`scripts/lib/main-governance-audit.mjs` exports the expected check names and `evaluateMainGovernanceRules(rules)`. It has no filesystem, environment, clock, subprocess, or network access. It returns `{ status: "PASS" | "FAIL", checks, failures }`.

`scripts/main-governance-audit.mjs` shells out to `gh` with `shell: false`, uses complete pagination and slurp, validates `GITHUB_REPOSITORY`, writes `artifacts/governance/main-governance-audit.json`, appends a concise summary, and exits nonzero on failure.

`.github/workflows/hourly-commercial-readiness.yml` runs `npm run governance:audit` after minting the dedicated maintainer App token and before `hourly-commercial-readiness.mjs --apply`. The audit uses only metadata read access, already present in the App permission set.

## Rules Contract

The active rules response must contain:

- `pull_request` with:
  - `dismiss_stale_reviews_on_push: true`
  - `required_review_thread_resolution: true`
  - `allowed_merge_methods` containing `squash`
- `required_status_checks` with:
  - `strict_required_status_checks_policy: true`
  - every mandatory context exactly once or more
  - a positive integer `integration_id` for every mandatory context
- `non_fast_forward`
- `deletion`

Unknown additional rules are retained in evidence and do not fail the audit.

## Error Handling

Malformed, missing, or non-array GitHub responses fail closed. Duplicate mandatory checks are accepted only if every duplicate has a positive integration ID. Missing parameters produce stable failure codes. Reports contain no token, headers, or raw CLI stderr beyond a bounded one-line error.

## Verification

Tests cover a fully compliant ruleset, each missing rule, stale-review and thread-resolution settings, squash policy, strict current-head policy, missing checks, unpinned check producers, malformed input, script pagination, workflow ordering, package command wiring, and documentation references.

## Commercial Effect

The hourly maintainer becomes conditionally operational rather than merely credential-gated: even valid credentials cannot dispatch or merge while GitHub's own `main` governance is absent or has drifted. This produces buyer-visible, machine-verifiable evidence without over-privileging the automation identity.
