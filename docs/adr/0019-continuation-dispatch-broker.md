# ADR 0019: Continuation dispatch broker

Status: Proposed

## Problem and constraints

GitHub repository dispatch requires `Contents: write`; a consumer-visible “dispatch-only” installation token is therefore not least privilege. Noema/Strix continuations must cross from an exact source PR to `ContextualWisdomLab/.github` without exposing that mutation authority. Mutable refs, stale PR snapshots, replay, caller-selected events, duplicate effects, and uncertain network results must fail closed.

## Decision

Noema owns `POST /v1/continuation-dispatches`. It authenticates GitHub Actions OIDC, binds repository plus immutable reusable-workflow SHA, rereads the live PR, reserves a canonical RFC 8785 request digest in identity-scoped SQLite Durable Object state, and uses a distinct central App only for one fixed repository-dispatch path/event mapping. It commits accepted, denied, or indeterminate as terminal before returning an Ed25519-signed credential-free receipt. Exact replay returns retained evidence without another dispatch.

The existing `/exchange` remains independent. `.github` owns the consumer workflow and event handler; Noema owns identity, idempotency, fixed dispatch, and receipt evidence only. Model verdict, formal review, merge, release, deployment, and product-domain truth remain separate authorities.

## Alternatives rejected

- Return a central installation token: rejected because `Contents: write` enables broader mutations.
- Consumer PAT/App secret: rejected for long-lived and cross-repository blast radius.
- Caller-selected target URL/event: rejected as an authority and SSRF boundary violation.
- Automatic retry after timeout/5xx: rejected because the external effect may already exist.
- Extend `/exchange`: rejected because credential delivery and fixed server-side dispatch have different response/idempotency contracts.

## Effects and operational scenes

Operators manage separate source and central Apps, an Ed25519 signing key/key id, and `NOEMA_CONTINUATION_DISPATCH_STATE`. Key loss, Durable Object unavailability, stale PR evidence, or GitHub ambiguity blocks dispatch. Denied/indeterminate receipts require reconciliation rather than blind retry. Public verification keys remain available by immutable release/key id; private material never appears in receipts or logs.

## Acceptance and release order

This ADR stays Proposed until exact-head tests/security/SBOM/provenance, independent review, protected integration, immutable Noema release, and deployment/recovery evidence exist. The immutable Noema release must be published before `ContextualWisdomLab/.github#2540` pins the endpoint/schema and removes its legacy exchange-plus-local-dispatch sequence. A real same-head continuation and fresh model verdict are downstream acceptance.

## References

Cloudflare. (2026). *Web Crypto*. Cloudflare Workers documentation.

GitHub. (2026). *Configuring OpenID Connect in cloud providers*; *Create a repository dispatch event*. GitHub Docs.

Rundgren, A., Jordan, B., & Erdtman, S. (2020). JSON Canonicalization Scheme (JCS) (RFC 8785). RFC Editor. https://doi.org/10.17487/RFC8785
