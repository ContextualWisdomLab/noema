# Commercial-readiness merge base-SHA authority

Status: Proposed
Date: 2026-09-23 KST

## Problem

#730 predecessor `35bbcb95c9e42d07c602ea100da7605f7c0f240d` re-read the pull request and re-evaluated all commercial merge evidence before issuing a normal merge request, but the final live-head guard checked only open state, `base.ref=main`, exact head SHA, and head repository. `fetchPullRequestSnapshot()` already read `pull.base.sha` to bind workflow evidence to the evaluated base, yet did not preserve that SHA in the returned snapshot. If protected `main` advanced after the fresh snapshot/evaluation and before the merge write, Noema could issue a merge request using evidence evaluated against the predecessor base.

GitHub's merge endpoint accepts the expected PR head SHA, not an expected base SHA. Therefore head-bound merge authority alone does not close this base-movement TOCTOU window.

## Constraints

- Preserve the existing SHA-bound normal merge method and all review/check/workflow authority.
- Do not lock, force-push, rebase, weaken gates, or infer a race merely from concurrent main movement.
- A main advance is normal repository activity; Noema must simply fail closed and re-evaluate against the new base.
- The guard must not acquire issue #27 control-plane authority or any provider, quarantine/security, outbound, or release authority.

## Alternatives

1. Rely only on the merge endpoint's `sha` parameter: rejected because it protects the PR head, not the evaluated base.
2. Compare `main` before the fresh snapshot only: rejected because the base can move after that comparison.
3. Re-read the live pull request immediately before the merge write and require its `base.sha` to equal the base SHA in the freshly evaluated snapshot: selected. This narrows the TOCTOU window while preserving GitHub as the final merge authority.

## Decision

RED `f1136e60fc5af83cec2bba378d010bb53ca1b18d` adds an executable source contract requiring `baseSha` in the snapshot, optional exact-base validation in `assertLiveHead()`, and a fresh-base guard immediately before the merge API call. Scope/direct-JSDoc REDs `1f0b4475996084d1558fd17fa1f0b6ff662b17b6` and `d30f75eab29918cfeb5f809f76d52f20711838ad` make the newly behaviorally changed guard part of the repository-owned production-docstring contract.

Production GREEN `f6ba3a2f0a94ba54f94101cda581d1f4fd3972d2` preserves `baseSha` in `fetchPullRequestSnapshot()`, extends `assertLiveHead()` with optional exact base-SHA validation, and re-reads the pull request after fresh evaluation and immediately before constructing/sending the normal merge request. A changed base throws instead of merging with stale-base evidence.

The docstring authority record advances from the predecessor 37-function contract to a 38-function contract: hourly 20, evaluator 9, governance 9. `assertLiveHead()` is the new hourly authority-bearing function because this repair changes its merge-write admission semantics.

## Evidence and traceability

- Independent current-head review finding on predecessor `35bbcb95c9e42d07c602ea100da7605f7c0f240d`: merge-write base SHA TOCTOU.
- RED: `f1136e60fc5af83cec2bba378d010bb53ca1b18d`.
- Production-docstring scope RED: `1f0b4475996084d1558fd17fa1f0b6ff662b17b6`.
- Direct JSDoc RED: `d30f75eab29918cfeb5f809f76d52f20711838ad`.
- Production GREEN: `f6ba3a2f0a94ba54f94101cda581d1f4fd3972d2`.
- Docstring authority convergence: `d2aa857c3ab37d0a7f111011bc100fdd7c60427e`.
- GitHub REST authority: Pull Requests expose `base.sha` and `head.sha`; merge requests can be head-SHA bound. Noema treats the live pull-request representation as the base identity source and GitHub's merge response as the final write result.

## Risk and follow-up

The final live read and the merge request are two network operations, so client-side code cannot make them atomic. This repair deliberately fails closed on observed base movement and relies on GitHub to reject writes that cease to satisfy server-side mergeability. Hosted current-head gates and a new independent exact-head review remain mandatory after this source mutation.
