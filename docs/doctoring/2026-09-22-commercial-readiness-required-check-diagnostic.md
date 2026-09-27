# Commercial readiness required-check diagnostic authority

Status: Proposed  
Date: 2026-09-22  
Owner boundary: Noema commercial merge-admission operator diagnostics only

## Problem

The active operator guide's `required_check_missing` troubleshooting step named only workflow trigger, `app.slug=github-actions`, and ruleset context names. Production admission is stricter: required evidence also depends on App id `15368`, check-suite/workflow-run binding, exact PR/head/base association, canonical workflow path and source, repository-workflow URL-id/`workflow_id` equality, complete changed-file evidence, and self-modified-workflow rejection. The abbreviated diagnostic could therefore direct an operator away from the actual fail-closed cause even though production correctly blocked the pull request.

## Constraints

- Do not change production admission behavior or weaken any gate.
- Keep this repair inside Noema-owned operator documentation and its executable contract.
- Do not infer runner, organization ruleset, App installation, provider, quarantine/security, outbound, or release authority from a diagnostic update.

## Decision

RED `ae2005ce14be6275f00f449a1e71e044b5319b60` adds a section-scoped contract over `## 운영 점검` requiring the `required_check_missing` diagnostic to name the full authority classes that can cause a required check to be rejected.

GREEN `7c65f2680f98cb66a835308e6f2c354ab05425d9` changes only the operator-guide diagnostic. Operators are now directed to verify workflow trigger, exact GitHub Actions slug and App id, `check_suite.id`/`check_suite_id`, PR/head/base association, canonical workflow path/source, repository-workflow URL id/`workflow_id`, `changed_files` completeness, `self-modified-workflow`, and ruleset context identity.

## Alternatives rejected

- **Leave the short diagnostic and rely on source inspection.** Rejected because the active operator contract must be code-current and usable without reverse-engineering the evaluator.
- **Collapse all failures into `required_check_missing`.** Rejected; production reason classes remain unchanged. The guide only expands the operator investigation path.
- **Change production to match the shorter guide.** Rejected as gate weakening.

## Risk and effect

This is documentation-only behavior. A future production provenance change can again make the diagnostic stale, so the section-scoped regression remains the executable guard. Hosted exact-head checks and independent review are revision-scoped and must be reacquired after this source movement.

## TRACEABILITY

GitHub. (n.d.). *REST API endpoints for check runs*. GitHub Docs. Retrieved September 22, 2026, from https://docs.github.com/en/rest/checks/runs?apiVersion=2026-03-10

GitHub. (n.d.). *REST API endpoints for workflow runs*. GitHub Docs. Retrieved September 22, 2026, from https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10
