# GitHub credential endpoint allowlist

Date: 2026-08-04
Status: Unreleased

## Buyer-visible risk addressed

Noema already pinned credential-bearing traffic to GitHub-owned origins, blocked redirects, bounded response bodies, and enforced method/body roles. The remaining same-origin confused-deputy risk was that a future regression could attach the GitHub App JWT to an unrelated `api.github.com` endpoint.

## Change

Credential-bearing GitHub REST traffic is now restricted before network I/O to the reviewed GitHub App installation protocol surface:

- `GET /repos/{owner}/{repository}/installation`
- `GET /app/installations`
- `POST /app/installations/{positive_integer_id}/access_tokens`

The policy rejects query strings, encoded path-confusion attempts, nonnumeric installation identifiers, unsupported methods, missing or non-Bearer credentials, bodies on lookup requests, missing bodies on token issuance, ambient cookies/proxy credentials, and method-override headers. Public bodyless unauthenticated GitHub GETs remain permitted because they carry no credential.

GitHub documents repository installation lookup and installation-token issuance as the supported App-JWT flow:

- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28

## Failure behavior

A disallowed credential endpoint or request shape returns a bodyless `502` with `X-Noema-Egress-Policy: blocked-request-policy`. No outbound request is made and no credential-bearing response metadata is reflected.

## Verification

```bash
npm run typecheck
npm run test
npm run release:verify
```

The regression suite covers exact approved operations, unrelated endpoint rejection, query and dot-segment rejection, method/body mismatches, ambient credentials, method overrides, and pre-network failure.
