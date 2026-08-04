# Credential egress compartmentalization

## Purpose

Noema exchanges a GitHub Actions OIDC token for a short-lived GitHub App installation token. The same Worker process must contact two different GitHub protocol surfaces:

- public OIDC discovery and JWKS metadata at `token.actions.githubusercontent.com`;
- authenticated GitHub REST endpoints at `api.github.com`.

A destination allowlist alone is insufficient because a future refactor, malformed request object, path-confusion bug, or confused-deputy flow could attach an App JWT, installation token, cookie, request body, or mutation method to the wrong trusted endpoint. This control therefore validates the effective URL, endpoint role, method, headers, query, and body before the network call.

## Enforced policy

### GitHub Actions OIDC metadata

Only the two pinned discovery and JWKS URLs are accepted. Requests must:

- use `GET`;
- have no request body;
- omit `Authorization`, `Cookie`, and `Proxy-Authorization`.

Any violation returns a bodyless `502` response with `X-Noema-Egress-Policy: blocked-request-policy` before the network call.

### GitHub REST API

The exact `https://api.github.com` origin remains the only REST destination. Public, unauthenticated traffic is limited to bodyless `GET` requests. Credential-bearing App-JWT requests are limited to the reviewed GitHub App installation operations:

- `GET /repos/{owner}/{repository}/installation`;
- `GET /app/installations`;
- `POST /app/installations/{positive_integer_id}/access_tokens`.

Credential-bearing requests must:

- use a non-empty `Bearer` authorization value;
- use the exact method and body shape listed above;
- omit query strings;
- omit `Cookie`, `Proxy-Authorization`, `X-HTTP-Method-Override`, and `X-Method-Override`.

Repository path segments accept only GitHub repository-name characters. Encoded separators, dot-segment normalization, nonnumeric installation identifiers, unrelated REST endpoints, and unsupported mutation methods are rejected before the network call. This narrows a compromised or regressed credential call from the whole GitHub REST origin to the exact installation protocol surface used by Noema.

## Effective request semantics

The policy derives method, headers, body, cancellation, and URL from the effective combination of a `Request` input and `RequestInit` overrides. This prevents a safe-looking input from bypassing checks through properties carried by a `Request` object or by later overrides.

## Failure behavior

Request-policy violations are fail-closed and produce no outbound traffic. Existing controls remain cumulative:

- exact destination allowlist;
- endpoint and request-shape compartmentalization;
- manual redirect handling;
- 10-second deadline;
- 1 MiB response-body limit;
- caller cancellation propagation;
- runtime wrapper tamper detection.

## Verification

Run:

```bash
npm run typecheck
npm run test
npm run release:verify
```

Regression tests cover OIDC method/body/credential rejection, exact GitHub App endpoint matching, query and dot-segment rejection, numeric installation identifiers, ambient and override credential rejection, Request/RequestInit override semantics, and network-call suppression.

## Rollback

Revert the endpoint-compartmentalization change only if a reviewed GitHub endpoint requires a new request shape. Do not broaden the policy to an origin-wide credential allowance. Add the exact path, method, header, query, and body requirement with a regression test while retaining the destination, redirect, timeout, and response-size gates.
