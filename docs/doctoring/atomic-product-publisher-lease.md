# Atomic product-publisher ref lease

## Status and scope

Reviewed on 2026-08-08. This decision record applies only to the credential-bearing `publish_product_increment` stage in `.github/workflows/hourly-product-development.yml`. It does not grant merge, release, deployment, or review authority and does not change the NVIDIA NIM/OpenCode or reviewer credential contracts.

The first test-only head of PR #80 (`1a7a6eea0e4345f45d743efee9070d2265c779df`) intentionally remained RED: the regression contract rejected the existing `ls-remote` → unguarded push → unconditional delete sequence. The implementation was then added at `f60c4d93fe54cff211675b47c0f6a0950aadf8bd`; its dedicated lease regression tests passed, but one predecessor workflow-order test still searched for the removed unguarded push string. Head `16941a9139bc154403410bd22ee6c6e19c96e3ed` corrected that compatibility assertion to bind the ordering check to the leased mutation itself. On that head all 646 tests passed and configured production statements, branches, functions, and lines were 100%; `release:verify` then failed only at the inherited `nanoid <3.3.17` high-severity audit gate. No audit threshold or waiver was changed.

PR #80 is therefore stacked on the dedicated `nanoid` remediation branch from PR #76 (`fix/nanoid-cve-2026-67213`) so integrated checks can exercise this bounded publisher fix with the security remediation instead of treating an unrelated known dependency failure as implementation evidence. Synthetic merge-ref results from that stack are integration evidence only: they are not promoted to exact-head acceptance, and the PR remains Draft until its direct head can satisfy the repository's exact-head, review, governance, and security requirements.

## Threat model

The publisher derives a run-unique proposal branch name, but uniqueness by convention is not a concurrency control. Between a remote inventory read and a subsequent ref update, another actor can create the same ref. Likewise, after this publisher creates a ref, another actor can advance or replace it before error cleanup executes. A check-then-act sequence can therefore overwrite a raced ref, and an unconditional delete can remove a ref no longer owned by the failed publisher run.

The security boundary is the Git server's ref update, not a preceding client-side observation. Repository writes must fail closed when the server-side ref state differs from the state the publisher is authorized to modify.

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

## Required ordering invariant

The trusted publisher MUST preserve this order:

1. create the local proposal commit;
2. capture the canonical full `proposal_head` from that commit;
3. atomically create the remote proposal ref with an expected-absence lease;
4. only after successful creation, install cleanup bound to `proposal_head`;
5. create the pull request;
6. clear the error trap after successful PR creation.

A future refactor must not move the trap before the creation push, replace the explicit lease with plain `--force`, or recover an expected value from a mutable remote-tracking ref.

## Verification contract

`test/hourly-product-development-publisher-lease.test.ts` is the executable regression contract. It requires the explicit expected-absence creation lease, exact proposal-head capture before the push, exact-head cleanup lease, and trap installation after successful creation. It also forbids the predecessor `git ls-remote --exit-code --heads` authorization pattern, unguarded creation push, and unconditional `git push origin --delete` cleanup.

The integrated head is acceptable only after the exact PR head, not a synthetic merge ref or predecessor head, passes CI, security, production statement/branch/function/line coverage, substantive review, and repository governance. Pending, queued, skipped-required, cancelled, stale-head, or status-only evidence is not success.

## Operational constraints

The publisher remains the isolated Maintainer App stage and must retain least-privilege repository permissions. No `.github/workflows/repair-*`, self-modifying Action, branch-patching workflow, `GITHUB_TOKEN` write fallback, protection bypass, or synthesized approval may be introduced to implement or repair this invariant.

A trusted local checkout used for equivalent maintenance must have a clean worktree/index, exact expected base and head, verified remote repository identity, and isolated credentials. Existing refs require an explicit expected-old SHA; newly created refs require atomic expected absence.

## Primary-source rationale

Git's explicit `--force-with-lease=<refname>:<expect>` form conditions a forced ref update on the destination still having the caller-specified expected value. The Git documentation also warns that lease forms which infer expectations from remote-tracking state can interact badly with background fetches; Noema therefore uses the explicit expected value rather than an inferred one. GitHub's Actions secure-use guidance recommends least-privilege workflow credentials and treating workflow automation as a security-sensitive trust boundary. These sources support the project decision to make the server-side compare-and-update operation, rather than a preceding inventory read, the publication authority.

## References (APA 7th)

Git Project. (2026). *git-push documentation (Version 2.53.0).* https://git-scm.com/docs/git-push/2.53.0.html

GitHub, Inc. (2026). *Secure use reference: GitHub Actions.* https://docs.github.com/en/actions/reference/security/secure-use
