# Verified OIDC replay claim before GitHub token mint

## Status and scope

Reviewed on 2026-08-09 for Draft PR #83. This record explains one security-ordering change in Noema's credential exchange. It does not grant merge, release, deployment, reviewer, or App-provisioning authority and it does not claim protected-main or production acceptance before the stacked PR is integrated and operationally verified.

## Problem

The previous production wrapper performed the distributed single-use OIDC replay claim only after the core exchange returned a successful GitHub installation token. The caller did not receive a token on replay, but a duplicate valid OIDC request could still reach the privileged GitHub App access-token creation endpoint before Noema's atomic replay guard rejected the duplicate.

Moving the claim all the way to the unverified JWT prefilter would create the opposite problem: an attacker could submit arbitrary unsigned payloads containing chosen `jti` values and poison the replay namespace before cryptographic authentication.

The security boundary therefore needs a precise middle point:

```text
untrusted compact JWT envelope
→ bounded payload prefilter
→ cryptographic GitHub OIDC verification
→ request/target authorization
→ atomic distributed replay claim
→ GitHub App privileged token creation
```

## Decision

For the production wrapper, the replay Durable Object binding must exist before the credential-bearing core is called. After the core verifies the GitHub Actions OIDC token and authorizes the requested target repository, it claims the verified `jti`/`exp` through the distributed replay guard. Only an accepted first-use claim may continue to GitHub App installation-token creation.

A replay conflict returns 401 `ERR_AUTH_REPLAY`; replay-state unavailability or missing verified replay claims returns 503. Neither path may reach the GitHub access-token creation endpoint.

The core remains independently testable without the production replay binding so its focused cryptographic/token-exchange tests do not need to impersonate the outer deployment topology. The production wrapper, however, fails closed when the binding is absent and requires a successful core response to carry internal evidence that replay was verified before mint. The existing post-success outer claim remains only as a defensive compatibility path for mocked/legacy core responses that lack that proof; the real production core is required to take the pre-mint path.

## Why verification precedes replay-state mutation

GitHub's Actions OIDC documentation describes the identity token as a signed JWT with claims that can be used to establish workflow and repository identity. Noema does not treat decoded payload JSON as authenticated merely because it is syntactically parseable. Replay state therefore cannot be reserved until the JWT's signature and relevant trust claims have passed the cryptographic verifier.

GitHub also documents `workflow_sha` and, for reusable workflows, `job_workflow_sha` as workflow-source commit identity claims. PR #71 separately binds the trusted workflow ref to the corresponding immutable workflow SHA; the replay change does not weaken or replace that source-identity check.

## Why the claim precedes token creation

The GitHub installation-token request is a privileged side effect: it asks GitHub to mint a repository-scoped capability derived from the App identity. Even if Noema later withholds that capability from the caller, repeatedly performing the privileged upstream mint for an already-consumed caller credential creates avoidable amplification and audit noise. The single-use decision therefore belongs before this side effect once the request is known to be authentic and authorized.

## Distributed state rationale

Replay prevention is a cross-isolate coordination problem. Cloudflare Durable Objects provide a single-threaded coordination point with strongly consistent storage for an object, and their SQLite-backed storage API supports transactional updates. Noema uses the verified `jti` hash as object identity rather than storing the raw `jti` in the claim body. The guard records only bounded expiry/first-use state and delayed alarms re-read current state before deleting or rescheduling it.

## Executable verification

`test/replay-before-token-mint.test.ts` exercises the production wrapper with genuinely RS256-signed GitHub-Actions-like OIDC fixtures rather than trusting a decoded fake payload.

The security contract includes both directions:

1. **Replay path:** the replay Durable Object returns conflict and the test requires 401 `ERR_AUTH_REPLAY` with zero POSTs to `/app/installations/{id}/access_tokens`.
2. **First-use path:** the replay guard records `replay_claim`, the GitHub token endpoint records `token_mint`, and the exact required order is `replay_claim` before `token_mint` while the response retains public `x-oidc-replay-protection: single-use` evidence.

Existing wrapper tests retain fail-closed coverage for malformed/missing replay claims and unavailable replay state. Exact-head CI, branch/statement/function/line coverage, central Security Scan and formal review remain independent acceptance gates.

## Residual risks and non-goals

- A valid first-use request can still cause GitHub App installation lookup/token creation; replay protection is not a general request-rate limiter. The distributed rate limiter remains the pre-auth abuse-control plane.
- This change does not make decoded workflow claims authoritative before signature verification.
- This change does not make a model verdict or passing test a GitHub approval.
- This change does not solve organization Actions queue capacity, App provisioning, or `main` ruleset gaps.
- This change does not authorize release/deployment of the Draft stack.

## Primary references — APA 7th

GitHub, Inc. (2026). *OpenID Connect reference*. GitHub Docs. https://docs.github.com/en/actions/reference/security/oidc

GitHub, Inc. (2026). *OpenID Connect*. GitHub Docs. https://docs.github.com/en/actions/concepts/security/openid-connect

Cloudflare, Inc. (2026). *Durable Objects*. Cloudflare Developers. https://developers.cloudflare.com/durable-objects/

Cloudflare, Inc. (2026). *Storage API*. Cloudflare Developers. https://developers.cloudflare.com/durable-objects/api/storage-api/

## Evidence classification

The GitHub and Cloudflare documentation above supports the identity and coordination primitives. The exact ordering decision — verified request authorization, then atomic replay claim, then privileged token mint — is a Noema security architecture decision derived from those primitives and the concrete side-effect threat reproduced in #81/#83. It should be re-evaluated if GitHub changes installation-token semantics or Noema moves credential minting to a different authority boundary.
