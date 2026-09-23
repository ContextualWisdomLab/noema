# Commercial readiness — Noema reviewer credential position authority

Status: Proposed

## Problem

`parseNoemaReviewDecision()` previously treated `Reviewer credential: `noema-github-app`` as authoritative whenever the exact text appeared anywhere in a trusted bot review body. The Noema publisher, however, owns a specific tail serialization: it appends the reviewer credential line immediately before the canonical `noema-review-gate` marker after model-controlled summary/finding prose. An earlier occurrence in prose could therefore mask a missing or wrong publisher credential and let an otherwise canonical exact-head `APPROVED` review become merge authority.

## Constraints

- GitHub review `user.login`, `user.type`, `commit_id`, `state`, REST list order, and the canonical Noema marker remain independent authority gates.
- Noema must not infer model intent or normalize credential/marker identity.
- A later malformed credentialed gate must continue to revoke older Noema approval instead of falling back to it.
- This lane does not acquire reviewer-App eligibility/configuration truth from issue #29, release authority, provider routing, quarantine/security, outbound, or foreign product-domain truth.
- The publisher currently emits `- Reviewer credential: `noema-github-app`` followed by one blank line and then the canonical marker. Existing focused fixtures also use the same exact credential line without the Markdown list prefix; both forms remain accepted only when directly adjacent to the canonical marker boundary.

## Alternatives

1. Keep `body.includes(...)`. Rejected because occurrence is not provenance; model-controlled prose can contain the same bytes.
2. Remove the credential gate and trust bot login alone. Rejected because that weakens the existing independent gate and crosses the reviewer-eligibility owner boundary instead of preserving it.
3. Require the exact credential serialization at the publisher-owned marker boundary while preserving all other gates. Selected because it closes the masking false PASS with the smallest consumer-side change and keeps malformed successors fail closed.

## Decision

The merge-admission parser now distinguishes credential occurrence from credential authority. Any credential occurrence or marker-like envelope still enters the revocation path, but approval authority is created only when the unique canonical marker is immediately preceded by an accepted exact credential-line serialization. Earlier prose occurrences cannot satisfy the gate, and an earlier exact credential cannot mask a different credential immediately before the marker.

## Executable evidence

- RED `79e1410a75560d0be73d47294f1b4c6e73fbc9b2` adds a canonical publisher-shaped approval plus two hostile cases: an exact credential echoed only in prose, and an earlier exact credential masking a wrong publisher credential.
- Production repair `1ddae7cf51d003570d0573f1666791805f655ba4` binds credential authority to the marker-adjacent suffix. RED → repair is one ordinary-forward commit changing only `scripts/hourly-commercial-readiness.mjs` by `+9/-3`.
- Hosted current-head terminal GREEN and formal current-head Noema review remain separate merge evidence and are not asserted by this decision record.

## TRACEABILITY

Primary repository evidence is the Noema publisher contract in `reviewer/noema_reviewer/github_io.py`: `render_review_body()` appends the reviewer credential and canonical gate marker after verdict-controlled content, and `publish_verdict()` submits that body with the exact `commit_id`. The consumer remains additionally bound to GitHub review identity/state/current-head authority.

## Residual risk and follow-up

The body credential is an application protocol marker, not a replacement for GitHub App identity. Reviewer App identity and eligibility remain with their existing owner. Future publisher serialization changes must update the consumer contract and focused hostile fixtures together; merge admission must fail closed rather than accepting a relocated credential by normalization or substring search.
