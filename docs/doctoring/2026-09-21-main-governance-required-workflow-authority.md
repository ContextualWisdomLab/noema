# Main governance required-workflow authority

Date: 2026-09-21
Owner: Noema repository-governance admission boundary
Status: Proposed source repair; live policy closure remains issue #27

## Problem

`evaluateMainGovernanceRules()` already retained `workflows` rules in `observed_controls.required_workflows`, but a workflow was observation only. A rule set containing the target pull-request, required-status, non-fast-forward, and deletion controls could therefore return `PASS` after the organization-owned central Security Scan required-workflow rule had been removed or repointed.

That is inconsistent with the repository contract in `AGENTS.md`: the central Security Scan required workflow is a mandatory merge gate, and absent or stale Security Scan evidence is non-passing. A governance audit that can pass after removal of that workflow is not a fail-closed admission control.

Subsequent reviews exposed the same authority-admission class at narrower boundaries. Workflow owner/path/ref/type values and later the general rule selector/status-context matcher could acquire canonical authority after `trim()`. A fourth review found that mandatory status contexts accepted **any positive** `integration_id`; a lookalike producer could therefore satisfy a required context despite not being GitHub Actions. Control-plane identifiers and producer identities are authority, not presentation data.

## Current external authority

Fresh GitHub ruleset evidence on 2026-09-21 reports active organization ruleset `18794436`, `CWL Noema central security scan`, targeting `~DEFAULT_BRANCH`. Its required workflow is:

- owner: organization `ContextualWisdomLab`;
- workflow repository id: `1274066402` (`ContextualWisdomLab/.github`);
- path: `.github/workflows/security-scan.yml`;
- ref: `refs/heads/main`.

The same live ruleset reports no bypass actors and `current_user_can_bypass: never`. This observation does not establish the stronger pull-request/status/non-fast-forward/deletion target policy tracked by issue #27, and it is not evergreen authority. The active-rules endpoint must still be refetched before a merge decision.

Fresh current-repository check-run evidence on 2026-09-21 identifies the producer of the GitHub Actions jobs as App id `15368`, slug `github-actions`, name `GitHub Actions`, owner `github`. The audit therefore uses `15368` as the exact producer identity for each mandatory required-status context. This is evidence about the producer used by the repository's Actions checks; it does not turn a workflow result into merge authority unless the rest of the governance and exact-head gates also pass.

GitHub's current REST documentation states that `GET /repos/{owner}/{repo}/rules/branches/{branch}` returns all active rules applying to the branch, including organization-level rules, and excludes disabled/evaluate-only rules. For a `workflows` rule, GitHub exposes the workflow `repository_id`, `path`, and optional `ref`/`sha`. Required status-check rules expose the producer `integration_id`, allowing source identity to be bound instead of accepting an arbitrary positive integer.

Primary references:

GitHub. (2026). *REST API endpoints for rules*. GitHub Docs. https://docs.github.com/en/rest/repos/rules

GitHub. (2026). *REST API endpoints for check runs*. GitHub Docs. https://docs.github.com/en/rest/checks/runs

## Decision

The audit requires one observed effective workflow to match all of these stable authority fields:

- `ruleset_source_type === "Organization"`;
- `ruleset_source === "ContextualWisdomLab"`;
- `repository_id === 1274066402`;
- `path === ".github/workflows/security-scan.yml"`;
- `ref === "refs/heads/main"`.

Authority-bearing strings are compared exactly. This exactness applies to required-workflow owner/path/ref fields, governance rule types (`pull_request`, `required_status_checks`, `non_fast_forward`, `deletion`, `workflows`) and the six mandatory required-status contexts. Leading or trailing whitespace, or another serialization that becomes canonical only after trimming, is malformed evidence and fails closed. Human-facing normalization is not authority normalization.

Each mandatory status context must also have `integration_id === 15368`. Positivity only proves that some App/integration produced the status; it does not prove the required GitHub Actions producer. Additional non-mandatory contexts remain outside this exact producer contract.

The numeric ruleset id is deliberately not a pass condition. Recreating an organization ruleset can legitimately change the ruleset id while preserving the authority owner and immutable workflow repository identity. The numeric id remains evidence, not the stable contract.

## Alternatives rejected

**Accept any `workflows` rule.** Rejected because a repository-owned lookalike or unrelated required workflow could satisfy the audit.

**Match path only.** Rejected because the same relative path in another repository is different authority.

**Normalize authority strings before comparison.** Rejected because trimming malformed source/path/ref/type/context values can transform non-canonical evidence into canonical authority and create a false PASS. Exact API identity fields are not display text.

**Accept any positive status `integration_id`.** Rejected because a different GitHub App can have a valid positive integration id while being the wrong producer for the required check. Producer pinning must identify GitHub Actions itself.

**Pin ruleset id `18794436`.** Rejected because ruleset recreation would cause an unnecessary source change even when the owner and workflow authority are unchanged.

**Pin a workflow SHA in Noema.** Rejected at this boundary because the current organization rule is branch-ref based. Noema must not silently invent a stronger owner contract than the live organization-owned rule. If the canonical owner changes to SHA pinning, the owner rule and Noema admission contract should change together.

## Executable evidence

RED `e28d2bd38f92bb394daba179d3c1d38b1e2a93d5` adds a regression showing that the protected evaluator accepted an otherwise-compliant rule set with the required workflow absent.

The protected production blob used for the focused reproduction is `d5031ea4e22221e8db39f29e0c1c55dec3b01156`. A byte-identical reconstruction verified by Git blob hash returns `PASS` for the no-workflow case.

GREEN begins at `9ef38f3cd0047d660de8d6e3fa4a4d39561f28bb`: the evaluator adds `required_security_workflow_missing` and matches the organization owner plus workflow repository/path/ref. The repaired production blob `e4d72a2bcb7c697b907402eecbff16d28e1c0f6c` returns `FAIL` for missing or wrong-path authority and `PASS` when the canonical workflow is present.

A second review found that `observedWorkflowControls()` still passed authority-bearing strings through `trim()`. That made values such as `" .github/workflows/security-scan.yml"`, `"Organization "`, or `" workflows "` equivalent to their canonical spellings. RED `56706017205703eec0b4eeda6224229b7496f39e` adds focused whitespace-altered path/ref/source/type regressions. GREEN `0320f9788916524f1f949d467ddaad988f547a89` adds exact authority-string admission and requires an exact `workflows` rule type before observations are eligible.

A third review found the same false-PASS still present in the general `rulesOfType()` selector and required-status context matcher. RED `05baac00ac5173feb87cbec832189afc344437d1` adds hostile rule-type cases for `pull_request`, `required_status_checks`, `non_fast_forward`, and `deletion`, plus a mandatory `verify` context that is canonical only after trimming. The predecessor source at that exact still used `normalized(rule?.type)` and `normalized(entry?.context)`, so those malformed strings were admitted as canonical authority. GREEN `499803dcbeb205102e0817e25da7db2660a96fde` removes that normalization from authority decisions and documents every owned production function. Cleanup `c19f54a4e9c8842732c727f1441a0bfd86c12587` consolidates exactness tests under one authority-focused file; `835426ecb57528e6496bf135c9ee6429104d0849` documents the non-obvious hostile-fixture boundaries.

A fourth review found that the evaluator still treated `positiveInteger(entry.integration_id)` as sufficient producer authority. RED `9f4d62e16adad4d2c290cd2c85ad3b3d27ccb9d1` changes the exactness fixture to canonical GitHub Actions id `15368` and adds a hostile mandatory `verify` entry pinned to `99999`; the predecessor evaluator cannot emit the expected `required_status_source_mismatch`. Production repair `05dc9e0b3ed066bc1a105c0865a0cc3f8d08b074` introduces `REQUIRED_MAIN_CHECK_INTEGRATION_ID = 15368` and requires exact producer equality for each mandatory context. Fixture-alignment commits `154ca48af54debaeb72f625000f558c9d965e235`, `b7b012f9341afd573a421c613c7c9e40973c5124`, and `873f35c8229a7801009ca3157507de23c9576426` consume that canonical producer identity instead of manufacturing distinct positive ids.

The independent exact-head review of `aec39500c37a763bc8e488c8600948e2ffa40114` then found one P1 successor defect: four passing maintainer/reviewer readiness fixtures still generated `15_368 + index`. Only `verify` therefore retained the canonical producer while the other five required contexts failed `required_status_source_mismatch`, invalidating those PASS fixtures. Repairs `a2bb143a3d96835e5217591ea387cc42361a5ff0`, `f60a9a79ef22a9f8cde8a08179e56a32f7bf9205`, `5a34d9e268157157d325b03093db10ef4738d9c9`, and `fa7eb7ab8f17427f8b9895aa20a78913df28cf42` update `maintainer-app-governance-binding`, `maintainer-app-readiness`, `reviewer-app-identity-binding`, and production-readiness coverage fixtures to import the same canonical integration constant. No separate test-local producer identity remains in those passing fixtures.

The broader repository suite and hosted current-head gates remain separate evidence classes. Source reasoning and independent review do not substitute for repository full-suite, hosted current-head CI, live target-policy configuration, merge, release, or deployment evidence.

## Risks and follow-up

Exact matching deliberately prefers false negatives when GitHub supplies malformed or unexpectedly normalized control-plane strings or an unexpected producer id. That is appropriate for admission evidence: unrecognized authority must not be upgraded into permission to merge.

The required workflow, exact-serialization, and producer-identity repairs do not make current live governance compliant. Issue #27 remains open until the desired pull-request, approval, stale-review, conversation-resolution, required-status, strict-latest-base, non-fast-forward, deletion, and break-glass controls have live operator evidence.

After this source repair reaches an exact reviewed head, required hosted checks must be terminal GREEN before normal merge. Once protected, the next read-only governance audit should demonstrate separately that the canonical central Security Scan workflow remains present, each mandatory status context is pinned to GitHub Actions, and the stronger target policy is either PASS or explicitly failed by individual evidence codes.

## TRACEABILITY

`AGENTS.md` mandatory central Security Scan/status gates → `scripts/lib/main-governance-audit.mjs` canonical required-workflow predicate + exact rule/status/producer admission → governance evaluator regressions + maintainer/reviewer readiness fixtures consuming the same producer constant → `scripts/main-governance-audit.mjs` exact protected-main collector → `artifacts/governance/main-governance-audit.json` → issue #27 live governance closure.
