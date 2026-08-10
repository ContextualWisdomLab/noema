# GitHub Actions Runner-Assignment Audit Doctoring

## Status and purpose

This record supports issue #30 and the repository command `npm run operations:runner-assignment`. It documents a **read-only operational evidence boundary** for distinguishing a GitHub Actions job that has not yet received a runner from a job that did receive a runner and later succeeded or failed for some other reason.

This control is deliberately narrower than CI or merge readiness. It does not create a replacement Check, infer source correctness, prove organization billing or runner-policy configuration, authorize a review, or authorize merge/release/deployment.

## Evidence model

The operator supplies an explicit bounded set of GitHub Actions workflow-run IDs plus the exact expected pull-request source-head SHA. The collector retrieves each selected workflow run and **all** job pages for that run, then the evaluator classifies runner assignment separately from the later workflow conclusion.

Required invariants are:

1. the repository is exactly `ContextualWisdomLab/noema`;
2. `GH_TOKEN` exists only as transport authority for read-only API calls and is never retained in the report;
3. the expected source head is one canonical lowercase 40-character commit SHA;
4. one to twenty unique positive run IDs are selected explicitly;
5. selected runs must be `pull_request` runs bound to that exact source head;
6. job pages are fully paginated with `per_page=100` and `filter=all`, bounded to at most 2,000 retained jobs;
7. runner assignment is observed only from job evidence such as `started_at`, a positive `runner_id`, or a non-empty `runner_name`;
8. a `waiting`, `pending`, or `requested` job remains non-passing `PENDING` because those states do not by themselves isolate runner allocation;
9. a queued job in a run where another job has already received a runner remains non-passing `PENDING`, because the queued job may be waiting on an explicit `jobs.<job_id>.needs` dependency rather than runner capacity;
10. the bounded grace may produce `runner_assignment_stalled` only when the workflow run itself remains `queued`, the job remains `queued`, and no job in that selected run has assignment evidence;
11. an assigned job may produce runner-assignment `PASS` even if its later workflow/test conclusion is `failure`, because those are separate evidence classes.

The default runner-allocation grace is five minutes and may be bounded by `NOEMA_ACTIONS_AUDIT_QUEUE_GRACE_MILLISECONDS`; the evaluator rejects values above thirty minutes rather than allowing a true isolated queue condition to remain indefinitely pending.

This classifier is intentionally conservative because the GitHub workflow-job REST representation does not expose a durable repository-consumable timestamp meaning “this job became eligible for runner allocation.” A workflow run's `created_at` is therefore not a trustworthy age for every downstream job. The evaluator uses run age only after the selected evidence isolates the top-level queued runner-allocation boundary described above.

### Pre-run waits are not runner stalls

GitHub distinguishes several reasons a job may not yet have reached a runner. In particular, **deployment protection rules** on an environment can leave a deployment job in a waiting state; GitHub documents that a job that references an environment is not sent to a runner until the environment's protection rules pass. Likewise, workflow syntax permits a job to declare `jobs.<job_id>.needs`, so downstream work waits for its prerequisite jobs before it can run.

Those states remain operationally non-passing, but they are not evidence that GitHub failed to allocate a runner. The audit therefore reports them as `PENDING` without `runner_assignment_stalled`. This does **not** convert them to success: required Checks, approvals, environment protection, and later job conclusions still retain their own authority.

## Operator contract

Example:

```bash
export GH_TOKEN='<read-only token materialized outside repository files>'
export NOEMA_ACTIONS_AUDIT_REPOSITORY='ContextualWisdomLab/noema'
export NOEMA_ACTIONS_AUDIT_HEAD_SHA='<exact current PR source head>'
export NOEMA_ACTIONS_AUDIT_RUN_IDS='31343034891,31343034896,31343034900'

npm run operations:runner-assignment
```

The command writes the fixed report path:

```text
artifacts/operations/actions-runner-assignment-audit.json
```

The report records repository, expected head, selected run IDs, observation time, queue grace, deterministic checks/failures, and explicit false authority flags for required-check success, review, merge, release, and deployment. Temporary report bytes are created owner-only and atomically renamed onto the fixed report path.

`PASS` exits zero. `PENDING` and `FAIL` both exit nonzero. A malformed source identity, cross-repository request, missing credential, malformed API JSON, GitHub CLI failure, pagination-shape failure, excessive evidence, or head mismatch fails closed.

## RCA interpretation

A `runner_assignment_stalled` result supports the narrow hypothesis **“the selected current-head workflow run and job remained at an isolated queued boundary without observable runner assignment beyond the configured grace interval.”** It does not by itself identify why. Possible causes remain materially distinct and require separate evidence, including GitHub-hosted runner capacity, repository/organization Actions policy, runner-group restrictions, billing/spending controls, concurrency saturation, enterprise policy, or a GitHub service incident.

A `PENDING` result for environment protection, `needs` dependency waiting, or other pre-run uncertainty means only that runner allocation has **not been isolated as the failing boundary**. It is not a health PASS and cannot satisfy a required Check.

Conversely, an observed runner assignment falsifies the hypothesis that the specific selected job is still blocked at runner allocation. A later failing step must be investigated at that later boundary rather than described as a runner-assignment incident.

This separation matters for issue #30 because historical Noema runs exhibited queued jobs without logs, while later runs demonstrably received GitHub-hosted runners. Repository evidence therefore needs to preserve **assignment state** independently from **job conclusion**, **dependency/protection waiting**, and any organization-level causal claim.

## Security and privacy

The collector uses GitHub Actions REST **read** endpoints only. It does not rerun, cancel, dispatch, approve, merge, modify refs, or change settings. The report does not contain `GH_TOKEN`, repository secrets, workflow logs, source contents, personal data beyond ordinary GitHub workflow/job metadata needed for the operational decision, or model output.

The `gh` child process also receives a purpose-built minimal environment rather than ambient process state: only `PATH`, the read-only `GH_TOKEN`, pinned `GH_HOST=github.com`, and `NO_COLOR=1` cross the process boundary. `GITHUB_TOKEN`, `NVIDIA_NIM_API_KEY`, Maintainer/Reviewer App private material, `HOME`, and ambient proxy variables are excluded. This prevents a read-only diagnostic subprocess from accidentally inheriting stronger publication/model credentials or redirecting credential-bearing requests through an unreviewed proxy path.

The audit is diagnostic evidence. A passing assignment audit cannot satisfy branch protection, required checks, formal review, security scanning, release provenance, production deployment, or acquisition evidence.

## Acceptance

The repository-owned slice is acceptable when:

- realistic tests reproduce an isolated runner stall, a fresh queue, deployment/environment waiting, downstream dependency waiting, assigned-but-failed jobs, head mismatch, malformed evidence, pagination, and bounded selection;
- environment-protected and dependency-blocked jobs remain nonzero `PENDING` and are not mislabeled as runner-allocation stalls;
- the pure evaluator and bounded source collector are GREEN;
- the operator adapter performs only the two documented read families and fully paginates jobs;
- the `gh` subprocess inherits only the minimal read-authority environment documented above;
- `PENDING` remains nonzero;
- report output is credential-free and authority-separated;
- normal repository tests and configured production coverage remain intact;
- the active PR does not claim issue #30 operational closure merely because the diagnostic control exists.

Closing issue #30 still requires real live evidence for the repository/organization acceptance criteria recorded in that issue.

## References

GitHub. (2026). *REST API endpoints for workflow jobs*. GitHub Docs. https://docs.github.com/en/rest/actions/workflow-jobs?apiVersion=2026-03-10

GitHub. (2026). *REST API endpoints for workflow runs*. GitHub Docs. https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10

GitHub. (2026). *Deployments and environments*. GitHub Docs. https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments

GitHub. (2026). *Workflow syntax for GitHub Actions*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
