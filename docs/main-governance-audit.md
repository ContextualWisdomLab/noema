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
- `workflows`
  - ruleset source type is exactly `Organization`
  - ruleset source is exactly `ContextualWisdomLab`
  - workflow repository id is `1274066402` (`ContextualWisdomLab/.github`)
  - workflow path is exactly `.github/workflows/security-scan.yml`
  - workflow ref is exactly `refs/heads/main`
- `non_fast_forward`
- `deletion`

The five governance rule types above and all six mandatory status contexts are authority-bearing API values. They must match the expected serialization exactly. A value such as `" pull_request "`, `"required_status_checks "`, or `" verify "` is malformed evidence rather than a canonical control and fails closed. The same exactness applies to the required-workflow rule type, source type, source, path, and ref.

The integration requirement prevents a similarly named status from an arbitrary producer from satisfying the governance contract. The required-workflow identity check separately prevents otherwise-compliant repository rules from passing after the organization-owned central Security Scan workflow is removed, repointed, or replaced by a repository-owned lookalike. The hourly decision engine independently verifies current-head check producer identity as a second control.

Authority fields are never normalized to manufacture a match. Human-facing trimming is appropriate for presentation data, but not for GitHub control-plane identities that determine whether a merge is allowed.

The workflow contract deliberately does not pin the ruleset numeric id. Recreating an organization ruleset can change that id without changing the owner/workflow authority. The stable authority checked by source is the organization owner plus immutable GitHub repository id, workflow path, and exact branch ref. Live ruleset identity and enforcement must still be refetched for each decision.

## Workflow ordering

`.github/workflows/hourly-commercial-readiness.yml` uses this sequence:

1. Check out trusted default-branch code.
2. Mint the repository-scoped maintainer App token.
3. Install lockfile dependencies.
4. Run `npm run governance:audit`.
5. Only after a `PASS`, inspect PRs, dispatch Noema review, or perform SHA-bound squash merge.

A failed governance audit stops all write actions but still uploads `main-governance-audit` evidence.

## API execution boundary

The GitHub CLI subprocess is shell-free, output-bounded, pinned to `github.com`, and limited to 20 seconds per request. It receives only `PATH`, the scoped `GH_TOKEN`, and the pinned `GH_HOST`; unrelated runner environment variables and proxy overrides are not inherited. Missing credentials, process timeout, malformed pagination, nonzero CLI exit, empty response, or invalid JSON produce a bounded `governance_collection_failed` report and a failing exit code.

## Permissions

GitHub documents the active branch-rules endpoint as requiring only repository `Metadata: read` for a fine-grained or GitHub App installation token. The maintainer App therefore does **not** receive repository administration permission.

Creating or changing a repository or organization ruleset requires administrative authority and remains an explicit operator action tracked in issue #27. The audit only observes effective controls and refuses writes when the required control set is absent.

## Report schema

The JSON report contains:

- `schema_version`
- `repository`
- `branch`
- `generated_at`
- `source`
- `protected_main_sha` (the exact lowercase protected `main` revision observed before and after collection)
- `status`
- `active_rule_count`
- `active_rule_types`
- `rule_sources`
- `observed_controls`, including the exact required-workflow observations
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
3. Activate pull-request, status-check, non-fast-forward, and deletion rules using their canonical GitHub rule types.
4. Enable stale-review dismissal and conversation resolution.
5. Add the six required check contexts with their exact names and select the GitHub Actions integration as the expected source.
6. Preserve the organization-owned `ContextualWisdomLab/.github` `.github/workflows/security-scan.yml@refs/heads/main` required-workflow control; do not replace it with a repository-owned lookalike.
7. Require branches to be up to date before merge.
8. Re-run the audit and retain the generated artifact.

Do not disable the audit, remove required checks or the required workflow, normalize malformed authority strings, use an unpinned status source, or grant the maintainer App administration access to make the workflow pass.

## Primary references

- GitHub REST API: repository rules and active branch rules
- GitHub rulesets: available branch rules, required workflows, and required status checks
- GitHub Actions `GITHUB_TOKEN`: workflow-trigger suppression and GitHub App token alternative
