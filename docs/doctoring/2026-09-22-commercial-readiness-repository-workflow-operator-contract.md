# Commercial readiness repository-workflow operator contract

Status: Proposed  
Date: 2026-09-22  
Owner boundary: Noema commercial merge-admission documentation only

## Problem

Production already rejects a repository-local workflow run when the numeric workflow identifier encoded by the target repository's `/actions/workflows/<id>` URL is missing, malformed, outside the safe-integer range, or differs from the same run payload's `workflow_id`. The active operator guide named `repository_workflow` and the canonical CI/reviewer paths but omitted that identity-consistency requirement. An operator following the guide could therefore treat evidence as acceptable that production correctly classifies as `untrusted-workflow`.

## Constraints

- Do not change production merge-admission behavior; the causal source repair is already present.
- Keep required-workflow owner metadata binding separate from repository-local workflow identity.
- Preserve exact PR/head/base, App-id, check-name/producer, self-modification, review-head, and normal-merge authority.
- Make the active guide executable-contract current rather than relying on this decision record alone.

## Decision

RED `7deafd477ce57b698c6fa22b0d4d2d542b4301ad` adds a section-scoped operator-guide regression that requires the repository workflow URL `<id>` to be documented as identical to the workflow-run `workflow_id`. The predecessor guide fails that contract.

GREEN `4b8ef8576c90f72b65ccbd46645d1d9b7bbf7320` changes only the active operator guide. It states that repository-local `verify` and `reviewer` evidence requires the target-repository `/actions/workflows/<id>` URL id to equal the same run's `workflow_id`; missing, non-integer, unsafe, or mismatched values fail closed as `untrusted-workflow`.

No production behavior, gate, runner selector, provider routing, domain truth, quarantine/security runtime, outbound authority, or release authority changes.

## Evidence and follow-up

The finding was raised by fresh independent review of predecessor exact `c74e3488566baf9616050988944a77bb94b3177d` and was revalidated against `workflowRunSource()` in `scripts/hourly-commercial-readiness.mjs`. Hosted checks and independent review are revision-scoped; this documentation repair does not inherit predecessor GREEN or review authority.

## TRACEABILITY

GitHub. (n.d.). *REST API endpoints for workflow runs*. GitHub Docs. Retrieved September 22, 2026, from https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10

Relevant contract: a workflow-run payload exposes both `workflow_id` and `workflow_url`; Noema treats the two representations as one authority-bearing repository-workflow identity and fails closed when they disagree.
