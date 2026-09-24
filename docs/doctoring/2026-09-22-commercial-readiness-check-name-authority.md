# Commercial readiness: exact check-name authority

Date: 2026-09-22 KST
Owner: Noema commercial-readiness admission boundary
Status: Proposed source repair; hosted exact-head verification and independent review remain required.

## Problem

The commercial-readiness collector and decision engine already bind required check evidence to current PR/head/base workflow provenance, but the final decision layer still normalized check names with `trim()` before matching the six mandatory contexts. A trusted GitHub Actions check named `" verify "` could therefore be upgraded into the canonical `verify` authority even though GitHub supplied a different check identity.

That is inconsistent with the repository's existing governance rule: authority-bearing API identities are compared exactly and malformed serialization must fail closed rather than be normalized into permission to merge.

## Constraints

- Keep status and conclusion normalization for enum-like presentation values; the defect is check-name identity only.
- Preserve the existing GitHub Actions producer and workflow-provenance controls.
- Do not weaken required checks, independent review, central Security Scan, exact-head/base binding, or normal-merge admission.
- Do not acquire live ruleset or organization workflow ownership in this lane.

## Decision

Required and review-dependent check names are now matched using the exact string supplied by GitHub. Whitespace-altered or otherwise differently serialized names do not satisfy a required context. The malformed check remains observable, but the canonical required check is reported missing, so merge authority fails closed.

RED `addd436ee95e93dbf8d75bb53219bfaee6217ebf` adds an executable hostile case that replaces canonical `verify` with `" verify "` in an otherwise merge-ready snapshot and requires `required_check_missing`. The predecessor decision code trims the name and would return `merge` for that shape.

GREEN `45841d6156a06c73b4dfaccf60338c6ce4ce7aa5` introduces `exactCheckName()` and uses it for required producer matching, required-check presence, and observed/review-dependent check classification. Status/conclusion handling is unchanged.

## Alternatives rejected

**Continue trimming names because GitHub normally emits canonical strings.** Rejected because merge authority must remain exact even when upstream data is malformed or spoofed.

**Reject every unknown check name before evaluating required checks.** Rejected because additional checks are intentionally observed and may carry useful evidence; only required-name authority needs exact identity.

**Normalize at the collector and remember the original separately.** Rejected because this preserves two competing identities and makes it easier for later code to accidentally consume the normalized form as authority.

## Risks and follow-up

The stricter contract can create a false negative if GitHub unexpectedly changes a required check's serialized name. That is the intended failure mode: update the canonical contract explicitly rather than normalize a changed authority into an existing one.

The collector still records workflow provenance independently. A subsequent review may tighten its presentation of malformed required-name lookalikes, but this repair closes the merge false-PASS because the final decision no longer promotes those names into mandatory check authority.

## TRACEABILITY

GitHub. (2026). *REST API endpoints for check runs*. GitHub Docs. https://docs.github.com/en/rest/checks/runs

`AGENTS.md` exact-head central Security Scan contract → `scripts/hourly-commercial-readiness.mjs` workflow provenance → `scripts/lib/commercial-readiness-loop.mjs` exact required check-name decision → `test/commercial-readiness-check-name-authority.test.ts` hostile whitespace identity → protected-main merge authority after independent review and terminal hosted GREEN.
