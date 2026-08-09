# ADR-0010: Repository-scoped authentication for private review targets

- **Status:** Proposed
- **Decision owner:** Noema review/control-plane maintainers
- **Related implementation:** PR #85

## Context

Noema's central reviewer can evaluate pull requests outside the repository that contains the reviewer workflow. That includes a private target repository when the Noema GitHub App is installed there. The automatically generated workflow `GITHUB_TOKEN` belongs to the repository containing the workflow and must not be treated as cross-repository target authority. A first live pull-request lookup performed with that token can therefore succeed for a public target while failing for a private target, creating an interoperability defect that public-only testing can hide.

The central reviewer already has a separate GitHub App credential intended for bounded target-repository reads. The architecture should use that capability consistently from the first target-state read instead of widening `GITHUB_TOKEN`, introducing a PAT-like credential, or granting organization-wide target access.

## Decision

For a cross-repository review request, the reviewer trust bootstrap is ordered as follows:

```text
syntactic target repository / PR / dispatched-head validation
→ derive one bounded target repository name
→ mint a repository-scoped Noema App token for exactly that repository
→ perform the first live target PR lookup with the scoped App token
→ require open PR state + exact dispatched head + expected head/base repository identity
→ checkout trusted reviewer code and the authenticated exact target source
→ collect downstream evidence with the same bounded target authority
```

Before the repository-scoped Noema App token exists, the bootstrap may validate only syntax and locally available dispatch fields. It must not use `GITHUB_TOKEN` for a live target-repository API request.

The installation token is scoped to the single requested target repository and to the minimum read permissions required by the reviewer. Repository selection is explicit rather than inheriting all repositories in the App installation. This preserves least privilege and keeps the reviewer workflow repository, target repository, reviewer App, model judgement, and merge authority as separate trust domains.

## Failure behavior

The boundary is fail closed.

- If the target identifier is malformed, stop before token creation.
- If a repository-scoped token cannot be minted for the requested private target repository, stop without falling back to `GITHUB_TOKEN`, a PAT, public visibility, or broader App scope.
- If the first authenticated live PR read does not match the dispatched repository, PR number, open state, exact head, or repository identities, stop before target checkout or evidence promotion.
- A public target succeeding with anonymous or workflow-repository authority is not evidence that private-target authentication is correct.
- A check/status/model result never upgrades the scoped read token into approval, merge, release, or deployment authority.

## Consequences

### Positive

- Private and public review targets use one explicit authentication model at the first live target-state boundary.
- Credential scope matches the repository whose state is being authenticated.
- The reviewer does not need an organization-wide installation token or PAT-like secret.
- Exact-head binding occurs before untrusted target source is materialized for review.

### Costs and constraints

- The Noema GitHub App must actually be installed on each private target repository that Noema is expected to review.
- Operational acceptance must exercise a real private target; public-repository CI cannot prove this capability.
- App permission or installation drift becomes an explicit availability failure rather than being hidden by a fallback credential.

## Alternatives rejected

1. **Widen the workflow `GITHUB_TOKEN`.** Rejected because changing permissions does not turn a repository-scoped workflow credential into the intended target-repository App authority.
2. **Use a PAT or another broad long-lived credential.** Rejected because it introduces a new credential family with a larger blast radius and weaker repository-purpose binding.
3. **Mint one organization-wide App token.** Rejected because the reviewer needs only the requested target repository; broader installation scope violates least privilege.
4. **Require targets to be public.** Rejected because public visibility is not an acceptable substitute for private-repository interoperability or access control.
5. **Skip the first live PR binding and trust dispatch fields.** Rejected because dispatch metadata alone is not current target-state authority.

## Acceptance and status transition

This ADR remains **Proposed** while PR #85 is unmerged. It may move to **Accepted** only after all of the following are true on protected `main`:

1. the implementation performs the first live target PR lookup with the repository-scoped Noema App token;
2. exact-head/current-PR identity tests and the deterministic reviewer/security gates pass on the integrated revision;
3. no fallback broadens credentials when the target cannot be authenticated;
4. a real private target repository with the App installed is reviewed successfully and retained evidence proves the expected exact head was authenticated;
5. applicable reviewer/governance requirements remain separate and are not satisfied by this authentication success.

## References

GitHub. (2026). *GITHUB_TOKEN*. GitHub Docs. https://docs.github.com/en/actions/concepts/security/github_token

GitHub. (2026). *Making authenticated API requests with a GitHub App in a GitHub Actions workflow*. GitHub Docs. https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow

GitHub. (2026). *Create GitHub App token*. GitHub. https://github.com/actions/create-github-app-token
