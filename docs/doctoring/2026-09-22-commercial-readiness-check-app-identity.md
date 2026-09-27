# Commercial readiness GitHub Actions App identity

## Problem

Noema's commercial readiness adapter already required canonical workflow provenance and the exact producer slug `github-actions`, but it discarded the immutable producer App identity exposed by each GitHub check run. A check with the canonical slug and expected workflow provenance but a non-canonical App id could therefore be projected into the same trusted `appSlug` value consumed by the final merge decision.

Fresh current-repository check-run evidence exposes GitHub Actions as App id `15368`, slug `github-actions`. Noema's existing main-governance owner contract already pins required status producers to `REQUIRED_MAIN_CHECK_INTEGRATION_ID = 15368`. The commercial path should consume that canonical owner identity rather than duplicate a second numeric constant or trust display slug alone.

## Constraint

This repair binds repository-side merge evidence only. It does not create or mutate organization rulesets, change workflow ownership, acquire provider-routing/security-runtime/outbound authority, or treat source validation as live control-plane completion.

## Alternatives considered

1. Keep slug-only producer admission. Rejected: slug is useful human-readable provenance but is not the strongest producer identity already available in the live check-run payload and Noema owner contract.
2. Duplicate `15368` inside the commercial adapter. Rejected: the same repository already owns that canonical integration identity in `main-governance-audit.mjs`; duplicating it creates drift risk.
3. Reuse `REQUIRED_MAIN_CHECK_INTEGRATION_ID` and fail closed before workflow provenance when a required check carries the canonical slug but another App id. Selected: this is the smallest owner-consistent repair and preserves the existing exact check-name, target PR/head/base, workflow-source and self-modification gates.

## RED → GREEN evidence

- RED `1192ec13c62178d658ac7a85f7aa3dd47e21bb4b` extends the focused workflow-provenance contract with a check carrying slug `github-actions` but App id `99999`; the predecessor adapter would return the trusted canonical slug.
- GREEN `e2b95b59454560a62c7da228c22b528129ef018f` imports the canonical Noema owner constant and returns `untrusted-producer` unless the exact App id is `15368` before admitting workflow provenance.
- Existing canonical cases now include the App id in their raw check fixture; no final-evaluator fixture is weakened or bypassed.

## Risk and follow-up

If GitHub changes the canonical GitHub Actions App identity, the main-governance owner contract and live primary evidence must move first. The commercial adapter intentionally fails closed rather than accepting a new id by slug normalization. This repair does not claim that the organization ruleset itself pins every commercial check; issue #27 remains the live governance/control-plane authority.

## TRACEABILITY

- GitHub REST API, Check Runs: current check-run payloads expose `app.id` and `app.slug` producer metadata.
- Noema `scripts/lib/main-governance-audit.mjs`: canonical `REQUIRED_MAIN_CHECK_INTEGRATION_ID = 15368` owner contract.
- Noema `scripts/hourly-commercial-readiness.mjs`: raw check-run projection into commercial merge evidence.
- Noema `test/commercial-readiness-workflow-provenance.test.ts`: executable App-id and workflow-provenance contract.
