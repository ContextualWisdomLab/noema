# Private-reporting setting audit: zero ambient repository-token authority

Status: Proposed on PR #726. This record describes source evidence only; it does not substitute for hosted exact-head GREEN, a current operational receipt, or an external-reporter exercise.

## Problem

The private-vulnerability-reporting `setting` job used `permissions: contents: read` so `actions/checkout` could fetch the repository before a separate GitHub App installation token was minted with only `permission-metadata: read`. The audit itself did not need repository-scoped `GITHUB_TOKEN` authority because Noema is public and the same workflow already proves that exact public source can be fetched without repository credentials in the `external-surface` job.

GitHub documents that every action can access `github.token` even when the workflow does not explicitly pass `GITHUB_TOKEN`, and recommends minimizing its permissions. GitHub also documents that job-level `permissions` changes the token authority inherited by all actions and commands in that job. The pinned `actions/setup-node` action documents that its `token` input defaults to `github.token` on github.com unless explicitly overridden.

## Decision

The `setting` job now uses `permissions: {}` and performs the same credential-free exact public fetch already used by the external-surface job:

- initialize an empty Git repository;
- add only `https://github.com/ContextualWisdomLab/noema.git`;
- fetch exactly `$GITHUB_SHA` with `credential.helper=` and terminal prompting disabled;
- detach at `FETCH_HEAD` and retain the existing exact-checkout cleanliness check;
- pass `token: ""` to `actions/setup-node` so setup-node does not receive the job token through its default input;
- mint the separate repository-scoped GitHub App token only for the bounded private-vulnerability-reporting status GET, retaining the exact `permission-metadata: read` allowlist and owner-only capability-file handoff.

No product-domain, provider-routing, quarantine/security-runtime, outbound, deployment, or case-handling authority moves into Noema.

## Alternatives rejected

Keeping `contents: read` was rejected because public source acquisition does not require it and every third-party action in the job can otherwise access `github.token`. Retaining `actions/checkout` with `persist-credentials: false` was also rejected: that prevents persisted Git credentials after checkout, but it still requires the checkout action to receive a repository-capable token for the checkout itself. Removing `setup-node` was unnecessary because its token input can be explicitly blank while preserving deterministic Node setup.

## Executable evidence

- RED `2bf22d252224971d0239ed7e928553600c9889fd` adds the ambient-token contract before the workflow changes.
- GREEN implementation `7f19ecb195c65a09c360be4b43fedebc99faf250` removes job-level `contents: read`, removes `actions/checkout`, uses credential-free exact public fetch, and sets setup-node `token: ""`.
- `b88285f5ffc8dcaca75b789f16972c43d8100283` updates the canonical App-token contract so it requires zero ambient job permissions rather than the superseded checkout permission.
- `69ccb2b15b998216691973df1d2e18b278e1713e` updates the broader operational-audit assertions so they reject ambient `contents: read` and `actions/checkout` authority.

Hosted evidence and independent current-head review must bind to the final exact head after this record is added; predecessor review and workflow GREEN do not transfer.

## Risks and rollback

Unauthenticated GitHub source acquisition and unauthenticated setup-node distribution lookup can encounter public rate limits or transient network failures. Those are deliberate fail-closed availability risks in exchange for removing unnecessary repository-token authority. If that proves operationally unacceptable, rollback requires a new reviewed decision that demonstrates the least additional permission needed; silently restoring `contents: read` is not an accepted fallback.

## References

GitHub. (2026). *Use GITHUB_TOKEN for authentication in workflows*. GitHub Docs. https://docs.github.com/en/actions/tutorials/authenticate-with-github_token

GitHub. (2026). *Workflow syntax for GitHub Actions*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

GitHub. (2026). *GITHUB_TOKEN*. GitHub Docs. https://docs.github.com/en/enterprise-cloud@latest/actions/concepts/security/github_token

GitHub. (2026). *actions/setup-node*. GitHub. https://github.com/actions/setup-node
