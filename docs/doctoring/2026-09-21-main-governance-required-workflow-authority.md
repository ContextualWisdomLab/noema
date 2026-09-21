# Main governance required-workflow authority

Date: 2026-09-21
Owner: Noema repository-governance admission boundary
Status: Proposed source repair; live policy closure remains issue #27

## Problem

`evaluateMainGovernanceRules()` already retained `workflows` rules in `observed_controls.required_workflows`, but a workflow was observation only. A rule set containing the target pull-request, required-status, non-fast-forward, and deletion controls could therefore return `PASS` after the organization-owned central Security Scan required-workflow rule had been removed or repointed.

That is inconsistent with the repository contract in `AGENTS.md`: the central Security Scan required workflow is a mandatory merge gate, and absent or stale Security Scan evidence is non-passing. A governance audit that can pass after removal of that workflow is not a fail-closed admission control.

## Current external authority

Fresh GitHub ruleset evidence on 2026-09-21 reports active organization ruleset `18794436`, `CWL Noema central security scan`, targeting `~DEFAULT_BRANCH`. Its required workflow is:

- owner: organization `ContextualWisdomLab`;
- workflow repository id: `1274066402` (`ContextualWisdomLab/.github`);
- path: `.github/workflows/security-scan.yml`;
- ref: `refs/heads/main`.

The same live ruleset reports no bypass actors and `current_user_can_bypass: never`. This observation does not establish the stronger pull-request/status/non-fast-forward/deletion target policy tracked by issue #27, and it is not evergreen authority. The active-rules endpoint must still be refetched before a merge decision.

GitHub's current REST documentation states that `GET /repos/{owner}/{repo}/rules/branches/{branch}` returns all active rules applying to the branch, including organization-level rules, and excludes disabled/evaluate-only rules. For a `workflows` rule, GitHub exposes the workflow `repository_id`, `path`, and optional `ref`/`sha`. This makes workflow identity admissible from the same effective-rule evidence already consumed by the audit.

Primary reference: GitHub. (2026). *REST API endpoints for rules*. GitHub Docs. https://docs.github.com/en/rest/repos/rules

## Decision

The audit now requires one observed effective workflow to match all of these stable authority fields:

- `ruleset_source_type === "Organization"`;
- `ruleset_source === "ContextualWisdomLab"`;
- `repository_id === 1274066402`;
- `path === ".github/workflows/security-scan.yml"`;
- `ref === "refs/heads/main"`.

These identity-bearing strings are compared exactly. Leading or trailing whitespace, a whitespace-altered `workflows` rule type, or another serialization that is only equal after trimming is malformed evidence and fails closed. Human-facing normalization is not authority normalization.

The numeric ruleset id is deliberately not a pass condition. Recreating an organization ruleset can legitimately change the ruleset id while preserving the authority owner and immutable workflow repository identity. The numeric id remains evidence, not the stable contract.

## Alternatives rejected

**Accept any `workflows` rule.** Rejected because a repository-owned lookalike or unrelated required workflow could satisfy the audit.

**Match path only.** Rejected because the same relative path in another repository is different authority.

**Normalize authority strings before comparison.** Rejected because trimming malformed source/path/ref/type values can transform non-canonical evidence into canonical authority and create a false PASS. Exact API identity fields are not display text.

**Pin ruleset id `18794436`.** Rejected because ruleset recreation would cause an unnecessary source change even when the owner and workflow authority are unchanged.

**Pin a workflow SHA in Noema.** Rejected at this boundary because the current organization rule is branch-ref based. Noema must not silently invent a stronger owner contract than the live organization-owned rule. If the canonical owner changes to SHA pinning, the owner rule and Noema admission contract should change together.

## Executable evidence

RED `e28d2bd38f92bb394daba179d3c1d38b1e2a93d5` adds a regression showing that the protected evaluator accepted an otherwise-compliant rule set with the required workflow absent.

The protected production blob used for the focused reproduction is `d5031ea4e22221e8db39f29e0c1c55dec3b01156`. A byte-identical reconstruction verified by Git blob hash returns `PASS` for the no-workflow case.

GREEN begins at `9ef38f3cd0047d660de8d6e3fa4a4d39561f28bb`: the evaluator adds `required_security_workflow_missing` and matches the organization owner plus workflow repository/path/ref. The repaired production blob `e4d72a2bcb7c697b907402eecbff16d28e1c0f6c` returns `FAIL` for missing or wrong-path authority and `PASS` when the canonical workflow is present.

A second review found that `observedWorkflowControls()` still passed authority-bearing strings through `trim()`. That made values such as `" .github/workflows/security-scan.yml"`, `"Organization "`, or `" workflows "` equivalent to their canonical spellings. RED `56706017205703eec0b4eeda6224229b7496f39e` adds focused whitespace-altered path/ref/source/type regressions. A predecessor probe reproduces the defect directly: normalized malformed values become the canonical repository id/path/ref/source tuple and satisfy the authority predicate.

GREEN `0320f9788916524f1f949d467ddaad988f547a89` adds exact authority-string admission and requires an exact `workflows` rule type before observations are eligible. A focused current-source probe covers eight whitespace-altered identity cases plus the rule-type case: all nine are rejected with `required_security_workflow_missing`, while the exact canonical workflow remains admitted. The broader repository suite and hosted current-head gates remain separate evidence classes.

This focused probe is not repository full-suite, hosted current-head CI, independent review, live target-policy configuration, merge, release, or deployment evidence.

## Risks and follow-up

The required workflow closes one false-PASS class; it does not make current live governance compliant. Issue #27 remains open until the desired pull-request, approval, stale-review, conversation-resolution, required-status, strict-latest-base, non-fast-forward, deletion, and break-glass controls have live operator evidence.

After this source repair reaches an exact reviewed head, required hosted checks must be terminal GREEN before normal merge. Once protected, the next read-only governance audit should demonstrate two facts separately: the canonical central Security Scan workflow remains present, and the stronger target policy is still either PASS or explicitly failed by individual evidence codes.

## TRACEABILITY

`AGENTS.md` mandatory central Security Scan gate → `scripts/lib/main-governance-audit.mjs` canonical required-workflow predicate and exact identity admission → `test/main-governance-audit.test.ts` absence/lookalike/malformed regressions + `test/main-governance-required-workflow-exactness.test.ts` serialization-exactness regressions → `scripts/main-governance-audit.mjs` exact protected-main collector → `artifacts/governance/main-governance-audit.json` → issue #27 live governance closure.
