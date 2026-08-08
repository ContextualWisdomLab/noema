# Atomic product-publisher ref lease

## Status and scope

Reviewed on 2026-08-08. This decision record applies only to the credential-bearing `publish_product_increment` stage in `.github/workflows/hourly-product-development.yml`. It does not grant merge, release, deployment, or review authority and does not change the NVIDIA NIM/OpenCode or reviewer credential contracts.

The first test-only head of PR #80 (`1a7a6eea0e4345f45d743efee9070d2265c779df`) intentionally remained RED: the regression contract rejected the existing `ls-remote` → unguarded push → unconditional delete sequence. The implementation was then added at `f60c4d93fe54cff211675b47c0f6a0950aadf8bd`; its dedicated lease regression tests passed, but one predecessor workflow-order test still searched for the removed unguarded push string. Head `16941a9139bc154403410bd22ee6c6e19c96e3ed` corrected that compatibility assertion to bind the ordering check to the leased mutation itself. On that head all 646 tests passed and configured production statements, branches, functions, and lines were 100%; `release:verify` then failed only at the inherited `nanoid <3.3.17` high-severity audit gate. No audit threshold or waiver was changed.

A second test-only head (`7f210d08b39d624f0c55c70baec62fcf0b4dc5a5`) exposed a narrower post-create race: after `gh pr create` consumed the mutable branch ref, the publisher cleared cleanup without re-reading the created pull request and proving that GitHub had bound it to the verified proposal head and proposal base. Head `048bffed4a3e76790bf27c2ac96743889eceafc8` implements that fail-closed identity binding. The publisher now keeps cleanup armed through PR creation, re-reads the created PR from GitHub, validates bounded head/base SHA evidence, compares the server-side `head.sha` to `proposal_head` and `base.sha` to the previously verified proposal base, and closes the just-created PR before applying the exact-head branch-deletion lease when validation fails.

PR #80 is stacked on the dedicated `nanoid` remediation branch from PR #76 (`fix/nanoid-cve-2026-67213`) so integrated checks can exercise this bounded publisher fix with the security remediation instead of treating an unrelated known dependency failure as implementation evidence. Synthetic merge-ref results from that stack are integration evidence only: they are not promoted to exact-head acceptance, and the PR remains Draft until its direct head can satisfy the repository's exact-head, review, governance, and security requirements.

## Threat model

The publisher derives a run-unique proposal branch name, but uniqueness by convention is not a concurrency control. Between a remote inventory read and a subsequent ref update, another actor can create the same ref. Likewise, after this publisher creates a ref, another actor can advance or replace it before error cleanup executes. A check-then-act sequence can therefore overwrite a raced ref, and an unconditional delete can remove a ref no longer owned by the failed publisher run.

PR creation adds a second mutable boundary. `gh pr create` names a branch, not an immutable commit object. If the server-side branch changes between the publisher's leased creation and the PR transaction, successful command completion alone does not prove that the created PR points at the commit the publisher verified. The default branch can also advance, so the created PR's server-side base commit must remain the same exact proposal base that passed the pre-publication gate.

The security boundary is therefore the Git server's conditional ref update plus the created PR object's server-observed head/base identity, not a preceding client-side observation or a successful CLI exit code. Repository writes must fail closed when either server-side identity differs from the state the publisher is authorized to modify.

## Decision

Proposal-branch creation MUST use an explicit expected-absence lease in the same push that creates the remote ref:

```sh
proposal_head="$(git rev-parse HEAD)"
git push --force-with-lease="refs/heads/${branch}:" origin "HEAD:refs/heads/${branch}"
```

The empty expected value means the creation is authorized only while the destination ref is absent. A prior `git ls-remote` inventory check is not a substitute and MUST NOT be used as write authority.

The error cleanup trap MUST be installed only after the expected-absence creation succeeds. Cleanup MUST delete the remote ref only when it still equals the exact proposal commit created by this run:

```sh
cleanup_remote_branch() {
  git push --force-with-lease="refs/heads/${branch}:${proposal_head}" origin ":refs/heads/${branch}" >/dev/null 2>&1 || true
}
trap cleanup_remote_branch ERR
```

If another actor advances, replaces, or recreates the branch, the cleanup lease fails and the foreign ref is preserved. Cleanup failure is best-effort resource cleanup only; it never authorizes a broader or unconditional deletion.

After `gh pr create` returns, cleanup MUST remain armed while the publisher derives the created PR number from the returned URL, re-reads that exact PR through the GitHub REST API, and validates its immutable commit identities:

```sh
created_pr_json="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}")"
live_pr_head="$(jq -r '.head.sha // empty' <<<"$created_pr_json")"
live_pr_base="$(jq -r '.base.sha // empty' <<<"$created_pr_json")"

[ "$live_pr_head" = "$proposal_head" ]
[ "$live_pr_base" = "$expected_base" ]
```

Missing, malformed, or mismatched PR identity evidence is a publication failure. In that failure path, the publisher closes only the PR URL it just created and then attempts the existing exact-head branch-deletion lease. The cleanup MUST NOT replace the lease with unconditional ref deletion, and cleanup failure MUST NOT erase a branch that another actor advanced.

## Required ordering invariant

The trusted publisher MUST preserve this order:

1. create the local proposal commit;
2. capture the canonical full `proposal_head` from that commit and the previously verified full `expected_base`;
3. atomically create the remote proposal ref with an expected-absence lease;
4. only after successful creation, install cleanup bound to `proposal_head`;
5. create the pull request;
6. keep cleanup armed and obtain the created PR number from the returned PR URL;
7. re-read the exact created PR from GitHub and require canonical full `head.sha` and `base.sha` evidence;
8. require `head.sha == proposal_head` and `base.sha == expected_base`;
9. only after both identity guards pass, clear the error trap and report publication success.

A future refactor must not move the trap before the creation push, replace the explicit lease with plain `--force`, recover an expected value from a mutable remote-tracking ref, treat `gh pr create` success as sufficient publication evidence, or clear cleanup before the server-side PR head/base guards complete.

## Verification contract

`test/hourly-product-development-publisher-lease.test.ts` is the executable regression contract. It requires the explicit expected-absence creation lease, exact proposal-head capture before the push, exact-head cleanup lease, and trap installation after successful creation. It also requires the post-create GitHub PR read, exact server-side head/base comparisons before trap clearing, and created-PR closure in failure cleanup. The same contract forbids the predecessor `git ls-remote --exit-code --heads` authorization pattern, unguarded creation push, and unconditional `git push origin --delete` cleanup.

The integrated head is acceptable only after the exact PR head, not a synthetic merge ref or predecessor head, passes CI, security, production statement/branch/function/line coverage, substantive review, and repository governance. Pending, queued, skipped-required, cancelled, stale-head, or status-only evidence is not success.

## Operational constraints

The publisher remains the isolated Maintainer App stage and must retain least-privilege repository permissions. No `.github/workflows/repair-*`, self-modifying Action, branch-patching workflow, `GITHUB_TOKEN` write fallback, protection bypass, or synthesized approval may be introduced to implement or repair this invariant.

A trusted local checkout used for equivalent maintenance must have a clean worktree/index, exact expected base and head, verified remote repository identity, and isolated credentials. Existing refs require an explicit expected-old SHA; newly created refs require atomic expected absence. Any created PR must also be rebound to its server-side exact head/base evidence before the maintenance operation is treated as successful.

## Primary-source rationale

Git's explicit `--force-with-lease=<refname>:<expect>` form conditions a forced ref update on the destination still having the caller-specified expected value. The Git documentation also warns that lease forms which infer expectations from remote-tracking state can interact badly with background fetches; Noema therefore uses the explicit expected value rather than an inferred one.

GitHub's REST representation for a pull request exposes the pull request's server-side head and base commit identities. Re-reading the created PR therefore provides authoritative post-create evidence for the exact commits GitHub associated with that PR, rather than inferring identity from the mutable branch name or the CLI command's success. GitHub's Actions secure-use guidance separately recommends least-privilege workflow credentials and treating workflow automation as a security-sensitive trust boundary. Together these sources support the project decision to require server-side compare-and-update for the branch and a server-side post-create identity read for the PR before publication is accepted.

## References (APA 7th)

Git Project. (2026). *git-push documentation (Version 2.53.0).* https://git-scm.com/docs/git-push/2.53.0.html

GitHub, Inc. (2026). *REST API endpoints for pull requests.* https://docs.github.com/en/rest/pulls/pulls

GitHub, Inc. (2026). *Secure use reference: GitHub Actions.* https://docs.github.com/en/actions/reference/security/secure-use
