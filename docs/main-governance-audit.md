# Main Governance Audit

Noema's hourly maintainer must not rely on workflow discipline alone. Before it can dispatch a review or merge a pull request, it verifies the active GitHub rules that apply to `main`.

## Command

```bash
GITHUB_REPOSITORY=ContextualWisdomLab/noema \
GH_TOKEN=<repository-scoped-installation-token> \
npm run governance:audit
```

The default evidence path is:

```text
artifacts/governance/main-governance-audit.json
```

Override it with `NOEMA_GOVERNANCE_AUDIT_PATH` when an external evidence pipeline requires a different location.

## Required active rules

The audit reads every page from:

```text
GET /repos/ContextualWisdomLab/noema/rules/branches/main?per_page=100
```

This endpoint returns active repository and organization rules that apply to `main`. Disabled or evaluate-only rules do not count.

The effective response must contain:

- `pull_request`
  - `dismiss_stale_reviews_on_push: true`
  - `required_review_thread_resolution: true`
  - `allowed_merge_methods` includes `squash`
- `required_status_checks`
  - `strict_required_status_checks_policy: true`
  - `verify`
  - `reviewer`
  - `scorecard`
  - `osv-scan`
  - `trivy-fs`
  - `dependency-review`
  - every mandatory context has a positive `integration_id`
- `non_fast_forward`
- `deletion`

The integration requirement prevents a similarly named status from an arbitrary producer from satisfying the governance contract. The hourly decision engine independently verifies current-head check producer identity as a second control.

## Workflow ordering

`.github/workflows/hourly-commercial-readiness.yml` uses this sequence:

1. Check out trusted default-branch code.
2. Mint the repository-scoped maintainer App token.
3. Install lockfile dependencies.
4. Run `npm run governance:audit`.
5. Only after a `PASS`, inspect PRs, dispatch Noema review, or perform SHA-bound squash merge.

A failed governance audit stops all write actions but still uploads `main-governance-audit` evidence.

## Permissions

GitHub documents the active branch-rules endpoint as requiring only repository `Metadata: read` for a fine-grained or GitHub App installation token. The maintainer App therefore does **not** receive repository administration permission.

Creating or changing a repository ruleset requires `Administration: write` and remains an explicit operator action tracked in issue #27.

## Report schema

The JSON report contains:

- `schema_version`
- `repository`
- `branch`
- `generated_at`
- `source`
- `status`
- `active_rule_count`
- `active_rule_types`
- `rule_sources`
- `checks`
- `failures`
- `limitations`

Failure codes are stable enough for alert routing and due-diligence evidence. The report does not include tokens, headers, or unbounded CLI output.

## Break-glass limitation

The active-rules endpoint proves the effective rules that apply to `main`, but it does not prove that every bypass actor is appropriate. GitHub may omit `bypass_actors` unless the caller has write visibility to the ruleset.

Therefore:

- break-glass actors must be separately reviewed and documented;
- the maintainer App must not have administration permission;
- issue #27 remains open until the ruleset and break-glass procedure are configured and independently evidenced;
- a `PASS` from this audit is necessary but not sufficient to close the break-glass acceptance criterion.

## Operator remediation

When the audit fails:

1. Open repository or organization Rulesets settings.
2. Target the default branch or `refs/heads/main`.
3. Activate pull-request, status-check, non-fast-forward, and deletion rules.
4. Enable stale-review dismissal and conversation resolution.
5. Add the six required check contexts and select the GitHub Actions integration as the expected source.
6. Require branches to be up to date before merge.
7. Re-run the audit and retain the generated artifact.

Do not disable the audit, remove required checks, use an unpinned status source, or grant the maintainer App administration access to make the workflow pass.

## Primary references

- GitHub REST API: repository rules and active branch rules
- GitHub rulesets: available branch rules and required status checks
- GitHub Actions `GITHUB_TOKEN`: workflow-trigger suppression and GitHub App token alternative
