# Runtime readiness workflow-filename authority repair

## Problem

Fresh independent review of PR #727 restacked exact `9f8f6031a4477c2f5fcb31367c6d8a517ae64e13` initially identified a possible workflow-filename trust-grammar widening. The first repair misread the protected predecessor pattern by treating `{1,100}` as a limit on the complete filename. Exact-head re-review of `52494add6a21865864fecc45558bf957634179f0` corrected that interpretation: the protected pattern `[A-Za-z0-9_.-]{1,100}\.ya?ml` limits the **basename** to 100 characters, then appends a four-character `.yml` or five-character `.yaml` extension.

Therefore a 100-character basename plus `.yml` (104 complete characters) and plus `.yaml` (105 complete characters) are protected-baseline-valid. A 101-character basename is invalid for either extension. The temporary 100-character complete-file ceiling was an accidental narrowing of trusted workflow authority.

## Constraint

The Semgrep repair must remove dynamic regular-expression construction without widening or narrowing the previously protected workflow-identity language. One-character through 100-character basenames and both `.yml` / `.yaml` extensions remain valid. Ref syntax and immutable-SHA coherence are separate invariants and are unchanged.

## Decision

Keep structural parsing. Permit a complete workflow filename up to 105 characters so a 100-character `.yaml` basename can survive the early bound, then enforce the authoritative `workflowName.length <= 100` basename ceiling after stripping `.yml` or `.yaml`. The existing character-set and extension checks remain unchanged.

Executable boundary cases preserve both sides of the protected contract:

- 100-character basename + `.yml` = 104 complete characters: accepted.
- 100-character basename + `.yaml` = 105 complete characters: accepted.
- 101-character basename + `.yml` = 105 complete characters: rejected by the basename invariant.
- 101-character basename + `.yaml` = 106 complete characters: rejected.

## Alternatives rejected

- Restoring the dynamic regular expression: rejected because the PR intentionally removes scanner-identified dynamic-regex construction and structural parsing is clearer.
- Limiting the complete filename to 100 characters: rejected because it incorrectly narrows the protected baseline and excludes valid 96–100-character basenames depending on extension.
- Removing the complete-file bound entirely: rejected because the 105-character pre-bound is a cheap fail-closed guard while the exact 100-character basename check remains canonical.
- Treating GitHub filesystem limits as the contract: rejected because this lane must preserve Noema's protected trust grammar, not infer a broader external maximum.

## Evidence lineage

- Restacked reviewed predecessor: `9f8f6031a4477c2f5fcb31367c6d8a517ae64e13`.
- Initial interpretation RED `ed32472ef5e91624d7d71bc2caf06d32a73f773c` → GREEN `5c595f70298b00ca01ecb35d93ddb08884f650e2` narrowed complete filename length to 100; exact-head independent review showed this did not preserve the protected pattern.
- Corrective RED `1cdc3ef24b54c48e63d13591318cf5640ff5eb17` adds acceptance for 100-character basenames with both extensions and rejection for 101-character basenames.
- Corrective GREEN `13daa3177532ff10aaefdd3a2bc5541ade7987bc` restores the 105-character complete-file pre-bound while retaining the 100-character basename invariant and updates the production rationale accordingly.

The incorrect intermediate commits remain auditable ancestors; they are explicitly superseded by the corrective RED/GREEN pair rather than hidden by rebase or force-push. Current-head hosted checks and a fresh independent review remain separate merge authority.

## TRACEABILITY

The authoritative behavioral baseline is protected Noema's historical workflow-name grammar `[A-Za-z0-9_.-]{1,100}\.ya?ml`, where `{1,100}` applies to the basename. GitHub reusable-workflow syntax requires a workflow file under `.github/workflows` referenced as `{owner}/{repo}/.github/workflows/{filename}@{ref}`. The one-to-100-character basename invariant here is Noema's preserved admission contract, not a claim about GitHub's global maximum filename length.
