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
- require the complete sensitive `setting` job serialization to match SHA-256 `fe43d9d1d563fd939e7464f79e73e86fd4752bf1e88922c6ae996315a3d6cb04`, while retaining readable structural assertions for zero job permissions, credential-free checkout and the explicitly blank setup-node token;
- mint the separate repository-scoped GitHub App token only for the bounded private-vulnerability-reporting status GET, retaining the exact `permission-metadata: read` allowlist and owner-only capability-file handoff.

The exact serialization binding replaces the earlier partial YAML `uses:` recognizer. Any semantic-equivalent alternative syntax—including quoted keys or values, escapes, aliases, anchors, flow mappings or block scalars—changes the serialized job and therefore fails closed until the authority digest is deliberately reviewed and updated. No product-domain, provider-routing, quarantine/security-runtime, outbound, deployment, or case-handling authority moves into Noema.

## Alternatives rejected

Keeping `contents: read` was rejected because public source acquisition does not require it and every third-party action in the job can otherwise access `github.token`. Retaining `actions/checkout` with `persist-credentials: false` was also rejected: that prevents persisted Git credentials after checkout, but it still requires the checkout action to receive a repository-capable token for the checkout itself. Removing `setup-node` was unnecessary because its token input can be explicitly blank while preserving deterministic Node setup.

Repeatedly extending a handwritten partial YAML recognizer was rejected after independent review demonstrated multiple semantically valid bypass families: duplicate actions, escaped scalar content, block scalars and quoted mapping keys. Adding a YAML parser solely to this regression boundary would add package/lockfile supply-chain surface and still require a separate decision about aliases and duplicate-key semantics. Binding the complete small security-sensitive job serialization gives a narrower invariant: any job-level authority mutation becomes an explicit review event. The digest is not a substitute for the readable assertions; it prevents unreviewed alternate serialization from bypassing them.

## Executable evidence

- RED `2bf22d252224971d0239ed7e928553600c9889fd` adds the ambient-token contract before the workflow changes.
- GREEN implementation `7f19ecb195c65a09c360be4b43fedebc99faf250` removes job-level `contents: read`, removes `actions/checkout`, uses credential-free exact public fetch, and sets setup-node `token: ""`.
- `b88285f5ffc8dcaca75b789f16972c43d8100283` updates the canonical App-token contract so it requires zero ambient job permissions rather than the superseded checkout permission.
- `69ccb2b15b998216691973df1d2e18b278e1713e` updates the broader operational-audit assertions so they reject ambient `contents: read` and `actions/checkout` authority.
- Independent review of `9b1bb674bd8401748aa9b0287bcf0e5ad338cecd` found one valid regression-oracle weakness: the ambient-token test looked for `token: ""` anywhere in the complete setting job, so an unrelated action could carry that empty input while `actions/setup-node` silently reverted to its default `github.token` input.
- RED `f08aed5ded4c36419fd816849ee9e2f8400b052e` adds a hostile setting-job fixture that removes the setup-node token while putting `token: ""` on an unrelated step; GREEN `d688cf90f6f0bfa5d27189ae7e76ced87ffc0dc2` binds the assertion to the exact pinned setup-node block.
- After #728 merged, independent review of non-force-restacked exact `3b5d8e9579ccefbb3ed632b6fc8033aa695a7937` found that one compliant setup-node block could coexist with another unsafe invocation. RED `fcf07cdd202cfdf365253470dc1c5da9a24637b3` exposes it; GREEN `f66b7a271884e6270973d40cfb3c3fe032d51cca` initially required exactly one literal setup-node reference.
- Independent review of `3e54330942c607107df587f731c2e81e59462d4e` found a valid YAML escaped identity (`actions/setup\u002dnode@...`) that bypassed literal counting. RED `5723265c047f796406f43bc858efa252e5b917de` exposes it; GREEN `ef04636af3911fbe06b535be57cca2dd924266bd` rejected quoted, escaped or aliased `uses:` values.
- Independent review of `38b05b4a55e964dfdcdf3d69c4da7128fdd42a97` found a block-scalar bypass. RED `21ee7caad6b699046830092d8056cf8647530981` exposes it; GREEN `6959543380f6005c48a46ffe57728b7ef0eba868` rejected `>` and `|` block-scalar values.
- Independent review of `17f745fa935936ab2b94c172fdc658bcaf28a799` then found the remaining class problem: quoted YAML mapping keys can hide an additional `uses` authority from a recognizer that only reads literal `uses:` keys.
- RED `5ee97adb0d0499b14f3935bdfcf065631f9b4023` adds the quoted-`uses` hostile fixture before changing the helper.
- GREEN `8de746bdfafbbb01e757aae9d231b4a83498bed6` removes the partial YAML-recognition authority and binds the complete `setting` job serialization to the reviewed SHA-256 digest. The production workflow is unchanged by these review-oracle repairs.

Hosted evidence and independent current-head review must bind to the final exact head after this record is updated; predecessor review and workflow GREEN do not transfer.

## Risks and rollback

Unauthenticated GitHub source acquisition and unauthenticated setup-node distribution lookup can encounter public rate limits or transient network failures. Those are deliberate fail-closed availability risks in exchange for removing unnecessary repository-token authority.

The serialization digest intentionally makes any `setting` job edit—including a benign one—fail until the digest and readable assertions are reviewed together. That maintenance cost is accepted because the job mints the bounded GitHub App capability and prior partial YAML recognizers repeatedly admitted semantic aliases. A future move to a canonical YAML AST validator is acceptable only if parser provenance, duplicate-key handling, aliases, tags and GitHub Actions syntax are explicitly bounded. If tokenless public acquisition proves operationally unacceptable, rollback requires a new reviewed decision demonstrating the least additional permission needed; silently restoring `contents: read` is not an accepted fallback.

## References

GitHub. (2026). *Use GITHUB_TOKEN for authentication in workflows*. GitHub Docs. https://docs.github.com/en/actions/tutorials/authenticate-with-github_token

GitHub. (2026). *Workflow syntax for GitHub Actions*. GitHub Docs. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

GitHub. (2026). *GITHUB_TOKEN*. GitHub Docs. https://docs.github.com/en/enterprise-cloud@latest/actions/concepts/security/github_token

GitHub. (2026). *actions/setup-node*. GitHub. https://github.com/actions/setup-node
