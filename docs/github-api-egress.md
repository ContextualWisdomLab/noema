# GitHub API egress trust boundary

Noema exchanges a verified GitHub Actions OIDC token for a repository-scoped
GitHub App installation token. The Worker therefore sends a short-lived GitHub
App JWT and installation-token requests only to the reviewed GitHub Cloud REST
API origin.

## Policy

The production entrypoint accepts `GITHUB_API_BASE` only when it parses as the
GitHub Cloud root origin:

```text
https://api.github.com
```

A trailing slash and the default HTTPS port are equivalent. The entrypoint
rejects HTTP, credentials in the URL, non-default ports, paths, query strings,
fragments, malformed values, whitespace-padded values, and lookalike hostnames.
It does not reflect the rejected value in responses or logs.

GitHub Enterprise Server or another API gateway is not implicitly supported.
Such a mode would require a separately reviewed trust policy covering the exact
host, TLS and DNS ownership, GitHub App tenancy, credential rotation, audit
logging, and deployment-specific tests. Do not weaken the GitHub Cloud policy by
turning it into a suffix, substring, or caller-provided allowlist.

References:

- https://docs.github.com/en/rest/apps/installations
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/rest/about-the-rest-api/api-versions

## Failure behavior

Only `/exchange` is gated. If `GITHUB_API_BASE` is absent or untrusted, the
entrypoint returns `503 ERR_GITHUB_API` before distributed rate-limit lookup,
OIDC parsing, GitHub App private-key use, or any outbound GitHub request. The
response is non-cacheable and contains a bounded trace identifier and the policy
name `github-cloud-exact-origin` without exposing the configured URL.

`/health` and normal JSON 404 behavior remain available so operators can inspect
the deployment while repairing configuration. A structured
`github_api_egress` log records only the route, method, status, error code,
outcome, and policy.

## Deployment verification

Before promotion:

1. Confirm `wrangler.toml` uses `main = "src/entrypoint.ts"`.
2. Confirm `GITHUB_API_BASE = "https://api.github.com"` in the deployed Worker
   configuration.
3. In a non-production environment, temporarily set a lookalike hostname and
   confirm `/exchange` returns `503 ERR_GITHUB_API` without a GitHub API call.
4. Restore the exact GitHub Cloud origin and confirm the standard authenticated
   `/exchange` smoke test reaches the existing rate-limit, OIDC, replay, and
   installation-token controls.
5. Retain the deployment configuration and smoke evidence with the release
   evidence package.

## Rollback

Rollback only to a release that keeps an equivalent exact-origin egress gate in
front of every credential-bearing GitHub API request. Do not roll back to an
entrypoint that concatenates an unchecked runtime value with GitHub App JWT or
installation-token requests. If the current deployment is misconfigured, keep
the gated entrypoint active and repair the Worker variable first.
