# Commercial-readiness hosted RED test-contract repair

Status: Proposed
Date: 2026-09-23 KST

## Problem

#730 predecessor `b6cb069ffb8c498a9d096f5209f5d0ac93400ce6` reached real GitHub-hosted execution in application CI run `35779283732`. The release-test step failed three tests while 5,236 of 5,239 tests passed. All three failures were inconsistencies in executable test contracts around already fail-closed production behavior, not evidence that merge authority should be broadened.

1. `commercial-readiness-noema-decision-authority` expected whitespace-padded `" approve "` to return `blocked`. Production correctly treats that token as absent exact authority, adds `noema_current_head_approval_missing`, and returns `request_review` when no independent blocker exists. Upper/mixed-case non-empty tokens remain explicit non-canonical decisions and are `blocked` as `noema_current_head_rejected`.
2. `hourly-commercial-readiness-script` attempted to test same-suite retry selection without the `started_at`/`completed_at` evidence that the production chronology guard deliberately requires. The fixture therefore exercised the fail-closed missing-chronology branch instead of retry selection.
3. `commercial-readiness-production-docstrings` rejected `checkRunChronologicalOrder()` even though its direct JSDoc states the non-obvious contract: GitHub timestamp semantics order retries and unknown chronology is rejected instead of invented. The detector vocabulary recognized `fail` but not the equivalent explicit fail-closed verb `reject`.

## Constraints

- Preserve exact Noema decision-token authority and the distinction between missing approval and explicit rejection.
- Preserve fail-closed check-run chronology; do not infer retry order from opaque check-run ids when temporal evidence is absent.
- Preserve the 38-function direct-JSDoc coverage gate and require substantive authority/fail-closed contract language.
- Do not change production merge admission, workflow provenance, provider routing, foreign owner authority, runner selection, or required checks to make CI green.
- Do not rerun the failed predecessor as a substitute for a source repair; every repair must produce fresh exact-head evidence.

## Alternatives

1. Change production so whitespace-padded approval is a hard blocker: rejected. The evaluator intentionally distinguishes “no exact current-head approval exists” from “a current-head non-approve decision exists”; only the former is review-dispatchable.
2. Remove the retry chronology guard or fall back to check-run id: rejected. That recreates synthesized chronology and can promote stale success.
3. Add arbitrary timestamps only to the old fixture: rejected as incomplete edge coverage. The repair also keeps a hostile missing-chronology case that must fail closed.
4. Rewrite a substantive production JSDoc solely to satisfy a narrow keyword heuristic: rejected. The existing JSDoc already states the contract. The detector should recognize the explicit `reject` fail-closed verb just as it recognizes `fail`.
5. Relax or skip the failing tests: rejected. The tests remain active and are corrected to assert the intended authority semantics.

## Decision

- `2a16e12a8a785d5b136f62aac8e9d679fd8e4899` splits decision-token expectations: `APPROVE`/`Approve` remain explicit rejection and `blocked`; whitespace-padded approval remains non-authority and therefore `request_review` with `noema_current_head_approval_missing` when no other blocker exists.
- `9028a009fe507c65db0fd45277a15a1180521021` supplies realistic temporal evidence to the retry-selection fixture and adds a separate regression proving missing chronology still throws before stale-success selection.
- `997794f0b1627b8dafc31dd7fe0d372c03c185f3` teaches the direct-JSDoc detector that the explicit verb `reject` expresses the same fail-closed contract class already represented by `fail`. It does not reduce the requirement for a direct JSDoc block or for substantive authority/fail-closed language.

## Evidence and TRACEABILITY

Hosted RED: application CI `35779283732`, exact predecessor `b6cb069ffb8c498a9d096f5209f5d0ac93400ce6`, verify job `106920315714`, release-test step. The job used an assigned GitHub-hosted runner and completed checkout, Node/npm setup, lockfile control, install and typecheck before the three test failures. This supersedes the earlier queued/unassigned observation for that predecessor.

Relevant owner contracts are repository-local production source in `scripts/hourly-commercial-readiness.mjs` and `scripts/lib/commercial-readiness-loop.mjs`, plus the executable tests named above. GitHub review/workflow/control-plane authority remains in the existing owner paths and issues; this test-contract repair does not acquire those responsibilities.

## Risk and follow-up

The repair is not GREEN until fresh hosted runs on the final exact head complete successfully. A fresh independent current-head review is also required before any Ready/merge transition. If the repaired tests reveal a new production defect, that defect must be treated as a new RED rather than weakening the gate. #729 remains downstream documentation authority and should ordinary-forward to this successor only after the #730 exact stabilizes.