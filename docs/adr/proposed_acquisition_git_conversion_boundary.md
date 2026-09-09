# ADR NOEMA-20260909-575: Acquisition preflight without executable worktree conversion

Status: Proposed

Decision owner: Noema acquisition evidence boundary

Finding: #575

Source examined: `main@e19e8a67cb02d30876a6f33795213591284e3ddb`; preflight blob `0becb82ed7a1b15d735c991f0d0f5aa689babb93`.

## Problem and constraints

A data-room manifest or governance audit may inspect a locally modified checkout before releasing evidence. Rejecting a bad hash is insufficient if the inspection itself executes repository-configured programs first. The preflight disabled hooks, filesystem monitors, external diff and text conversion, but still called `git diff-files`. Git clean/process conversion is a separate mechanism.

A credential-free temporary-repository regression on Linux, Git 2.47.3 and Node 22.16.0 demonstrated helper execution for equal-length replacement and unchanged rewritten bytes. Both tracked `.gitattributes` and higher-priority `.git/info/attributes` were exercised. Each helper only writes a marker in that temporary repository. The prior `base\n` versus `tampered\n` test did not exercise this path reliably because differing sizes can bypass conversion.

This local finding is independently verified. It is not an identification of the undisclosed non-fsmonitor setting in Manifold's GitSpawn report.

## Alternatives

1. Keep worktree diff with fsmonitor/hooks and ext-diff/textconv overrides. Rejected: the regression demonstrates side effects despite these controls.
2. Enumerate filter names and override each one. Rejected for this boundary: names and configuration sources are not a stable authority, and validation should not need to activate repository-controlled conversion.
3. Rewrite `.git/config` or `.gitattributes` before inspecting. Rejected: mutating the submitted evidence destroys provenance and can race another writer; global attribute settings also do not override all local attributes.
4. Create a separate trusted Git control directory. Appropriate for a future hostile-artifact admission runtime, but larger than this existing raw-byte authenticity repair. Noema must not duplicate the quarantine runtime's owner implementation.
5. Remove worktree conversion and use the existing immutable-tree/descriptor-bound verifier. Selected.

## Decision

Remove the `diff-files` subprocess from `verifyAcquisitionTrackedCheckout`. Preserve all of:

- local exact commit resolution before and after verification;
- rejection of unsafe index hints before and after verification;
- staged index versus exact HEAD comparison;
- expected blob IDs from the immutable commit tree, not mutable stage-zero entries;
- bounded descriptor reads with no-follow, metadata and executable-mode checks;
- local Node hashing of Git blob framing and raw bytes;
- refusal of unsupported modes, path escapes, byte drift and resource-limit violations;
- intentionally untracked retained evidence, without treating it as source authority.

No new provider, network access, credential, dependency or runtime language is introduced. Public function signatures are unchanged. Worktree drift is now reported by the raw-byte authenticator; dependent tests must assert that boundary rather than the removed diff exit code.

## Verification

`test/acquisition_git_conversion_boundary.test.ts` contains thirteen real-Git cases: eight conversion variants and five integrity/compatibility controls. The locally adapted Node test runner recorded original 5 PASS / 8 FAIL and patched 13 PASS / 0 FAIL / 0 SKIP. The original source blob was checked before running the regression. The adaptation changes Vitest test registration to `node:test` and removes two TypeScript parameter annotations; it does not replace Git or the production verifier.

Existing preflight sequence doubles remove only the deleted comparison result. Governance's subprocess double now supplies a deliberately mismatched immutable-tree blob for the existing tracked-source failure test, so it exercises the real raw-byte verification instead of simulating the removed worktree command. The original filter regression now uses equal-length drift and retains the no-execution assertion.

Required release evidence remains outstanding until the exact final PR head passes the complete repository Vitest/typecheck/coverage, raw-byte/stat-cache/mutable-index tests, security workflows and independent review. Local focused success is not release authority.

## Trust boundary and residual risk

The Git executable, Node runtime, checkout provisioner and local object database remain trusted prerequisites. This narrow repair is not permission to open arbitrary archive-supplied `.git` metadata on a credentialed host. Shared-directory/archive admission, initial agent startup, IDE watchers, dependency installation, browser-triggered OS execution and other Git callers need their own owner-controlled isolation and versioned contracts.

The source tree must remain stable under the existing single-writer/checkout contract. Descriptor checks reduce file replacement races; this ADR does not claim a filesystem snapshot against a privileged hostile writer.

## Integration and rollback

The branch must integrate normally after required exact-head evidence and independent review; do not force-push or bypass the gate. Shared root architecture, AGENTS/CLAUDE and `docs/product-technical-gap-baseline.md` remain with their active writers; deliver #575 evidence rather than overwrite their files. PR #574 external-extension lifecycle is a separate owner lane.

If compatibility fails, repair the verifier or retain a fail-closed release posture. Do not restore executable worktree conversion as an automatic fallback. A helper-execution observation requires environment isolation and credential/artifact exposure assessment, not merely clearing a failing audit status.

## References

Git Project. (n.d.). *gitattributes*. https://git-scm.com/docs/gitattributes

Git Project. (n.d.). *git-ls-tree*. https://git-scm.com/docs/git-ls-tree

Rosales, F. (2026, September 1). *GitSpawn: A single flaw lets untrusted repos run code in Claude Code, Codex, Cursor, and Grok*. Manifold Security. https://www.manifold.security/blog/ai-coding-agents-git-hijack
