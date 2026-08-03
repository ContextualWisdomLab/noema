# OIDC replay protection

Noema treats each GitHub Actions OIDC token as a single-use exchange credential.
A valid token can mint at most one response containing a GitHub App installation
token, even when the same bearer token is submitted concurrently through different
Cloudflare Worker isolates.

## Why this control exists

GitHub documents `jti` as the unique identifier for an Actions OIDC token and
`exp` as its expiry. Signature, issuer, audience, workflow, repository, and time
validation prove that a token is authentic and currently acceptable, but they do
not by themselves record whether the same bearer token was already exchanged.
A copied token could otherwise be replayed until expiry and repeatedly request
new installation tokens.

References:

- <https://docs.github.com/en/actions/reference/security/oidc#oidc-token-claims>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows>
- <https://developers.cloudflare.com/durable-objects/api/alarms/>

## Enforcement sequence

1. The distributed per-client rate limiter runs before bearer-token parsing.
2. The exact configured reusable-workflow ref is checked as a deny-only early
   gate.
3. The base exchange verifies the JWT signature and all existing issuer,
   audience, repository, workflow, and expiry requirements, then requests the
   least-privilege installation token.
4. Before Noema releases the successful response, it atomically claims the
   verified token's bounded `jti` in `NOEMA_OIDC_REPLAY_GUARD`.
5. The first claim succeeds. Any subsequent claim for the same `jti` returns
   `401 ERR_AUTH_REPLAY`; missing or unhealthy replay storage returns `503` and
   the newly minted installation token is not delivered.

The claim occurs after the signed JWT and GitHub response succeed so an attacker
cannot poison the replay namespace with fabricated unsigned identifiers. The
trade-off is that a replay detected after GitHub token creation may leave one
undelivered short-lived installation token at GitHub; Noema never returns that
token and does not cache it.

## Storage and privacy

- The Durable Object name is `oidc:` plus SHA-256 of `jti`; raw `jti` is not
  stored or logged.
- Each object stores only first-use time and OIDC expiry.
- Expiry must be in the future and no more than one hour away.
- An alarm deletes the record shortly after expiry.
- SQLite-backed Durable Object storage provides the serialization boundary
  across Worker instances.

## Failure policy

| Condition | Result |
| --- | --- |
| First valid use | Installation token response is returned with `X-OIDC-Replay-Protection: single-use` |
| Reused `jti` | `401 ERR_AUTH_REPLAY` and Bearer `invalid_token` challenge |
| Missing or malformed `jti`/`exp` after otherwise successful exchange | `503 ERR_AUTH_REPLAY` |
| Missing binding, invalid Durable Object response, or storage failure | `503 ERR_AUTH_REPLAY` |
| Invalid JWT or GitHub exchange failure | Existing base error; replay state is not consumed |

No fallback to isolate-local memory exists. Replay storage failure is an
authorization failure, not an availability reason to bypass the control.

## Deployment and rollback

The Worker exports two independent SQLite-backed Durable Objects:

- `NoemaRateLimiter` for distributed request-volume decisions;
- `NoemaOidcReplayGuard` for one-time OIDC `jti` claims.

Deploy the updated `wrangler.toml` normally. Verify that a fresh OIDC token
succeeds once and that immediate reuse returns `401` without a second token.
Rollback requires rolling back both Worker code and configuration. Removing only
the replay binding causes successful base exchanges to fail closed with `503`.
