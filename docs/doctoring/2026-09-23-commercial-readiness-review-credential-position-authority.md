# Commercial readiness — Noema reviewer credential position authority

Status: Proposed

## Problem

`parseNoemaReviewDecision()` previously treated `Reviewer credential: `noema-github-app`` as authoritative whenever the exact text appeared anywhere in a trusted bot review body. The Noema publisher, however, owns a specific tail serialization: it appends the reviewer credential line immediately before the canonical `noema-review-gate` marker after model-controlled summary/finding prose. An earlier occurrence in prose could therefore mask a missing or wrong publisher credential and let an otherwise canonical exact-head `APPROVED` review become merge authority.

## Constraints

- GitHub review `user.login`, `user.type`, `commit_id`, `state`, REST list order, and the canonical Noema marker remain independent authority gates.
- Noema must not infer model intent or normalize credential/marker identity.
- A later malformed credentialed gate must continue to revoke older Noema approval instead of falling back to it.
- This lane does not acquire reviewer-App eligibility/configuration truth from issue #29, release authority, provider routing, quarantine/security, outbound, or foreign product-domain truth.
- The publisher emits literal `- Reviewer credential: `noema-github-app`` followed by one blank line and then the canonical marker. A bare `Reviewer credential: `noema-github-app`` line without the Markdown list prefix is noncanonical and must be rejected even when it appears immediately before the marker.

## Alternatives

1. Keep `body.includes(...)`. Rejected because occurrence is not provenance; model-controlled prose can contain the same bytes.
2. Remove the credential gate and trust bot login alone. Rejected because that weakens the existing independent gate and crosses the reviewer-eligibility owner boundary instead of preserving it.
3. Require the exact credential serialization at the publisher-owned marker boundary while preserving all other gates. Selected because it closes the masking false PASS with the smallest consumer-side change and keeps malformed successors fail closed.

## Decision

The merge-admission parser now distinguishes credential occurrence from credential authority. Any credential occurrence or marker-like envelope still enters the revocation path, but approval authority is created only when the unique canonical marker is immediately preceded by the publisher's literal bullet credential line and one blank line. Earlier prose occurrences, a bare marker-adjacent credential line, or a different marker-adjacent credential cannot satisfy the gate.

## Executable evidence

- RED `79e1410a75560d0be73d47294f1b4c6e73fbc9b2` adds a canonical publisher-shaped approval plus two hostile cases: an exact credential echoed only in prose, and an earlier exact credential masking a wrong publisher credential.
- Production repair `1ddae7cf51d003570d0573f1666791805f655ba4` binds credential authority to the marker-adjacent suffix. RED → repair is one ordinary-forward commit changing only `scripts/hourly-commercial-readiness.mjs` by `+9/-3`.
- RED `1a9b00e0fc28dcdbd4a66d527539ed082578c221` then proves that a bare exact credential immediately before the marker must not acquire authority; production repair `d303a9ede76452b3f99c3abbef1d27a2e3993809` removes that alternate serialization.
- Current-head review found the reviewer-login success fixture still serialized the now-rejected bare form. Test-contract repair `0fc9745190b34155831dc0b8e29415f0c79df974` changes that positive fixture to the exact publisher bullet + blank-line serialization without changing production authority.
- Hosted current-head terminal GREEN and formal current-head Noema review remain separate merge evidence and are not asserted by this decision record.

## TRACEABILITY

Primary repository evidence is the Noema publisher contract in `reviewer/noema_reviewer/github_io.py`: `render_review_body()` appends the literal bullet reviewer credential, one blank line, and the canonical gate marker after verdict-controlled content; `publish_verdict()` submits that body with the exact `commit_id`. The consumer remains additionally bound to GitHub review identity/state/current-head authority.

## Residual risk and follow-up

The body credential is an application protocol marker, not a replacement for GitHub App identity. Reviewer App identity and eligibility remain with their existing owner. Future publisher serialization changes must update the consumer contract and focused hostile fixtures together; merge admission must fail closed rather than accepting a relocated credential by normalization or substring search.
