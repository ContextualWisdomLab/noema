# ADR-0008: Publish autonomous proposals as an identity-bound transaction

- **Status:** Proposed
- **Implementation owner:** PR #80
- **Scope:** autonomous product-development branch and pull-request publication

## Context

A generated proposal crosses multiple mutable GitHub boundaries. A branch name that was absent during an inventory read can be created by another actor before push. A branch created by this run can be advanced before failure cleanup. Pull-request creation can succeed while its response is lost or malformed, and a mutable branch can change between ref creation and the PR transaction. Treating CLI command success as publication proof risks overwriting or deleting another actor's state or accepting a PR bound to a different source/base.

## Decision

Proposal publication is accepted only after server-observed identities prove the run owns the complete transaction.

Required ordering:

1. capture immutable proposal base and proposal commit;
2. create the remote proposal ref with expected-absence compare-and-update semantics;
3. arm cleanup bound to the exact proposal commit;
4. create the PR through a machine-readable API with a run-unique unguessable marker;
5. recover a lost create response only when exactly one candidate matches repository, branch, marker, exact head and exact base;
6. re-read the created PR and require server-side `head.sha` and `base.sha` equality;
7. fully paginate the open-PR queue and reject an unexpected concurrent proposal;
8. only then disarm cleanup and report publication success;
9. failure cleanup may close/delete only the exact PR/ref the run can prove it owns.

No unguarded create push, unconditional branch delete or human-oriented CLI-output parsing is accepted as write authority.

## Consequences

- rare API ambiguity fails closed rather than assuming success;
- another actor's raced or advanced branch is preserved;
- publication performs additional GitHub reads but gains auditable ownership evidence;
- the model/verifier/publisher trust-domain split remains intact.

## Verification

PR #80 owns the RED/GREEN publisher-lease, lost-response, server identity and queue-race regression tests plus detailed Git/GitHub primary-source doctoring. This ADR remains Proposed until that implementation is protected-merged and operationally exercised.
