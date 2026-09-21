# Main governance workflow ref/SHA authority

Date: 2026-09-22
Owner: Noema repository-governance admission boundary
Status: Proposed source repair; live policy closure remains issue #27

## Problem

The required-workflow admission contract was branch-ref based: the canonical organization-owned Security Scan workflow was identified by organization source, immutable workflow repository id, path, and `ref: refs/heads/main`. The evaluator observed those fields but silently dropped the optional workflow `sha` field returned by GitHub's rules API.

GitHub documents both `ref` and `sha` on a required-workflow rule entry. Therefore evidence containing the canonical branch ref plus an additional SHA is not byte-for-byte equivalent to the reviewed branch-ref-only owner contract. Ignoring the SHA can turn an authority-bearing control-plane field into presentation noise and create a false PASS.

Primary authority: GitHub. (2026). *REST API endpoints for rules*. GitHub Docs. https://docs.github.com/en/rest/repos/rules

## Constraint

Noema must not invent a SHA-pinned owner contract while the live organization rule is branch-ref based. Conversely, it must not admit a SHA-bearing workflow as equivalent to the branch-ref contract. The evaluator is an admission boundary, so an unrecognized or additional authority field fails closed.

## Decision

`REQUIRED_MAIN_WORKFLOW` now states `sha: null`. `observedWorkflowControls()` preserves SHA state instead of discarding it:

- absent or JSON `null` SHA becomes `null`;
- a non-empty, already-exact SHA string is retained as evidence;
- malformed string serialization becomes `"unknown"` and cannot acquire authority.

`isCanonicalRequiredWorkflow()` requires the observed SHA state to equal the canonical `null` value in addition to the existing organization/repository/path/ref tuple. A future owner decision to pin by SHA must therefore change the organization-owned rule and this canonical contract together.

## Alternatives rejected

**Ignore SHA while matching the ref.** Rejected because GitHub exposes SHA as workflow authority; silently dropping it can admit a control-plane state different from the reviewed branch-ref-only contract.

**Accept either canonical ref or any SHA.** Rejected because it weakens identity from a reviewed tuple to two unrelated modes and lets Noema choose owner semantics.

**Hard-code a current workflow SHA.** Rejected because the live owner rule is branch-ref based and Noema does not own that stronger policy.

## Executable evidence

RED `6cdc4e937bd7626ece0fef0ae1d052f887eb389c` adds a hostile required-workflow fixture containing the canonical `refs/heads/main` ref plus an additional 40-hex SHA. The predecessor evaluator ignores `sha`, so it cannot emit `required_security_workflow_missing` for that case.

GREEN `d4eb6b5d06d23460969bf2d8d02fcdb6258f4f8b` adds explicit `sha: null` to the canonical owner tuple, preserves observed SHA state, and requires exact SHA-state equality in the canonical workflow matcher. The change does not alter provider routing, product-domain truth, quarantine/security runtime, outbound authority, deployment authority, or live ruleset configuration.

Hosted exact-head tests and independent current-head review remain separate evidence classes and are required before Ready/merge.

## Risk

This repair deliberately prefers false negatives if GitHub introduces a new SHA serialization or returns both fields in an unexpected form. That is acceptable for merge-governance admission: unexpected workflow identity must not be promoted to merge authority. If GitHub or the organization owner changes the contract, the owner rule and Noema admission tuple should be revised together with new fixtures.

## TRACEABILITY

GitHub required-workflow schema (`repository_id`, `path`, optional `ref`/`sha`) → `REQUIRED_MAIN_WORKFLOW.sha` → `observedWorkflowControls()` SHA preservation → `isCanonicalRequiredWorkflow()` exact ref/SHA admission → `test/main-governance-authority-exactness.test.ts` mixed ref/SHA hostile case → issue #27 live governance closure.
