# Maintainer App Readiness Audit Design

## Status

Approved for autonomous implementation as the next commercial-readiness slice after the hourly maintainer and live-main governance gates.

## Problem

Noema's hourly commercial-readiness loop is intentionally disabled until a separate Maintainer GitHub App and the exact Noema reviewer bot identity are provisioned. Issue #29 currently describes this cutover as a manual checklist. A buyer, operator, or auditor cannot yet run one default-branch workflow and receive bounded evidence that:

- the effective maintainer token is scoped only to `ContextualWisdomLab/noema`;
- the token belongs to the configured Maintainer App and not the Noema reviewer App;
- the configured reviewer login resolves to the exact GitHub App bot identity expected by the review gate;
- the effective token can read the Actions, checks, statuses, pull-request, contents, and repository metadata needed by the loop;
- the token does not have repository administration authority;
- active `main` governance passes before an operator enables autonomous writes;
- the complete PR loop can execute in dry-run mode without dispatching review or merging.

GitHub documents that `actions/create-github-app-token` can scope a token to named repositories and explicit permissions, and exposes the installation id and app slug. GitHub also documents `/installation/repositories` for enumerating repositories accessible to an installation token. The audit will use those effective-token surfaces and will not claim to prove the App registration's full installation configuration or break-glass ownership.

## Goals

1. Add a pure fail-closed evaluator for maintainer App activation evidence.
2. Add a shell-free GitHub adapter that collects bounded, paginated evidence using the effective installation token.
3. Verify exact maintainer and reviewer bot identities, including the `[bot]` suffix and GitHub `Bot` type.
4. Require the Maintainer and reviewer identities to be distinct.
5. Require the token's accessible repository set to contain exactly `ContextualWisdomLab/noema`.
6. Require repository metadata to report `pull=true`, `push=true`, and `admin=false` for the effective token.
7. Probe all read APIs used by the hourly loop and record pass/fail without exposing response bodies or credentials.
8. Require the machine-generated `main-governance-audit.json` to be present and `PASS`.
9. Add a default-branch-only, manual `repository_dispatch` workflow that mints the exact production token, runs governance, runs the App audit, and then executes the commercial-readiness loop without `--apply`.
10. Preserve JSON evidence and a human-readable job summary for buyer due diligence.

## Non-goals

- The audit will not enable `NOEMA_MAINTENANCE_ENABLED` or mutate repository variables, secrets, App registrations, installations, rulesets, pull requests, or branches.
- It will not generate an App JWT or read the private key outside the GitHub-owned token-minting action.
- It will not claim to prove that the underlying installation has no additional repositories or permissions beyond the token that was explicitly scoped for this run. That stronger registration audit requires an App JWT or reviewed administrator evidence and remains part of issue #29.
- It will not replace issue #27's bypass-actor and break-glass review.
- It will not execute pull-request code.
- Figma and Product Design are not applicable because this slice is an operational security and due-diligence workflow, not a visual product interaction.

## Architecture

### Pure evaluator

`scripts/lib/maintainer-app-readiness.mjs` exports:

- `evaluateMaintainerAppReadiness(evidence)`
- `EXPECTED_EFFECTIVE_REPOSITORY_PERMISSIONS`
- `REQUIRED_API_PROBES`

The evaluator returns:

```js
{
  status: "PASS" | "FAIL",
  checks: Array<{ code: string, pass: boolean, detail: string }>,
  failures: Array<{ code: string, detail: string }>,
}
```

It has no network, filesystem, environment, or clock access.

### GitHub adapter

`scripts/maintainer-app-readiness.mjs` uses `spawnSync("gh", ..., { shell: false })` and bounded output. It collects:

- paginated `GET /installation/repositories?per_page=100`;
- `GET /users/{app-slug}[bot]` for the maintainer App identity;
- `GET /users/{configured-reviewer-login}` for the reviewer identity;
- `GET /repos/{owner}/{repo}` for effective coarse repository permissions and default branch;
- a default-branch commit SHA;
- read probes for Actions runs, check runs, commit statuses, pull requests, and contents;
- the existing governance audit report.

The adapter emits `artifacts/operations/maintainer-app-readiness.json`, workflow outputs, and a job summary. It does not print API response bodies, tokens, headers, private keys, or unbounded errors.

### Workflow

`.github/workflows/maintainer-app-readiness.yml` is triggered only through `repository_dispatch: [maintainer-app-readiness]`, which GitHub evaluates from the default branch. The workflow:

1. Checks out trusted default-branch code with persisted credentials disabled.
2. Mints a repository-scoped Maintainer App token through the pinned GitHub-owned action, requesting exactly the production permissions.
3. Sets up Node 24 and installs the lockfile.
4. Runs the existing active-main governance audit.
5. Runs the new maintainer App readiness audit with the action's `app-slug` and `installation-id` outputs.
6. Runs `scripts/hourly-commercial-readiness.mjs` without `--apply` to prove the loop can inspect current state without writes.
7. Uploads governance, App readiness, and dry-run loop evidence even if a gate fails.

The job-level `GITHUB_TOKEN` remains `contents: read`. All GitHub API reads use the scoped Maintainer App token. There is no fallback token and no write command.

## Required checks

The evaluator requires:

- exact repository name and valid positive installation id;
- non-empty maintainer App slug;
- maintainer bot login exactly `${appSlug}[bot]`, type `Bot`, and account not suspended;
- configured reviewer login ending in `[bot]`, exact API login match, type `Bot`, and account not suspended;
- maintainer and reviewer logins differ;
- exactly one effective token repository, matching the target repository;
- effective repository permissions `pull=true`, `push=true`, `admin=false`;
- every named API probe succeeds;
- governance report repository and branch match, and status is `PASS`.

`maintain`, `triage`, and other coarse repository booleans are recorded but are not treated as fine-grained App permission proof. The report explicitly states that the token-mint action's explicit permission inputs are the effective permission boundary for the run.

## Error handling

- Invalid or incomplete evidence fails closed with stable reason codes.
- GitHub CLI startup, API, pagination, JSON, filesystem, or governance-report errors produce a bounded `collection_failed` report and nonzero exit.
- API probes record only endpoint labels and pass/fail; response payloads are discarded.
- The report contains no token values, private key material, authorization headers, or secret-derived fingerprints.
- Evidence writes are atomic enough for CI use: parent directories are created and the final JSON is written once.

## Testing

Vitest coverage will include:

- a fully passing evidence fixture;
- malformed installation id and App slug;
- maintainer bot login/type/suspension failures;
- reviewer login/type/suspension failures;
- same-identity rejection;
- missing, extra, and wrong accessible repositories;
- missing pull/push or unexpected admin permission;
- each API probe failure;
- missing, malformed, stale-repository, wrong-branch, and failed governance reports;
- complete pagination and shell-free adapter contracts;
- default-branch-only workflow trigger, exact token permissions, action outputs, ordering, dry-run no-write behavior, and evidence uploads.

The final PR must pass `npm run release:verify`, CodeRabbit, reviewer 100% line/branch and docstring gates, and all Security Scan jobs before SHA-bound squash merge.

## Commercial-readiness effect

This change converts issue #29's most important pre-activation assertions into repeatable machine evidence. It reduces cutover error, proves identity separation and effective least privilege, and gives a buyer a single auditable preflight artifact while remaining honest about the administrator-only installation and break-glass facts that code cannot prove.
