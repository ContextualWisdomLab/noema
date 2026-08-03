# Production Environment Governance Audit Design

## Problem

The release-bound deployment workflow references GitHub's `production` environment, but the repository does not yet produce machine-verifiable evidence that the environment actually requires independent approval, prevents self-approval, and restricts deployments to protected refs. Merely naming an environment does not create a deployment control; an unprotected environment releases its secrets and starts the job immediately. A branch-selectable privileged workflow could also remove an in-job audit before it runs.

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

The privileged deployment workflow is triggered only by `repository_dispatch` type `noema-production-deploy`, which GitHub evaluates from the default branch. Its payload supplies only the immutable release tag. The job also asserts `GITHUB_REF=refs/heads/main`, runs the environment governance audit after dependency installation and before any Cloudflare credential-bearing step, and includes the governance report in the 365-day deployment evidence artifact.

The protected `production` environment still performs GitHub's native approval before job execution. The default-branch-only entrypoint prevents branch workflow code from deleting the audit, while the native branch policy protects the environment itself.

## Fail-closed boundary

Missing environments, API errors, malformed response data, empty reviewer sets, self-review allowance, permissive branch policy, a non-main workflow ref, or a branch-selected deployment trigger all fail the deployment. The GitHub environment API response does not prove that administrator bypass is disabled, so that control remains explicit reviewed operational evidence rather than an unsupported automated claim.

## Verification

Vitest covers passing governance, missing required-reviewer/branch rules, empty reviewers, self-review, permissive branch settings, malformed input, bounded report contracts, current API headers, shell-free GitHub CLI execution, default-branch-only repository dispatch, exact main-ref execution, workflow ordering before Cloudflare secrets, and durable artifact retention.
