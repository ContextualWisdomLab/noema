# Atomic product-publisher ref and pull-request lease

## Status and scope

Reviewed on 2026-08-15 against protected `main` `2db716d7252603689b2cc18b700bac25e872b28f`. This record applies only to the credential-bearing `publish_product_increment` stage in `.github/workflows/hourly-product-development.yml`. It does not grant review, merge, release, deployment, or licensing authority, and it does not change the NVIDIA NIM proposer/verifier trust split protected by #366.

This clean successor restacks only the unique atomic publisher behavior from stale Draft #80. The stale branch and its old checks are historical evidence; no predecessor CI, review, or scanner result transfers to this successor.

## Problem and RED condition

Protected `main` first inventories a generated branch with `git ls-remote`, then performs an unconditional branch push. On later failure it deletes the branch by name without proving that the remote ref still equals the proposal commit. That is a check-then-act race: another actor may create the same ref after inventory, or may advance/recreate a publisher-created ref before cleanup.

`test/hourly-product-development-publisher-lease.test.ts` is the executable RED contract. Against the protected-main implementation it rejects the unguarded push/delete sequence and requires:

- expected-absence branch creation in the same Git ref update;
- exact-proposal-head cleanup rather than deletion by name;
- machine-readable REST pull-request creation;
- cleanup armed before a possibly successful create request can lose its response;
- server-side head/base identity revalidation; and
- fully paginated post-create open-PR inventory before publication is accepted.

## Decision

### Explicit expected-absence ref creation

The publisher captures the exact local proposal commit and uses Git's explicit lease form:

```sh
proposal_head="$(git rev-parse HEAD)"
git push --force-with-lease="refs/heads/${branch}:" \
  origin "HEAD:refs/heads/${branch}"
```

An empty explicit expectation means the mutation is accepted only while the destination ref is absent. The preliminary `git ls-remote` inventory is removed because it is observation, not write authority.

### Exact-head cleanup

Cleanup is conditioned on the branch still identifying the exact proposal commit created by this run:

```sh
cleanup_remote_branch() {
  git push --force-with-lease="refs/heads/${branch}:${proposal_head}" \
    origin ":refs/heads/${branch}" >/dev/null 2>&1 || true
}
```

If another actor advances or replaces the ref, cleanup fails harmlessly rather than deleting foreign state.

### Recoverable pull-request identity

The publisher creates a pull request through GitHub's REST endpoint with a 256-bit correlation marker in the bounded body. A cleanup trap is armed before `POST /pulls`. If the client response is lost or malformed after possible server-side success, the publisher performs a paginated head-scoped query and accepts exactly one candidate only when its `head.sha`, `base.sha`, and hidden marker all match this run. Cleanup does not trust a previously returned numeric PR identifier: immediately before any close it discards that identifier, repeats the marker/head/base recovery, and closes only the single recovered positive integer pull-request number. If recovery is unavailable, ambiguous, or no longer matches the exact proposal identity, the PR is left open for manual investigation rather than being closed by stale identity.

After creation, the publisher re-reads that exact pull request and requires `head.sha == proposal_head` and `base.sha == expected_base`. It then paginates the complete open-PR queue and accepts publication only when the created pull request is the sole open PR. Missing, malformed, ambiguous, or unavailable evidence remains failure.

## Authority and rollback boundaries

The proposer may use `NVIDIA_NIM_API_KEY` but has no shell execution authority. A separate uncredentialed job executes `npm run release:verify`; the credential-bearing publisher reconstructs and publishes only the already verified immutable proposal. The Maintainer App token never becomes model/verifier authority. This change does not weaken the central Security Scan, configured coverage, package, SBOM/provenance, review, protected-base, or release gates.

Rollback is source rollback of this bounded publisher change. No force-push, destructive rebase, branch-protection bypass, self-approval, repair workflow, or alternate credential is required.

## Source-supported rationale

Git 2.55.0 documents `--force-with-lease=<refname>:<expect>` as conditioning a ref update on the named ref still having the explicitly supplied current value. This is the relevant compare-and-swap primitive for both expected-absence creation and exact-head cleanup.

GitHub's current pull-request REST API provides structured creation, retrieval, head filtering, and pagination. These primitives avoid parsing human-oriented CLI output and allow the publisher to rebind publication to exact server-observed commit identities.

NIST SSDF 1.1 requires organizations to protect software and development environments from unauthorized access and tampering and to maintain provenance/integrity controls across the software lifecycle. The repository therefore keeps model generation, executable verification, publication credentials, checks, review, merge, release, and deployment as separate authorities.

## References (APA 7th)

Git Project. (2026). *git-push documentation (Version 2.55.0).* https://git-scm.com/docs/git-push

GitHub, Inc. (2026). *REST API endpoints for pull requests.* https://docs.github.com/en/rest/pulls/pulls

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
