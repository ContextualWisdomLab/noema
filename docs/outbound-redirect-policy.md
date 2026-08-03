# Fail-closed outbound redirect policy

## Purpose

Noema makes two classes of security-sensitive outbound requests:

- GitHub OIDC discovery and JWKS retrieval used to verify signed workflow identity.
- GitHub App REST requests carrying an App JWT or installation token request context.

Cloudflare Workers defaults new outbound requests to `redirect: follow`. Cloudflare documents that followed redirects forward all headers to the redirect destination, including `Authorization` and other sensitive headers, even when the destination hostname changes. Noema therefore treats every redirect on these trust and credential paths as a network-policy failure.

## Enforced policy

All GitHub OIDC and GitHub API subrequests use `fetchWithoutRedirect`, which overwrites any caller-supplied redirect mode with `redirect: "error"`.

The OIDC discovery response must also contain exactly:

- issuer: `https://token.actions.githubusercontent.com`
- JWKS URL: `https://token.actions.githubusercontent.com/.well-known/jwks`

A redirect, malformed response, issuer change, or JWKS endpoint change fails closed before Noema accepts the identity or returns an installation token. The exact GitHub REST API origin gate remains independently enforced before `/exchange` enters the credential-bearing path.

## Verification

```bash
npm run typecheck
npm test
npm run security:scan
npm run release:verify
```

The unit contract verifies that the outbound wrapper preserves request options but always replaces `follow` or `manual` with `error`. Integration tests continue to exercise GitHub OIDC verification and GitHub App token exchange through mocked subrequests.

## Operations and rollback

- Do not weaken the policy to `follow` for availability. Investigate the redirect or metadata drift first.
- A legitimate GitHub endpoint migration requires a reviewed source change, updated tests, and authoritative GitHub documentation before deployment.
- Roll back only to a release that rejects redirects on credential-bearing GitHub requests. If no such release exists, retain the current release and block `/exchange` at the edge while investigating.

## References

- Cloudflare Workers Request API: https://developers.cloudflare.com/workers/runtime-apis/request/
- GitHub Actions OIDC discovery metadata: https://token.actions.githubusercontent.com/.well-known/openid-configuration
- Fetch redirect modes: https://fetch.spec.whatwg.org/
