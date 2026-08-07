# Doctoring: Acquisition Git Worktree Binding

## Decision

Noema's acquisition exact-checkout preflight must bind Git's effective working tree to the exact checkout directory whose retained evidence is being audited. A clean Git comparison against any other filesystem tree is not evidence that the audited checkout matches the claimed commit.

The preflight therefore sets `GIT_WORK_TREE` to the resolved command `cwd` for every bounded Git read. This is additive to the existing isolation of system/global configuration, hooks, fsmonitor, untracked cache, replacement objects, lazy fetches, terminal prompts, unsafe index hints, and exact-HEAD movement.

## Threat model and test-first evidence

Git permits `core.worktree` in repository-local configuration to point at a path different from the directory containing `.git`. Without an explicit worktree binding, commands launched with `cwd=/audited/repository` can still compare the shared index and commit against `/different/path`. An attacker or accidental local configuration could therefore leave `/different/path` clean while changing tracked bytes under the acquisition process's actual `cwd`. Evidence readers would inspect one tree while Git authenticated another.

The regression test constructs that boundary with a real repository: it commits `tracked.txt`, creates a separate clean decoy tree, writes repository-local `core.worktree` to the decoy, then tampers the tracked file in the audited repository directory. Before the production change the exact-checkout verifier returned success, producing the intended RED test. With `GIT_WORK_TREE=<resolved audited cwd>`, Git's tracked-byte comparison is forced back to the same filesystem tree used by the acquisition entrypoints, so the tampering is rejected.

This control does not claim that `GIT_WORK_TREE` authenticates the Git executable, object database, or bootstrap JavaScript itself. Those remain part of the documented trusted checkout/runtime boundary and independent protected-branch, CI, release, and provenance controls.

## Primary-source rationale

Git 2.54.0 documents `core.worktree` as the configuration that sets the root of the working tree and explicitly warns that a value stored in `/path/to/.git/config` may point to `/different/path`; Git commands run in `/path/to` will then still use `/different/path`. The same documentation states that `GIT_WORK_TREE` or `--work-tree` overrides `core.worktree`. The current `git` command documentation likewise defines `--work-tree` and `GIT_WORK_TREE` as controls for the working-tree path.

Noema uses the environment form because every Git subprocess already receives a deliberately reconstructed, bounded environment. Binding that environment to `resolve(cwd)` makes the security property explicit and applies uniformly to exact-commit resolution, index inspection, and tracked-state comparison without accepting ambient worktree configuration.

## Acquisition invariant

For an acquisition preflight to authorize an exact source identity, all of the following must remain true:

- Git object resolution remains local-only and exact.
- The effective Git working tree equals the resolved acquisition command `cwd`.
- `skip-worktree` and `assume-unchanged` are absent before and after tracked comparison.
- The tracked tree has no staged, unstaged, or deleted differences from the exact commit.
- The exact HEAD does not move during verification.
- The complete preflight is repeated after retained evidence reads.

Failure of any item is a fail-closed evidence-integrity failure; it cannot be converted into review approval, release acceptance, or acquisition readiness.

## APA 7th references

Git Project. (2026). *Git documentation: git*. https://git-scm.com/docs/git

Git Project. (2026). *Git documentation: git-config (version 2.54.0)*. https://git-scm.com/docs/git-config/2.54.0
