# Runtime readiness workflow-filename authority repair

## Problem

Fresh independent review of PR #727 exact `9f8f6031a4477c2f5fcb31367c6d8a517ae64e13` found that the structural replacement for the historical reusable-workflow regular expression widened one trust-boundary invariant. Protected predecessor grammar admitted a complete workflow filename, including `.yml` or `.yaml`, within 100 characters. The structural parser instead allowed the complete filename to reach 105 characters and separately limited only the basename to 100 characters.

That admits values the prior trust contract rejected, including a 97-character basename plus `.yml` and a 96-character basename plus `.yaml`. Because `ALLOWED_WORKFLOW_REF_PREFIX` participates in reusable-workflow credential-exchange authority, this is a security-boundary compatibility defect rather than a cosmetic naming difference.

## Constraint

The Semgrep repair must remove dynamic regular-expression construction without widening the previously protected workflow-identity language. One-character workflow basenames and both `.yml` / `.yaml` extensions remain valid. Ref syntax and immutable-SHA coherence are separate invariants and are unchanged.

## Decision

Keep structural parsing, but apply the historical 100-character ceiling to the complete workflow filename before stripping its extension. The existing character-set and extension checks remain unchanged.

Executable boundary cases preserve both sides of the contract:

- 96-character basename + `.yml` = 100 characters: accepted.
- 95-character basename + `.yaml` = 100 characters: accepted.
- 97-character basename + `.yml` = 101 characters: rejected.
- 96-character basename + `.yaml` = 101 characters: rejected.

## Alternatives rejected

- Restoring the dynamic regular expression: rejected because the PR intentionally removes scanner-identified dynamic-regex construction and structural parsing is clearer.
- Keeping a 100-character basename limit: rejected because it widens the trusted identity grammar by four or five characters depending on extension.
- Reducing every basename to 95 characters: rejected because it would unnecessarily reject historically valid 96-character `.yml` names.

## Evidence lineage

- Reviewed predecessor: `9f8f6031a4477c2f5fcb31367c6d8a517ae64e13`.
- RED: `ed32472ef5e91624d7d71bc2caf06d32a73f773c` adds exact 100/101-character `.yml` and `.yaml` boundary cases.
- GREEN: `5c595f70298b00ca01ecb35d93ddb08884f650e2` changes only the complete workflow filename ceiling from 105 to 100 characters in production.

Current-head hosted checks and an independent re-review remain separate merge authority; predecessor review is repair input only.

## TRACEABILITY

The authoritative behavioral baseline is the protected predecessor implementation’s complete-filename grammar `[A-Za-z0-9_.-]{1,100}\\.ya?ml`, together with the current Noema runtime-readiness trust boundary. GitHub reusable-workflow syntax still requires a workflow file under `.github/workflows` referenced as `{owner}/{repo}/.github/workflows/{filename}@{ref}`; the 100-character ceiling is Noema’s preserved admission invariant, not a claim about GitHub’s global maximum filename length.
