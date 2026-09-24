# Commercial readiness review-guide mutation coverage

Status: Proposed  
Date: 2026-09-23 KST  
Scope: Noema commercial merge-admission operator-guide contract tests only

## Problem

The executable operator-guide contract at `8146360fc10ce23da50344d605138a4d783d77e5` proved swapped marker/state mappings and a missing blocking mapping, but it did not independently prove rejection when the `approve` → `APPROVED` mapping itself was removed. The guide and production predicate were already correct; the defect was incomplete hostile-case coverage.

## Constraints

- Do not change production review admission or the operator guide when their current behavior/text is already correct.
- Keep review-state authority exact: `approve` → `APPROVED`; `request_changes` and `blocked` → `CHANGES_REQUESTED`.
- Do not convert owner review evidence into independent merge authority.

## RED

`c8d11a5e99368b902ef67bcad086f4a4337eb8ad` adds an executable coverage oracle requiring the focused guide test to contain an independent `missingApprovalMapping` mutation and a fail assertion. The predecessor test source does not satisfy that oracle.

## GREEN

`11a6f5929288e4fa4c9bcbd5ed65412edbcf69db` adds only the missing approval-mapping hostile mutation and its `false` assertion to `test/commercial-readiness-review-guide-head-binding.test.ts`. Production and guide content are unchanged.

## Decision

Keep both the swapped mutation and independent missing-approval / missing-blocking mutations. A single missing-direction mutation is insufficient evidence for a bidirectional marker/state contract because future edits can accidentally preserve one side while dropping the other.

Rejected alternatives:

- Treat the existing missing-blocking mutation as equivalent coverage: rejected because it does not exercise loss of the approval mapping.
- Change production or guide text: rejected because no behavior or documentation defect was found in those surfaces.

## Risk and follow-up

This repair strengthens test evidence only. It does not provide hosted-current-head GREEN, independent current-head review, protected-branch governance, or release evidence. Those remain separate merge/release gates.
