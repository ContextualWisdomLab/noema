# Commercial readiness Commit Status order authority

Date: 2026-09-23
Owner: Noema repository-governance admission boundary
Status: Proposed

## Problem

Noema reads `GET /repos/{owner}/{repo}/commits/{ref}/statuses` through complete pagination and then projects one latest observation per exact Commit Status context. GitHub documents that this endpoint already returns statuses in reverse chronological order and that the first status is the latest observation.

The predecessor `latestStatuses()` ignored that owner-provided ordering and re-sorted the response by locally parsed `created_at`, with missing or invalid timestamps coerced to epoch zero and numeric status id used as a secondary ordering. A later failing status whose timestamp was absent or unparsable could therefore be moved behind an earlier successful status for the same context. The projection would retain the stale success and could remove a real blocker before terminal merge-authority evaluation.

## Constraints

- Commit Status context and state remain exact API identities; no trim or case normalization is introduced.
- Noema does not invent status chronology from timestamp or id fields when GitHub already supplies the endpoint ordering contract.
- Required Check Run authority, review authority, workflow provenance, provider/model routing, quarantine/security runtime, outbound authority, release authority, and product-domain truth are unchanged.
- Pagination completeness remains owned by `paginatedArray()`; this change only removes a second, conflicting chronology model after complete retrieval.

## Decision

`latestStatuses()` consumes the fully paginated REST result in the order GitHub returns it. The first observation for each exact non-empty context wins. The final projected contexts may still be sorted for deterministic reporting because that presentation sort happens only after latest-observation selection and cannot change per-context authority.

Locally sorting raw status observations by `created_at` or numeric id is rejected. Missing or malformed timestamp metadata must not demote a later owner-ordered blocker or promote an older success.

## Executable evidence

RED `9c8dd6cf6d725657e569eeb94ca338e5f0c9df08` adds `test/commercial-readiness-status-order-authority.test.ts`. The hostile fixture is already in GitHub REST reverse-chronological order: a latest `failure` without `created_at` followed by an earlier timestamped `success` for the same context. The predecessor projection re-sorted those observations and selected the stale success, so the contract fails on predecessor source.

GREEN `ca600f85ac73a6a3a69198fd3aedd22a5e564f98` removes synthesized timestamp/id ordering and selects the first exact context observation from the complete REST sequence. No other executable production statement changes.

## Risk and follow-up

This repair relies on GitHub's documented endpoint-order contract. If Noema later changes the upstream endpoint or combines status observations from multiple independently ordered sources, that adapter must establish a new explicit chronology contract rather than reusing this assumption. Current-head hosted tests and independent review remain separate merge evidence.

## Traceability

GitHub. (2026). *REST API endpoints for commit statuses: List commit statuses for a reference*. GitHub Docs. https://docs.github.com/en/rest/commits/statuses
