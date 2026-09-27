# Commercial-readiness required-workflow source authority

Date: 2026-09-22 KST

## Problem

Independent review of PR #730 exact `cca15b185f41b019748ecdb652b348a20b949d48` found a valid authorization gap. `workflowRunSource()` treated any numeric `https://api.github.com/repos/ContextualWisdomLab/noema/actions/required_workflows/<id>` URL as `required_workflow`. The later check verified only the expected path. A target-repository required-workflow handle therefore did not prove that the producing workflow was the canonical organization-owned Security Scan source.

The live #730 Security Scan run demonstrates why the distinction matters: its target-repository payload exposes `workflow_id=311017545`, `path=.github/workflows/security-scan.yml`, and a target-repository `/actions/required_workflows/311017545` URL, while the active repository ruleset separately identifies the workflow owner as repository id `1274066402`, path `.github/workflows/security-scan.yml`, ref `refs/heads/main`, source type `Organization`, source `ContextualWisdomLab`.

## Constraint

Noema must consume the organization-owned security contract without copying its workflow implementation. Required-workflow authority therefore has to be derived from current GitHub control-plane evidence, not from a numeric target-repository URL, a familiar path, or a locally hard-coded workflow id. Repository-local `verify` and `reviewer` workflow handling must remain unchanged.

## Alternatives

1. Trust the numeric `/required_workflows/<id>` URL plus path. Rejected because the target-repository handle does not establish the source repository/ref owner tuple.
2. Pin `311017545` in Noema source. Rejected because it creates mutable external-owner truth in the consumer and can silently stale when the organization-owned workflow is recreated.
3. Re-resolve the live ruleset workflow tuple and source repository/workflow metadata, then enrich only matching run ids. Selected because it preserves the owner boundary and fails closed when any authority leg is absent or different.

## Decision

The commercial loop now resolves a required-workflow run through three independent observations before classifying it as `required_workflow`:

- the target run's exact numeric `workflow_id` must equal the numeric suffix of its target-repository `/actions/required_workflows/<id>` URL;
- active `main` rules must contain exactly one organization-owned workflow tuple matching `REQUIRED_MAIN_WORKFLOW`: repository id `1274066402`, `.github/workflows/security-scan.yml`, `refs/heads/main`, `sha=null`, source type `Organization`, source `ContextualWisdomLab`;
- repository id `1274066402` must resolve to a repository owned by `ContextualWisdomLab`, and that repository's active workflow inventory must contain the same workflow id at the canonical security-scan path.

Only then is canonical metadata attached to the run and accepted by `workflowRunSource()`. Missing or mismatching metadata leaves source classification `unknown`, which downstream required-check evaluation exposes as `untrusted-workflow`. API collection failure remains an `operational_error`; it never falls back to URL-only trust.

The operator guide was repaired in the same GREEN commit. It now also states the actual `latestCheckRunsBySuite()` behavior for incomplete check identity and fixes the malformed inline-code delimiters around `event=pull_request` and `base.ref=main`.

## RED → GREEN evidence

- RED `ce9f1be5387e888c85e2e41a0b720b038924587f` adds a hostile required-workflow contract: target-repository numeric URLs with missing or wrong canonical source metadata must become `untrusted-workflow`. It also makes the operator-guide contract require the source repository/ruleset tuple and the real `operational_error` behavior for incomplete check identity.
- GREEN `c529e56da64ce5d58ffeb3bd5f46e92070c9dfdd` binds live required-workflow ids through current owner metadata and repairs the two documentation findings. RED → GREEN is ordinary-forward by one commit with no force update.

Hosted exact-head checks and independent review after source mutation remain separate evidence. Neither the predecessor review nor predecessor workflow runs authorize the GREEN head.

## Risks and follow-up

The repair intentionally adds live metadata reads. If the rules endpoint, repository-by-id lookup, or owner workflow inventory cannot be read, the loop fails operationally rather than manufacturing required-workflow authority. This may reduce availability during GitHub control-plane incidents, but preserves the merge authorization boundary.

A future optimization may cache the immutable observations inside one loop invocation, but must not cache them across runs or weaken exact owner/ref/path checks. If GitHub changes required-workflow API representation, update the owner contract and hostile fixtures together before accepting the new representation.

## TRACEABILITY

GitHub. (2026). *REST API endpoints for rules*. https://docs.github.com/en/rest/repos/rules

The workflow rule schema defines `repository_id`, `path`, optional `ref`, and optional `sha` as the source workflow tuple required by a ruleset.

GitHub. (2026). *REST API endpoints for workflow runs*. https://docs.github.com/en/rest/actions/workflow-runs

The workflow-run schema exposes `workflow_id`, `workflow_url`, `check_suite_id`, `head_sha`, `event`, and associated pull requests; Noema binds those run observations to the separately owned ruleset/source metadata rather than treating the target URL as source identity.