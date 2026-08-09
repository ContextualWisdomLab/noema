# ADR-0011: Independent reviewer governance

- **Status:** Proposed
- **Decision owner:** Noema repository governance
- **Operational owners:** issue #27 (enforceable `main` ruleset) and issue #29 (Reviewer/Maintainer App identity and eligibility)

## Context

Noema intentionally separates deterministic checks, scanner evidence, commit statuses, model judgement, and formal review authority. That separation is incomplete unless the repository also defines what a qualifying human-or-approved-machine review is and when it may authorize a protected merge.

GitHub rulesets can require a positive approving-review count, dismiss stale approvals when reviewable commits are pushed, require the most recent reviewable push to be approved by someone other than the pusher, and require review-thread resolution. GitHub also prevents a pull-request author from approving their own pull request. These platform controls are the enforcement substrate; Noema repository logic must not synthesize equivalent approval from weaker evidence classes.

## Decision

Noema treats **eligible independent non-author approval** as a distinct merge-governance authority.

A counted approval must be a **formal GitHub review** in state `APPROVED`, submitted by an identity that is eligible under the live repository or organization policy for the exact current pull-request head. Reviewer eligibility must be established from live repository/team/App permissions and the applicable ruleset, not inferred from a username, comment text, reaction, model output, or prior successful review.

The following never qualify as approval:

- `COMMENTED`, `REQUEST_CHANGES`, dismissed, author, or predecessor-head review evidence;
- a successful check run;
- a successful commit status;
- scanner output or uploaded SARIF by itself;
- model judgement, including CodeRabbit, OpenCode, Strix, or another reviewer model unless that identity also submits a qualifying formal GitHub review under the live policy;
- issue/PR comments, reactions, labels, or body text that merely assert approval;
- queued, pending, skipped, cancelled, absent, stale, or synthetic-only evidence.

When the exact head changes, Noema must treat predecessor review evidence as stale. If the live ruleset is configured to dismiss stale approvals, that platform state is authoritative. Even when GitHub retains an earlier approval, Noema may still require a fresh exact-head review when repository policy or the changed risk surface makes the predecessor review non-authoritative. A stale approval is never silently promoted to exact-head evidence.

Missing approval alone is not sufficient reason to stop an execution run. The loop must first prove that live policy actually requires approval, inspect requested reviewers/teams and unresolved threads, verify reviewer eligibility where possible, and exhaust legitimate autonomous counted-review routes without provisioning broad write authority merely to manufacture approval. A previously rejected non-collaborator route remains disproven until its eligibility changes.

If deterministic product, security, dependency, documentation, and governance work remains executable, the missing approval blocks only that merge. Only when qualifying approval is literally the sole remaining substantive gate may it be classified as an external-only dependency.

Noema must **fail closed** when approval state, reviewer eligibility, ruleset applicability, exact-head identity, or stale-review semantics are unknown or contradictory.

## Consequences

### Positive

- Merge authority cannot be manufactured from check run, commit status, scanner, or model evidence.
- Review provenance remains auditable for buyers and operators.
- Reviewer/App provisioning stays least-privilege and purpose-bound.
- Stale-head review evidence cannot survive a source change by accident.
- Issue #27 can audit a generic independent-approval rule without requiring CODEOWNERS, while issue #29 separately proves the exact reviewer identities and App eligibility used operationally.

### Costs and limitations

- A solo-maintainer repository can remain intentionally unmergeable until an eligible independent reviewer or approved reviewer App exists.
- Repository automation cannot compensate for missing GitHub governance by self-approval or by lowering review requirements.
- Reviewer availability becomes an explicit external operational dependency after all repository-owned work is exhausted.

## Acceptance

This ADR remains `Proposed` until protected `main` has live evidence that:

1. the applicable ruleset requires at least one approving review;
2. stale-review behavior and review-thread resolution are configured as intended;
3. the qualifying reviewer identity is independently eligible and is not the pull-request author;
4. a source-changing push invalidates predecessor approval as required;
5. `COMMENTED`, check run, commit status, scanner, and model judgement evidence cannot satisfy the approval gate;
6. direct push, force push, deletion, and break-glass behavior satisfy issue #27; and
7. reviewer/Maintainer App identity, scope, activation, and rollback evidence required by issue #29 is retained separately from the approval itself.

## References

GitHub. (2026). *Available rules for rulesets*. GitHub Docs. https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets

GitHub. (2026). *Approving a pull request with required reviews*. GitHub Docs. https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews

GitHub. (2026). *REST API endpoints for rules*. GitHub Docs. https://docs.github.com/en/rest/repos/rules?apiVersion=2026-03-10
