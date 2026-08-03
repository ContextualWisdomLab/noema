# Bounded OIDC input envelope

Noema treats the `/exchange` authorization header as an untrusted network input even though successful calls must ultimately carry a GitHub-signed OIDC token.

Cloudflare Workers currently accept up to 128 KB of request headers while each isolate has 128 MB of memory. A deliberately oversized compact JWT could therefore consume avoidable CPU and memory during Base64URL decoding and JSON parsing before signature verification. Noema rejects oversized or syntactically invalid Bearer JWT envelopes at the deployment entrypoint, before Durable Object lookup, OIDC discovery/JWKS calls, GitHub App private-key use, or GitHub API access.

## Enforced limits

| Input | Maximum |
| --- | ---: |
| Complete `Authorization` header | 16,384 bytes |
| JWT protected-header segment | 2,048 bytes |
| JWT payload segment | 8,192 bytes |
| JWT signature segment | 4,096 bytes |

Every JWT segment must be non-empty and contain only the Base64URL alphabet (`A-Z`, `a-z`, `0-9`, `_`, `-`). The envelope must contain exactly three dot-separated segments.

Missing authorization and non-Bearer schemes remain delegated to the normal API authentication path so existing `401` behavior and Bearer challenges remain stable. A rejected Bearer envelope returns:

- HTTP `400`;
- `ERR_TOKEN_MALFORMED`;
- `Cache-Control: no-store` and `Pragma: no-cache`;
- the standard trace and latency headers;
- a bounded policy description that never echoes the token.

## Operational verification

1. Send a normal GitHub Actions OIDC token and verify the request proceeds to the existing signature, issuer, audience, repository, workflow, and replay checks.
2. Send a Bearer value with a JWT segment above the documented limit and verify `400 ERR_TOKEN_MALFORMED` is returned.
3. Confirm no OIDC discovery, JWKS, Durable Object, or GitHub API subrequest is emitted for the rejected request.
4. Confirm logs contain only `event=oidc_token_envelope`, the route, method, status, error code, outcome, and policy name; the bearer value must never appear.

## Rollback

Reverting this policy re-exposes the decoder to the full platform request-header allowance and is not a safe operational bypass. If GitHub changes the size of its OIDC tokens, update the constants and regression tests together after recording representative token sizes and maintaining a substantial safety margin.

## References

- GitHub Actions OpenID Connect reference: supported `exp`, `iat`, `jti`, `nbf`, repository, workflow, and reusable-workflow claims.
- Cloudflare Workers limits: request-header and isolate-memory ceilings.
