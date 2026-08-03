# Production Environment Governance Audit Design

## Problem

The release-bound deployment workflow references GitHub's `production` environment, but the repository does not yet produce machine-verifiable evidence that the environment actually requires independent approval, prevents self-approval, and restricts deployments to protected refs. Merely naming an environment does not create a deployment control; an unprotected environment releases its secrets and starts the job immediately.

## Design

Add a pure evaluator and a shell-free GitHub API adapter for the production environment. The evaluator consumes the `GET /repos/{owner}/{repo}/environments/production` response and fails closed unless:

- the environment name is exactly `production`;
- a `required_reviewers` protection rule exists;
- at least one concrete User or Team reviewer is configured;
- `prevent_self_review` is true;
- a `branch_policy` protection rule exists;
- `deployment_branch_policy.protected_branches` is true;
- `deployment_branch_policy.custom_branch_policies` is false.

The adapter uses the current GitHub REST API version, writes a bounded JSON report, adds workflow outputs and a job summary, and exits nonzero on collection or policy failure. Reviewer evidence is reduced to type, stable numeric ID, and login/slug/name; no token, email, or unbounded API object is retained.

## Deployment integration

The `cd` workflow must be dispatched from `refs/heads/main`, run the environment governance audit after dependency installation and before any Cloudflare credential-bearing step, and include the governance report in the 365-day deployment evidence artifact. The protected `production` environment still performs GitHub's native approval before job execution; the in-job audit prevents a missing or weakened configuration from silently becoming accepted operational policy.

## Fail-closed boundary

Missing environments, API errors, malformed response data, empty reviewer sets, self-review allowance, or permissive branch policy all fail the deployment. The GitHub environment API response does not prove that administrator bypass is disabled, so that control remains explicit reviewed operational evidence rather than an unsupported automated claim.

## Verification

Vitest covers passing governance, missing required-reviewer/branch rules, empty reviewers, self-review, permissive branch settings, malformed input, bounded report contracts, current API headers, shell-free GitHub CLI execution, exact main-ref dispatch, workflow ordering before Cloudflare secrets, and durable artifact retention.
