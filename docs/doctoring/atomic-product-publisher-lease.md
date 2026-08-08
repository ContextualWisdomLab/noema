# Atomic product-publisher ref and pull-request lease

## Status and scope

Reviewed on 2026-08-08. This decision record applies only to the credential-bearing `publish_product_increment` stage in `.github/workflows/hourly-product-development.yml`. It does not grant merge, release, deployment, or review authority and does not change the NVIDIA NIM/OpenCode or reviewer credential contracts.

The scheduler publishes at most one bounded proposal after an uncredentialed runner has re-executed the complete release verification. Publication still crosses two mutable GitHub objects: a branch ref and a pull request. Both objects therefore require server-observed identity checks and fail-closed cleanup before the run may report success.

## Test-first lineage

The first RED head, `1a7a6eea0e4345f45d743efee9070d2265c779df`, rejected the former `ls-remote` → unguarded push → unconditional delete sequence. The implementation at `f60c4d93fe54cff211675b47c0f6a0950aadf8bd` replaced it with explicit expected-absence creation and exact-head deletion leases. Head `16941a9139bc154403410bd22ee6c6e19c96e3ed` aligned the predecessor ordering contract with the leased mutation; all 646 tests and configured production statement, branch, function, and line coverage then passed, while the inherited vulnerable `nanoid` resolution correctly kept the security gate RED.

The second RED head, `7f210d08b39d624f0c55c70baec62fcf0b4dc5a5`, required a server-side read of the newly created pull request and exact equality between its head/base commit identities and the verified proposal head/base. Head `048bffed4a3e76790bf27c2ac96743889eceafc8` implemented that boundary.

The third RED head, `a2da363eb40dfe4723475605a67a84c93bb16bcb`, added two realistic failure contracts. It required recoverable numeric pull-request identity when the create response is absent or malformed after possible server-side success, and it required a fully paginated open-pull-request inventory after creation before the cleanup trap is cleared. Exact-head CI run `31257674758` installed with zero vulnerabilities, passed all 649 predecessor tests, and failed only the two new security contracts. Subsequent implementation replaced `gh pr create` URL parsing with the machine-readable REST response, installed marker-based numeric cleanup before the create request, and added the post-create queue gate. Exact-head CI run `31257970650` passed the complete `release:verify` chain after the executable contracts were aligned with the REST publisher.

PR #80 remains stacked on PR #76 (`fix/nanoid-cve-2026-67213`). Synthetic merge-ref evidence is integration evidence only and is never substituted for exact-head acceptance.

## Threat model

### Branch-ref race

A run-unique branch name is a naming convention, not a concurrency control. Another actor can create the same ref after an inventory read, or advance the publisher-created ref before error cleanup. A check-then-act push can overwrite a raced ref, and an unconditional delete can remove a ref the failed run no longer owns.

### Pull-request commit race

A pull request is opened from a branch name, but the scheduler authorizes one exact proposal commit and one exact base commit. Successful command completion does not prove that GitHub bound the PR to those commits. The publisher must re-read the server object and compare `head.sha` and `base.sha` with the previously verified identities.

### Lost or malformed create response

A network or client-output failure can occur after GitHub has accepted `POST /pulls`. If cleanup depends on a returned URL, the run can lose the identity of a PR it actually created and leave an unverified proposal open. The cleanup path therefore needs an independent, unguessable correlation marker and a bounded server-side recovery query.

### Concurrent PR queue race

The scheduler starts only when the open-PR queue is empty, but another actor can open a PR while generation and verification are running. Even after this run creates its own PR, publication is not accepted until a fully paginated inventory proves that the created PR is the only open PR. The check narrows the race window without pretending to provide a repository-wide lock.

## Decision

### 1. Atomically create the proposal ref

Proposal-branch creation MUST use an explicit expected-absence lease in the same push that creates the ref:

```sh
proposal_head="$(git rev-parse HEAD)"
git push --force-with-lease="refs/heads/${branch}:" \
  origin "HEAD:refs/heads/${branch}"
```

The empty expected value authorizes creation only while the destination is absent. `git ls-remote` MUST NOT be used as write authority.

### 2. Delete only the exact ref created by this run

After the expected-absence push succeeds, cleanup MUST delete the branch only while it still equals `proposal_head`:

```sh
cleanup_remote_branch() {
  git push \
    --force-with-lease="refs/heads/${branch}:${proposal_head}" \
    origin ":refs/heads/${branch}" >/dev/null 2>&1 || true
}
trap cleanup_remote_branch ERR
```

If another actor advances, replaces, or recreates the branch, cleanup must fail harmlessly and preserve that foreign state.

### 3. Create the PR through the machine-readable REST endpoint

The publisher MUST create the PR with `POST /repos/{owner}/{repo}/pulls`, not parse human-oriented CLI output. Before the request it generates a 256-bit nonce, appends the nonce as a hidden marker to the bounded PR body, and writes the request document with owner-only permissions.

```sh
publication_marker="noema-publication-${marker_nonce}"

gh api --method POST \
  "repos/${GITHUB_REPOSITORY}/pulls" \
  --input "$pr_request_file"
```

The response `.number` must be a positive integer. A URL is derived only after that numeric identity is known.

### 4. Arm recoverable cleanup before the create request

The pull-request cleanup trap MUST be active before `POST /pulls`. If the response is missing, malformed, or the request reports failure after possible server-side success, cleanup performs a fully paginated query scoped to the exact repository owner and branch. Each candidate is re-read and must match all three independent properties:

- `head.sha == proposal_head`;
- `base.sha == expected_base`;
- the body contains this run's 256-bit publication marker.

Exactly one candidate is required. Ambiguous, malformed, or unavailable evidence is never guessed. When a positive integer PR number is recovered, cleanup closes only that PR through `PATCH /pulls/{number}` and then attempts the exact-head branch-deletion lease.

### 5. Rebind the created PR to exact server identity

Before acceptance, the publisher re-reads `GET /pulls/{number}` and requires canonical full commit SHAs:

```sh
created_pr_json="$(gh api \
  "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}")"
live_pr_head="$(jq -r '.head.sha // empty' <<<"$created_pr_json")"
live_pr_base="$(jq -r '.base.sha // empty' <<<"$created_pr_json")"

[ "$live_pr_head" = "$proposal_head" ]
[ "$live_pr_base" = "$expected_base" ]
```

Missing, malformed, or mismatched evidence is a publication failure and keeps cleanup armed.

### 6. Revalidate the complete open-PR queue

After exact PR identity validation, the publisher MUST paginate the entire open-PR inventory with `per_page=100`. The resulting numeric sequence must contain exactly one value, equal to `pr_number`. An absent inventory, another open PR, a duplicate or malformed number, or any other mismatch produces `created_pull_request_queue_conflict` and invokes cleanup.

Only after exact branch ownership, exact PR commit identity, and the full queue gate all succeed may the publisher execute the final `trap - ERR` and report success.

## Required ordering invariant

The trusted publisher MUST preserve this order:

1. verify the exact proposal base and create the local proposal commit;
2. capture canonical `proposal_head`;
3. atomically create the remote ref with an expected-absence lease;
4. install exact-head remote-ref cleanup;
5. create an unguessable publication marker and bounded REST request;
6. install recoverable numeric PR cleanup before `POST /pulls`;
7. create the PR and parse or safely recover one positive integer PR number;
8. re-read that exact PR and require `head.sha == proposal_head` and `base.sha == expected_base`;
9. fully paginate open PRs and require the created PR to be the only open PR;
10. clear cleanup only after every preceding check succeeds.

A future refactor MUST NOT replace explicit leases with inferred remote-tracking expectations, return to `gh pr create` output parsing, arm PR cleanup only after parsing the create response, close a URL or guessed PR, use a non-paginated queue query, or clear cleanup before the exact identity and queue checks finish.

## Verification contract

`test/hourly-product-development-publisher-lease.test.ts` requires:

- expected-absence branch creation;
- exact-head branch cleanup;
- a machine-readable REST create request;
- a run-unique publication marker;
- recoverable numeric cleanup armed before creation;
- numeric `PATCH` closure rather than URL-based cleanup;
- exact server-side head/base guards;
- a fully paginated post-create queue inventory;
- trap clearing only after every guard.

`test/hourly-product-development-workflow.test.ts` separately binds the broader proposal, verification, and publication ordering to the REST publisher and rejects reintroduction of `gh pr create`.

The integrated head is acceptable only after the exact PR head—not a synthetic merge ref, predecessor head, or stale base—passes CI, security, production statement/branch/function/line coverage, substantive review, and repository governance. Pending, queued, skipped-required, cancelled, absent, stale-head, neutral-required, or status-only evidence is not success.

## Operational constraints

The publisher remains the isolated Maintainer App stage and must retain least-privilege repository permissions. No `.github/workflows/repair-*`, self-modifying Action, branch-patching workflow, `GITHUB_TOKEN` write fallback, protection bypass, or synthesized approval may be introduced.

A connector-backed maintenance write is acceptable only when the exact PR head and current file blob SHA are re-read immediately before the write, the complete fetched bytes receive a deterministic minimal transformation, unrelated diff is excluded, and stale blob identity rejects another writer's intervening change. The `409` stale-blob rejection observed during this change confirmed that this normal contents-API path provides real optimistic concurrency rather than requiring a repair workflow.

## Primary-source rationale

Git's explicit `--force-with-lease=<refname>:<expect>` conditions a ref update on the destination still matching the supplied expectation. Git warns that lease forms inferred from remote-tracking state can be invalidated by background fetches, so Noema carries explicit identities.

GitHub's pull-request REST API returns a structured PR object from creation, supports filtering the list endpoint by head, supports pagination, exposes server-side head/base commit identities, and permits closing a known PR by updating its state. Those primitives allow the publisher to recover identity without parsing human output, reject ambiguous evidence, and close only the object correlated to this run.

NIST SSDF treats CI/CD automation, integrity evidence, and least privilege as secure-development controls. The scheduler therefore refuses privileged workaround workflows and makes every publication claim depend on observable server evidence.

## References (APA 7th)

Git Project. (2026). *git-push documentation (Version 2.53.0).* https://git-scm.com/docs/git-push/2.53.0.html

GitHub, Inc. (2026). *REST API endpoints for pull requests.* https://docs.github.com/en/rest/pulls/pulls

GitHub, Inc. (2026). *Secure use reference: GitHub Actions.* https://docs.github.com/en/actions/reference/security/secure-use

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
