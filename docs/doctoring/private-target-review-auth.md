# Private target review authentication boundary

## Status

Proposed security and interoperability repair for the trusted `central-review` workflow. This document describes PR-scoped behavior until the change is protected-integrated and proven on a private target repository.

## Problem

The central review workflow runs in `ContextualWisdomLab/noema` but can review a different repository. GitHub documents the automatically generated `GITHUB_TOKEN` as an installation token whose permissions are limited to the repository that contains the workflow. Therefore the workflow-repository token is not a valid general authority for reading a private target repository.

The previous ordering attempted to read `repos/${TARGET_REPOSITORY}/pulls/${PR_NUMBER}` with `${{ github.token }}` before creating the existing Noema GitHub App installation token scoped to the target repository. Public targets can mask this defect because their pull-request metadata is publicly readable. A private target cannot rely on that path.

## Decision

Use two separate boundaries:

1. **Syntactic target validation without target-state access.** Validate the organization-qualified repository name, positive pull-request number, and full expected head SHA. Derive only the safe repository-name output required to request a scoped App token.
2. **Repository-scoped authorization before target-state access.** Mint the existing read-only Noema App token for exactly that target repository, then use that token for the first live pull-request read and every later evidence-collection read.

The live binding remains fail closed. Before checkout, the authenticated target read must prove that the pull request is open, its live head equals the dispatched exact head, and both head and base repositories equal the requested target repository.

The App token remains explicitly scoped to read-only evidence permissions for the target repository. This repair does not grant merge, release, deployment, or additional publication authority.

## Why this is the narrowest viable repair

GitHub explicitly recommends a GitHub App when a workflow needs access to additional resources such as another repository. The `actions/create-github-app-token` action supports an `owner` plus a bounded `repositories` list, and recommends explicit `permission-*` inputs rather than inheriting the full installation permission set.

The workflow already had this repository-scoped read token for checkout, checks, statuses, security evidence, and pull-request reads later in the job. Moving the first live target read behind the same token avoids a second credential family and preserves least privilege.

## Failure and recovery

- Invalid repository, PR number, or head syntax fails before the App credential is minted.
- A repository outside the App installation or without required read permission fails during token creation or the authenticated PR lookup.
- A closed PR, changed head, forked head, or mismatched base repository fails before checkout.
- A stale dispatched head is never silently replaced with the newly observed head.
- App-token creation failure does not fall back to `${{ github.token }}` or another ambient credential.

A later retry must start from a fresh dispatch bound to a freshly read exact target head. No predecessor-head review evidence transfers.

## Test contract

`reviewer/tests/test_central_review_workflow.py` requires the order:

```text
validate target identifier
→ mint repository-scoped read-only Noema App token
→ bind dispatch to live PR head using that App token
→ checkout trusted reviewer and exact target source
```

The contract also rejects `${{ github.token }}` in the live target-binding step.

Protected-main operational acceptance requires a real review dispatch against a private repository on which the Noema App is installed, proving that evidence collection reaches the exact target head without widening the App permissions.

## References

GitHub. (2026). *GITHUB_TOKEN*. GitHub Docs. https://docs.github.com/en/actions/concepts/security/github_token

GitHub. (2026). *Making authenticated API requests with a GitHub App in a GitHub Actions workflow*. GitHub Docs. https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow

GitHub. (2026). *actions/create-github-app-token* [Computer software]. GitHub. https://github.com/actions/create-github-app-token
