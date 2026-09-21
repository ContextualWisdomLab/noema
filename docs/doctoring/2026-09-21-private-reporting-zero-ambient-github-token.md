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
- allow exactly one `actions/setup-node@...` reference in the setting-job regression contract, and require that pinned canonical step to pass `token: ""` so no additional setup-node invocation can silently regain the default job token;
- mint the separate repository-scoped GitHub App token only for the bounded private-vulnerability-reporting status GET, retaining the exact `permission-metadata: read` allowlist and owner-only capability-file handoff.

No product-domain, provider-routing, quarantine/security-runtime, outbound, deployment, or case-handling authority moves into Noema.

## Alternatives rejected

Keeping `contents: read` was rejected because public source acquisition does not require it and every third-party action in the job can otherwise access `github.token`. Retaining `actions/checkout` with `persist-credentials: false` was also rejected: that prevents persisted Git credentials after checkout, but it still requires the checkout action to receive a repository-capable token for the checkout itself. Removing `setup-node` was unnecessary because its token input can be explicitly blank while preserving deterministic Node setup. Accepting one compliant setup-node block while allowing additional setup-node invocations was rejected because a second invocation can recover the action's default `github.token` input and invalidate the zero-ambient-token evidence while the earlier block keeps a substring-based oracle green.

## Executable evidence

- RED `2bf22d252224971d0239ed7e928553600c9889fd` adds the ambient-token contract before the workflow changes.
- GREEN implementation `7f19ecb195c65a09c360be4b43fedebc99faf250` removes job-level `contents: read`, removes `actions/checkout`, uses credential-free exact public fetch, and sets setup-node `token: ""`.
- `b88285f5ffc8dcaca75b789f16972c43d8100283` updates the canonical App-token contract so it requires zero ambient job permissions rather than the superseded checkout permission.
- `69ccb2b15b998216691973df1d2e18b278e1713e` updates the broader operational-audit assertions so they reject ambient `contents: read` and `actions/checkout` authority.
- Independent review of `9b1bb674bd8401748aa9b0287bcf0e5ad338cecd` found one valid regression-oracle weakness: the ambient-token test looked for `token: ""` anywhere in the complete setting job, so an unrelated action could carry that empty input while `actions/setup-node` silently reverted to its default `github.token` input.
- RED `f08aed5ded4c36419fd816849ee9e2f8400b052e` adds a hostile setting-job fixture that removes the setup-node token while putting `token: ""` on an unrelated step; the predecessor whole-job matcher false-PASSes that fixture.
- GREEN `d688cf90f6f0bfa5d27189ae7e76ced87ffc0dc2` binds the assertion to the exact pinned setup-node step and its contiguous `with:` block, so an unrelated empty token cannot satisfy the boundary.
- After #728 merged, independent review of non-force-restacked exact `3b5d8e9579ccefbb3ed632b6fc8033aa695a7937` found another valid false-PASS: the helper could find one compliant setup-node block while ignoring a second setup-node invocation that omitted the blank token.
- RED `fcf07cdd202cfdf365253470dc1c5da9a24637b3` adds a workflow-shaped hostile setting-job fixture containing both an unsafe setup-node invocation and the retained compliant block; the predecessor substring oracle returns true for that fixture.
- GREEN `f66b7a271884e6270973d40cfb3c3fe032d51cca` requires exactly one textual `actions/setup-node@` reference before admitting the canonical pinned tokenless block. The checked-in production workflow is unchanged by this repair.

Hosted evidence and independent current-head review must bind to the final exact head after this record is updated; predecessor review and workflow GREEN do not transfer.

## Risks and rollback

Unauthenticated GitHub source acquisition and unauthenticated setup-node distribution lookup can encounter public rate limits or transient network failures. Those are deliberate fail-closed availability risks in exchange for removing unnecessary repository-token authority. The exact-step regression contract is intentionally stricter than a generic YAML search: if setup-node version/input structure changes, or a legitimate second setup-node invocation is proposed, the contract and authority model must be reviewed with that change rather than silently accepting another token acquisition path. If tokenless public acquisition proves operationally unacceptable, rollback requires a new reviewed decision that demonstrates the least additional permission needed; silently restoring `contents: read` is not an accepted fallback.

## References

GitHub. (2026). *Use GITHUB_TOKEN for authentication in workflows*. GitHub Docs. https://docs.github.com/en/actions/tutorials/authenticate-with-github_token

GitHub. (2026). *Workflow syntax for GitHub Actions*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

GitHub. (2026). *GITHUB_TOKEN*. GitHub Docs. https://docs.github.com/en/enterprise-cloud@latest/actions/concepts/security/github_token

GitHub. (2026). *actions/setup-node*. GitHub. https://github.com/actions/setup-node
