# Repository path-segment validation

## Decision

`/exchange` accepts an optional `target_repository` string in `owner/name` form. Noema interpolates that string into GitHub REST paths such as `/repos/${repository}/installation` before any GitHub App private key is imported. A caller who sends `ContextualWisdomLab/..` or `../noema` would otherwise produce a URL whose `.` / `..` segments are removed during generic URI resolution and no longer name the intended repository.

The Worker therefore rejects a repository string when either path segment is exactly `.` or `..`, and it does so as `400 ERR_VALIDATION_INPUT` before GitHub App credential work. Names that merely contain a dot, including the real `.github` repository, remain valid. A syntactically valid owner that is not the configured organization still returns `403 ERR_REPO_NOT_ALLOWED`.

Callers must send `ContextualWisdomLab/<repository>` only. Do not send path-traversal segments, percent-encoded dots, or extra slashes.

## Why this is fail-closed at the public contract

RFC 3986 defines `.` and `..` as dot segments that a resolver removes while normalizing a path. GitHub's REST path `/repos/{owner}/{repo}/installation` is a URI path, not an opaque token. If Noema forwarded `ContextualWisdomLab/..`, a later URL parser or reverse proxy could resolve it to `/repos/installation` and perform privileged work against the wrong resource.

The published OpenAPI pattern and `docs/api-spec.md` must describe the same rule. A pattern that accepts `owner/..` tells an integrator the request is valid while the Worker rejects it, which is a buyer-facing contract gap.

The outbound fetch policy already refuses a repository name that is only `.` or `..` on the installation-token body. Request validation repeats that rule on both owner and name so the private key is never imported for a traversal string, including when tests or a future caller invoke the base Worker without the production fetch wrapper.

## Verification contract

Tests must prove:

- `ContextualWisdomLab/..` and `ContextualWisdomLab/.` return `400 ERR_VALIDATION_INPUT` with zero `api.github.com` egress;
- `../noema` and `./noema` return the same `400` rather than a later owner-allowlist `403`;
- `ContextualWisdomLab/.github` remains a legal name;
- a foreign owner such as `OtherWisdomLab/noema` still returns `403 ERR_REPO_NOT_ALLOWED`;
- the OpenAPI `target_repository` pattern rejects `.` / `..` segments while accepting `.github`; and
- owned production coverage of `validateRepositoryName` and `parseExchangeRequestBody` stays at 100 percent.

## References

Berners-Lee, T., Fielding, R., & Masinter, L. (2005). *Uniform resource identifier (URI): Generic syntax* (RFC 3986). Internet Engineering Task Force. https://doi.org/10.17487/RFC3986

GitHub. (2026). *REST API endpoints for GitHub Apps*. GitHub Docs. https://docs.github.com/en/rest/apps/installations

GitHub. (2026). *Creating and managing repositories*. GitHub Docs. https://docs.github.com/en/repositories/creating-and-managing-repositories

OWASP Foundation. (2021). *A01:2021 – Broken access control*. OWASP Top 10. https://owasp.org/Top10/A01_2021-Broken_Access_Control/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
