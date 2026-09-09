# ADR 0016 — Avoid repository Git conversion execution in acquisition preflight

- Status: Proposed
- Date: 2026-09-10
- Owners: Noema acquisition / buyer-evidence boundary
- Related: #575, #576

## Problem

Noema's acquisition preflight authenticates an exact local Git checkout before buyer data-room evidence is generated. The protected implementation already suppresses hooks, fsmonitor, external diff and textconv, verifies index hints and staged state, and recomputes each tracked file's Git blob identity from `O_NOFOLLOW` descriptor-bound raw bytes against the immutable exact-HEAD tree.

The remaining `git diff-files` defence-in-depth call is not side-effect-free for an untrusted repository. Git attributes may assign a `filter` driver whose `clean` command, or long-running `process` command, participates in worktree-to-index conversion. A same-size tracked-byte change can therefore cause Git to start repository-configured code before Noema's later raw-byte verifier rejects the checkout. Rejecting the checkout after helper execution is too late for this trust boundary.

This is narrower than a claim that every Git command or arbitrary hostile `.git` database is safe. The acquisition path still assumes a trusted Git executable, trusted object database/checkout provisioning boundary, and exact local commit identity.

## Constraints

- Do not blacklist individual filter names or mutate the source repository's configuration.
- Do not weaken exact-HEAD, staged-index, unsafe-index-flag, mode/symlink, descriptor-race, byte-limit or raw-blob authentication.
- Intentionally untracked retained acquisition artifacts remain permitted.
- No credentials, network access or external helper authority is required for verification.
- This decision is local to Noema acquisition integrity; it does not create quarantine, outbound, provider-routing or product-domain authority.

## Decision

Remove the worktree `git diff-files` comparison from production acquisition preflight.

The canonical sequence is:

1. resolve and optionally match exact `HEAD`;
2. reject `skip-worktree` / `assume-unchanged` index hints;
3. compare the mutable index to exact HEAD with `git diff --cached --no-ext-diff --no-textconv`;
4. enumerate the immutable exact-HEAD tree with `git ls-tree`;
5. open every admitted tracked regular file with `O_NOFOLLOW`, bind path/descriptor metadata before and after the read, enforce mode and byte limits, recompute Git blob identity from raw bytes, and compare it to the exact tree object ID;
6. re-check unsafe index hints;
7. resolve `HEAD` again and require it to remain unchanged.

No worktree-aware Git conversion command is used to decide whether current checkout bytes match the immutable commit. Raw descriptor bytes are the worktree authority.

## Alternatives

### Keep `diff-files` and disable known filters

Rejected. Git configuration and attributes are extensible; a blacklist is incomplete by construction and risks recurring execution sinks.

### Clear `.gitattributes` or `.git/info/attributes`

Rejected. Mutating the repository being authenticated changes evidence and still leaves other attribute/config sources and future mechanisms to reason about.

### Keep `diff-files` because raw verification eventually fails

Rejected. Fail-closed result semantics do not undo a helper process that already executed.

### Avoid Git entirely

Rejected for this scoped repair. Noema still needs immutable commit/tree/object identity from the trusted local Git object database. The decision instead minimizes Git operations that consult worktree conversion policy while keeping the existing independent raw-byte authenticator.

## Verification

A hostile real-Git regression uses a temporary repository and a marker-only clean filter. The tracked file changes from `base\n` to same-size `evil\n`. On the predecessor implementation, hosted CI reaches the new test and fails because the configured helper runs before raw-byte rejection. The repaired implementation must reject the checkout for raw-byte mismatch while the marker remains absent.

Existing staged drift, unsafe index hints, stat-cache-hidden drift, raw content hash, symlink/mode, exact-head movement and retained-untracked-evidence regressions remain required.

## Risks and follow-up

Removing `diff-files` deliberately reduces duplicated worktree checking, so the descriptor-bound raw-byte verifier is no longer merely secondary defence: its complete tracked-tree enumeration, path/mode checks and exact blob recomputation are mandatory production authority. Future optimization must not replace it with cached stat equality or mutable index object IDs.

The wider question of commands that can execute through a malicious Git database remains outside this ADR. If acquisition begins accepting repositories whose `.git` database itself is untrusted, define a stronger provisioning/quarantine boundary rather than broadening this patch by assumption.

## References

Git project. (n.d.). *gitattributes*. https://git-scm.com/docs/gitattributes

Rosales, F. (2026, September 1). *GitSpawn: A single flaw lets untrusted repos run code in Claude Code, Codex, Cursor, and Grok*. Manifold Security. https://www.manifold.security/blog/ai-coding-agents-git-hijack
