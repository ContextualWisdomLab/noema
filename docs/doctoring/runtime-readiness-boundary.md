# Runtime readiness boundary

## Decision

Noema exposes two distinct unauthenticated operational probes:

- `GET /health` proves only that the Worker request path is alive;
- `GET /ready` proves that the deployed credential-exchange configuration is structurally usable before an orchestrator routes `/exchange` traffic.

A live process is not necessarily ready to serve its business function. The readiness decision is intentionally offline: it does not mint a GitHub installation token, call GitHub, fetch OIDC metadata, or consume a replay/rate-limit decision. It validates only the configuration and cryptographic material that must be valid before those privileged operations can succeed.

## Fail-closed checks

The readiness evaluator requires all of the following:

1. the exact GitHub Actions OIDC issuer `https://token.actions.githubusercontent.com`;
2. a bounded nonempty audience composed only of protocol-safe characters;
3. a syntactically valid repository owner;
4. a trusted workflow repository owned by that same organization;
5. an exact workflow file and immutable-or-protected ref expression with no wildcard;
6. the exact GitHub Cloud REST API origin;
7. a positive decimal GitHub App identifier;
8. a PKCS#8 private key that WebCrypto can import for RSASSA-PKCS1-v1_5 signing; and
9. when configured, a positive decimal installation identifier.

The exact workflow ref accepts either a 40-character commit identifier or a named `refs/heads/...` or `refs/tags/...` ref that satisfies Git's ref-format ambiguity rules. Named refs fail closed when they contain double dots, consecutive slashes, dot-prefixed components, `.lock` components, trailing dot or slash, revision-expression syntax, control characters, or other characters rejected by `git check-ref-format`. This prevents `/ready` from reporting success for a trust configuration that Git and GitHub cannot represent.

The optional installation identifier remains optional because Noema supports installation discovery by target repository. An absent optional value is therefore ready; a present malformed value is not.

The response discloses stable check names only. It never reflects the configured issuer, audience, repository, API URL, App identifiers, private-key bytes, parser exception, or cryptographic error. Multiple failures are returned in deterministic evaluation order so operator automation can compare evidence without exposing secret material.

## HTTP contract

A ready instance returns `200` with:

- `x-noema-readiness: ready`;
- `cache-control: no-store`;
- `pragma: no-cache`;
- `x-content-type-options: nosniff`;
- bounded trace and latency headers; and
- a small JSON document whose configuration check is `pass`.

A not-ready instance returns `503 ERR_SERVICE_NOT_READY`, `x-noema-readiness: not-ready`, and `Retry-After: 30`. RFC 9110 defines `503 Service Unavailable` for temporary inability to handle a request and permits `Retry-After` to indicate when a client may retry. Noema uses that status only for readiness, not for process liveness.

`HEAD /ready` applies the same decision and headers without a body. Other methods return `405` with `Allow: GET, HEAD`.

## Orchestration rationale

Kubernetes distinguishes liveness from readiness because they answer different operational questions: liveness determines whether a container should be restarted, while readiness determines whether it should receive service traffic. A failed readiness probe removes an endpoint from traffic without implying that the process must be restarted. Noema applies the same separation at the service boundary even when deployed as a Cloudflare Worker or consumed by a non-Kubernetes control plane.

The deployment smoke test now requires all three surfaces:

1. liveness through `/health`;
2. runtime readiness through `/ready`; and
3. the unauthenticated `/exchange` challenge contract.

A release candidate cannot pass smoke evidence when liveness is green but runtime readiness is not.

## Secure-development rationale

NIST SP 800-218 recommends integrating security requirements, verification, and recorded evidence into the software life cycle. The readiness endpoint converts essential trust configuration into a deterministic, testable release and deployment signal while avoiding a privileged network call during probing. This implementation follows those risk-reduction practices without claiming formal NIST conformance.

## Verification contract

Tests must prove:

- `/health` remains available while `/ready` fails for broken exchange configuration;
- valid configuration yields `200` and the complete security/operational header set;
- every individual configuration boundary fails closed;
- dependent owner/repository/ref failures are reported deterministically;
- Git-invalid named branch and tag refs cannot produce a ready decision;
- malformed private keys fail without reflecting key bytes or parser details;
- installation discovery remains supported when no fixed installation id is set;
- `HEAD` is bodyless and method rejection advertises the allowed methods;
- the deployed smoke script fails when readiness returns `503`; and
- production statements, branches, functions, and lines remain at 100 percent.

## References

Fielding, R. T., Nottingham, M., & Reschke, J. (2022). *HTTP semantics* (RFC 9110). Internet Engineering Task Force. https://doi.org/10.17487/RFC9110

Git Project. (2025, November 17). *git-check-ref-format documentation* (Version 2.52.0). https://git-scm.com/docs/git-check-ref-format

Kubernetes Authors. (2026, April 17). *Liveness, readiness, and startup probes*. Kubernetes. https://kubernetes.io/docs/concepts/workloads/pods/probes/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
