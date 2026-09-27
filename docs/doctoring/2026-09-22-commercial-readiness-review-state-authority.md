# Commercial readiness review-state authority

Status: Proposed  
Date: 2026-09-22  
Owner boundary: Noema commercial merge-admission only

## Problem

Noema consumes two review-state paths as merge-admission evidence. `parseNoemaReviewDecision()` binds the trusted Noema App decision to the exact current `commit_id`; `latestReviewStates()` aggregates ordinary review decisions so unresolved `CHANGES_REQUESTED` evidence remains a blocker.

Both paths previously normalized platform-supplied identity. The direct Noema path converted `review.state` with `toUpperCase()`, allowing `approved` to become canonical `APPROVED`. After that repair, the aggregate path still trimmed reviewer login and uppercased review state, so a later malformed observation such as reviewer `" human-reviewer "` plus state `"dismissed"` could collapse onto canonical reviewer `human-reviewer` and delete a real `CHANGES_REQUESTED` blocker. Platform review identity is authority evidence, not presentation text; normalization must not manufacture equivalence.

## Constraints

- Preserve exact current-head binding through `review.commit_id === expectedHeadSha` for the trusted Noema decision.
- Preserve the trusted Noema GitHub App identity and `Reviewer credential: noema-github-app` marker contract.
- Preserve chronological aggregation semantics without letting malformed reviewer/state identity replace or dismiss canonical evidence.
- Keep issue #27 ruleset/control-plane ownership and issue #29 App identity/eligibility ownership outside this lane.
- Keep the owned production Docstring contract at 100% for every authority-bearing function behaviorally changed by this PR.
- Do not self-approve, weaken hosted gates, or treat source repair as merge authority.

## Decision

Direct Noema decision authority:

- RED `94fbf94cd6d5e513879d84d87d0b75049e2d1f37` adds an exact-head trusted review whose body and `commit_id` are canonical but whose platform state is lowercase `approved`. The predecessor promoted it to approval.
- GREEN `9ad9f44fa2487df05bc0758a2b1ca41cd3604c2e` removes review-state case normalization from `parseNoemaReviewDecision()`. Only exact platform `APPROVED` or `CHANGES_REQUESTED` can agree with the reviewer-authored decision marker.

Aggregate blocker authority:

- RED `b81a341534723f692de124d24f38f25fa7408b0e` adds a canonical `human-reviewer` `CHANGES_REQUESTED` followed by malformed reviewer/state identity `" human-reviewer "` / `"dismissed"`. The predecessor trimmed/case-folded the second observation and deleted the canonical blocker.
- Scope RED `a5870164f8a4f215f8f2a4da8b3b025d68f30200` adds `latestReviewStates()` to the executable production-docstring scope before the docstring contract contains it.
- GREEN `80280e4ab73abe6833fa7b00cbcffa95af8de52a` preserves reviewer login and state exactly in `latestReviewStates()` and adds the decision-oriented JSDoc required by the owned production contract. Non-canonical reviewer/state lookalikes remain distinct or ignored; they cannot replace or dismiss canonical decisions.
- Contract GREEN `c3aabb888235ede41a5674b8b9a0be9201b2be74` extends the direct production-docstring oracle to `latestReviewStates()`. The executable authority-bearing scope is now hourly 19 + evaluator 8 + main-governance 9 = **36 functions**.

The production repair does not change check/workflow provenance, target PR/head/base identity, required App identity, review `commit_id` binding, normal-merge admission, foreign-owner boundaries, or release authority.

## Alternatives considered

**Continue normalizing platform review identity.** Rejected because trim/case-fold can manufacture equivalence between distinct observations and erase a blocker.

**Trust only reviewer-authored Noema markers.** Rejected because GitHub review state and `commit_id` are independent platform evidence that must agree with content markers.

**Reject every malformed review object with a whole-loop operational error.** Not selected here. The minimal causal repair keeps malformed non-authoritative observations from overriding canonical review evidence while preserving the existing collection contract. A stricter completeness policy would need its own hostile contract and operator impact analysis.

**Change chronology handling in the same repair.** Rejected as scope creep. GitHub documents list-reviews output as chronological; `chronologicalReviewOrder()` remains a separate authority path whose malformed/missing timestamp behavior should be tested independently before mutation.

## Risk and follow-up

The direct trusted-review path and general blocker aggregation no longer case-fold or trim authority-bearing review state/login identity. Missing/invalid review chronology remains the next separately testable review-evidence risk; it is not claimed solved here.

Hosted checks and a qualifying independent review remain revision-scoped. The final unchanged successor head must still obtain terminal hosted GREEN and fresh independent current-head evidence before Ready/normal merge.

## TRACEABILITY

GitHub. (2026). *REST API endpoints for pull request reviews*. GitHub Docs. Retrieved September 22, 2026, from https://docs.github.com/en/rest/pulls/reviews?apiVersion=2026-03-10

Relevant contract: pull-request reviews are API objects grouped with a state, and the list-reviews operation returns reviews in chronological order. Noema therefore treats the returned reviewer/state serialization as authority-bearing evidence instead of case-folding or trimming it into another identity.
