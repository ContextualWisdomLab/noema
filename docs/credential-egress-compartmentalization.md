# Credential egress compartmentalization

## Purpose

Noema exchanges a GitHub Actions OIDC token for a short-lived GitHub App installation token. The same Worker process must contact two different GitHub protocol surfaces:

- public OIDC discovery and JWKS metadata at `token.actions.githubusercontent.com`;
- authenticated GitHub REST endpoints at `api.github.com`.

A destination allowlist alone is insufficient because a future refactor, malformed request object, or confused-deputy bug could attach an App JWT, installation token, cookie, request body, or mutation method to the wrong trusted endpoint. This control therefore validates the effective request shape before the network call.

## Enforced policy

### GitHub Actions OIDC metadata

Only the two pinned discovery and JWKS URLs are accepted. Requests must:

- use `GET`;
- have no request body;
- omit `Authorization`, `Cookie`, and `Proxy-Authorization`.

Any violation returns a bodyless `502` response with `X-Noema-Egress-Policy: blocked-request-policy` before the network call.

### GitHub REST API

The exact `https://api.github.com` origin remains the only REST destination. Requests must:

- omit `Cookie` and `Proxy-Authorization`;
- use only `GET` or `POST` when an `Authorization` header is present;
- omit a body on authenticated `GET` requests.

This matches Noema's reviewed installation lookup and installation-token issuance operations while preventing ambient browser/proxy credentials and unsupported authenticated mutation methods.

## Effective request semantics

The policy derives method, headers, body, and cancellation from the effective combination of a `Request` input and `RequestInit` overrides. This prevents a safe-looking URL from bypassing checks through properties carried by a `Request` object or by later overrides.

## Failure behavior

Request-policy violations are fail-closed and produce no outbound traffic. Existing controls remain cumulative:

- exact destination allowlist;
- request-shape compartmentalization;
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

Regression tests cover OIDC method/body/credential rejection, GitHub REST ambient credential rejection, authenticated method constraints, Request/RequestInit override semantics, and network-call suppression.

## Rollback

Revert the compartmentalization commit only if a reviewed GitHub endpoint requires a new request shape. Do not broaden the policy globally. Add the exact method/header/body requirement with a regression test and retain the destination, redirect, timeout, and response-size gates.
