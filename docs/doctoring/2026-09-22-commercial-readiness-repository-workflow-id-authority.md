# Commercial readiness repository-workflow identity authority

Status: Proposed  
Date: 2026-09-22  
Owner boundary: Noema commercial merge-admission only

## Problem

`workflowRunSource()` classified repository-local Actions runs as `repository_workflow` when `workflow_url` had a numeric suffix under the target repository. Unlike the required-workflow path, it did not require that suffix to equal the same workflow run payload's `workflow_id`.

That left an identity-consistency gap before canonical-path admission. A payload could present the canonical repository workflow path while carrying `workflow_url=.../actions/workflows/305751493` and a different `workflow_id`; the predecessor source still classified it as repository workflow authority. The later path check could therefore treat internally inconsistent workflow metadata as if GitHub had bound it to one canonical workflow identity.

## Constraints

- Keep the existing target PR, exact head, exact base, check-suite, GitHub Actions App-id, changed-file completeness and self-modified local-workflow controls unchanged.
- Keep organization-required Security Scan source resolution separate; this repair does not replace its live rules/source-repository metadata binding.
- Do not introduce a new product-owned global registry of foreign workflow truth. This lane only requires consistency between two identity fields already present in the same GitHub workflow-run observation.
- A missing, malformed or disagreeing repository-workflow identity must fail closed as `unknown`, which the required-check adapter projects to `untrusted-workflow`.

## Decision

RED `7117472d0ac386b7ad9884a32537f59f2cbfe5a1` adds a hostile repository-local CI run whose URL ends in workflow id `305751493` while `workflow_id` is `311182356`. The predecessor classifier accepts that observation as `repository_workflow`, so the focused contract is deterministic RED.

GREEN `571cbdeb985d1bf1f3a2cdcd64fe9ac4d56a203c` changes only repository-local workflow classification. The URL suffix must be a positive safe integer and must equal `run.workflow_id`; otherwise source authority is `unknown`. Required-workflow metadata, canonical path checks, PR/head/base binding, App identity, self-modification rejection and normal-merge semantics are unchanged.

Current live exact-head workflow observations also expose distinct numeric workflow identities for Noema's repository workflows: CI uses workflow id `305751493` and reviewer-ci uses `311182356`. The repair does not hard-code those numbers as everlasting policy; it requires the API observation to be self-consistent before the existing canonical path/source contract is considered.

## Alternatives considered

Trusting only the URL suffix was rejected because it makes one unverified serialization override a contradictory `workflow_id` from the same workflow-run object. Trusting only `workflow_id` while ignoring `workflow_url` was rejected for the same reason in reverse. Pinning repository workflow IDs as new canonical constants was not selected because Noema already owns canonical local workflow paths and because workflow recreation can legitimately change an ID; any future immutable-ID policy would need its own owner evidence and migration rule.

## Risk and follow-up

This repair verifies identity consistency, not the content digest of a repository-local workflow file. The existing changed-file rule continues to reject a PR that modifies its own CI/reviewer workflow and then tries to use that workflow as merge evidence. If GitHub later exposes a stronger immutable repository-workflow identity or source digest suitable for this boundary, evaluate it as a separate authority change rather than inferring it here.

Hosted current-head checks and qualifying independent current-head review remain revision-scoped. Source GREEN is not merge authority until those evidence classes are terminal and current.

## TRACEABILITY

GitHub. (n.d.). *REST API endpoints for workflow runs*. GitHub Docs. Retrieved September 22, 2026, from https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10

Relevant API contract: workflow-run representations expose `workflow_id` as the parent workflow identifier and `workflow_url` as the URL of that workflow. This decision treats disagreement between those two fields as inconsistent authority evidence rather than choosing one field to override the other.
