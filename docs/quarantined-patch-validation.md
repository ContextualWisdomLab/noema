# Quarantined patch validation

Noema can validate an untrusted text patch against a bounded source snapshot without exposing repository write credentials, reviewer-model credentials, NVIDIA NIM credentials, Cloudflare credentials, OIDC tokens, publication credentials, or the Docker socket to the code being tested.

## What this feature does

The trusted reviewer process receives:

- the repository full name;
- the exact base commit SHA;
- the exact head commit SHA;
- the SHA-256 digest of the patch bytes; and
- one approved validation profile.

It performs a strict patch preflight, copies the verified bytes to a private owner-only staging path, materializes the exact requested Git commit into a private source snapshot, starts a digest-pinned validator image with no network access and bounded resources, and accepts only a bounded result artifact that repeats the exact request identity.

The current approved profile is:

| Profile | Command executed inside the validator image |
|---|---|
| `node_release_verify` | `npm run release:verify` |

Callers cannot supply arbitrary shell commands.

## Source identity

When `source_root` is a Git working tree, Noema does not trust the checkout's local Git configuration, index, attributes, hooks, remotes, or worktree-control files as policy inputs. It first resolves the repository or linked-worktree object database through descriptor-safe, bounded Git control-file reads. Symlinks, special files, malformed UTF-8, multiline records, unsafe path characters, missing required directories, and descriptor changes fail closed.

Noema then creates private bare Git control metadata in an owner-only temporary directory. That control directory:

- points only to the resolved content-addressed object database through an alternates file;
- sets `HEAD` to the exact requested `head_sha`;
- disables host system/global Git configuration, optional locks, hooks, fsmonitor, and the untracked cache; and
- installs highest-precedence private attributes that unset `export-ignore` and `export-subst` for every path.

Using that private control directory, Noema runs `read-tree` for the exact requested commit and a non-shell porcelain-v2 status comparison against the caller worktree. It rejects every tracked, staged, untracked, or ignored worktree entry. A mismatched commit, failed status command, malformed control record, unavailable object database, or dirty worktree fails closed before untrusted execution.

The same isolated control directory performs the exact-commit archive operation. This is necessary because ordinary `git archive` can honor both committed `.gitattributes` and repository-local `$GIT_DIR/info/attributes`; without isolation, `export-ignore` could omit a committed test or `export-subst` could rewrite committed blob bytes. The private attribute layer neutralizes both transforms, so the archive represents the raw committed tree rather than caller-controlled export policy.

Before extraction, Noema enumerates every archive member and accepts only normalized repository-relative regular files and populated directories. It rejects links, devices, FIFOs, special entries, `.git` content, path aliases, traversal, absolute or control-character names, duplicate names, file-directory collisions, leaf gitlink-like directories, excessive member counts, oversized files, and excessive aggregate bytes. The current limits are 20,000 members, 64 MiB for one file, and 512 MiB total declared regular-file bytes.

Only the validated member list is extracted through Python's `data` filter into an owner-only temporary directory. Noema then walks the resulting tree with `lstat` and requires the observed paths, entry types, and regular-file sizes to match the prevalidated archive manifest exactly. Docker mounts that verified committed snapshot, not the mutable caller worktree. A worktree mutation after preflight therefore cannot change the bytes received by the validator. Archive failure, malformed data, unsafe or excessive members, extraction substitution, or post-extraction mismatch fails closed before Docker starts.

A source snapshot without `.git` metadata can still be validated, but this module cannot independently prove its commit identity or cleanliness. The trusted caller must authenticate that snapshot through a separate exact-source evidence mechanism before treating the sandbox result as revision-bound evidence.

The request's `base_sha` identifies the patch comparison boundary and is repeated in the result. The current runner does not reconstruct or fetch that base commit and performs no network access.

## Safety model

The source checkout, patch content, repository scripts, and validator output are treated as potentially hostile. For a Git checkout, the mutable worktree is used only by the trusted isolated status comparison; the container receives the private raw committed snapshot mounted read-only. For a non-Git source snapshot, the trusted caller-provided directory is mounted read-only after separate source authentication.

The original patch path is never mounted: after descriptor-safe verification and digest matching, its exact bytes are copied into a private temporary directory and that staged copy is mounted read-only.

For a Git checkout, the private committed snapshot contains only validated regular source files and directories. The runner additionally overlays `/input/.git` with a private empty nested bind mount whose type matches the original checkout metadata: directory-style repositories receive an empty directory mask, and linked-worktree checkouts receive an empty regular-file mask. Untrusted code therefore cannot read checkout tokens, remote URLs, local Git configuration, object storage, or host worktree pointers through the source mount. A symlink or other special `.git` object is rejected before Git or Docker runs.

The container runs as a non-root user with all Linux capabilities dropped, no network, no writable root filesystem, no Docker socket, isolated IPC, and bounded CPU, memory, process, file-descriptor, file-size, tmpfs, and wall-time resources.

The child process receives only the minimum executable path and exact validation identity. GitHub, Noema reviewer, NVIDIA NIM, Cloudflare, OIDC, and publication credentials are intentionally absent.

## Patch rules

A patch is rejected before Docker starts when it is:

- empty, oversized, non-UTF-8, binary, symlinked, unstable, or not a regular file;
- malformed or missing `diff --git` headers;
- changing more than the configured file limit;
- repeating a target path;
- using traversal, an absolute path, raw backslashes, malformed quoted paths, or control characters;
- creating or deleting symlinks or gitlinks;
- redirecting through `---`, `+++`, `rename from`, `rename to`, `copy from`, or `copy to` metadata into a protected path; or
- touching protected governance paths such as `.github/workflows/`, `.github/actions/`, `.git/`, root or documented `CODEOWNERS`, `.gitmodules`, or Dependabot configuration.

These restrictions intentionally keep governance and trust-policy changes out of an automated patch-execution plane. Such changes require the normal protected pull-request path and independent review.

## Result boundary

The container receives exactly one pre-created writable host file mounted at `/output/result.json`; it does not receive a writable host directory. The process-wide `RLIMIT_FSIZE` ceiling is 64 MiB so realistic allowlisted validation tools can create bounded workspace artifacts without being terminated by the 16 KiB evidence limit. Normal stdout and stderr are discarded so hostile output cannot become an unbounded evidence channel or an alternate result path.

The result file is independently read through descriptor-safe regular-file checks and limited to 16 KiB. Its JSON schema:

- rejects unknown fields;
- bounds duration, excerpts, exit code, and reason-code count and syntax;
- requires `PASSED` evidence to report exit code `0`;
- repeats repository, base SHA, head SHA, patch digest, and profile; and
- must report the command baked into the selected profile.

Any missing, malformed, oversized, inconsistent, or identity-mismatched result fails closed. A compatibility fallback exists only for injected test runners that return a bounded stdout string while leaving the pre-created result file empty; the real subprocess path discards stdout and writes the single mounted result file.

## Python API

```python
from pathlib import Path

from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
)

request = PatchValidationRequest(
    repository_full_name="ContextualWisdomLab/noema",
    base_sha="0" * 40,
    head_sha="1" * 40,
    patch_sha256="2" * 64,
    profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
)

result = DockerPatchValidationRunner().validate(
    request=request,
    source_root=Path("/trusted/read-only/source"),
    patch_path=Path("/trusted/read-only/change.patch"),
)
```

The example digest values are placeholders. Production callers must calculate the actual patch SHA-256, bind the real exact base and head commits, and authenticate any non-Git source snapshot independently.

## Required environment

`NOEMA_PATCH_SANDBOX_IMAGE` must contain an independently verified immutable image reference:

```text
ghcr.io/contextualwisdomlab/noema-patch-validator@sha256:<64-lowercase-hex-characters>
```

Mutable tags and images from other repositories are rejected.

This library checks the reference shape and runs with `--pull=never`; it does not itself sign, scan, download, or attest the image. The trusted workflow must separately verify image signature, provenance, vulnerability policy, and real no-network behavior before enabling this boundary in a release path.

## Interpreting results

A returned `PatchValidationResult` is evidence only for the supplied repository, base, head, patch digest, profile, source snapshot, and validator image used by that execution. The caller must reject any identity or command mismatch.

A passed validation does not mean that the pull request is approved or releasable. Merge still requires the repository's protected-branch policy, exact-head required checks, independent approval, security gates, resolved review threads, provenance requirements, and release-acceptance gates.

## Operational failure behavior

The feature fails closed when:

- the image reference is missing or mutable;
- the source or patch cannot be read safely;
- a Git source commit differs from the exact request;
- a Git source contains tracked, staged, untracked, or ignored worktree drift;
- Git metadata, object storage, common-directory records, or isolated status cannot be verified;
- source Git control metadata is a symlink, special file, malformed, unstable, unsafe, or unavailable;
- the exact raw committed source archive cannot be created, bounded, extracted, or verified safely;
- Docker cannot start;
- execution exceeds the wall-time limit;
- the container exits non-zero;
- result JSON is missing, malformed, oversized, inconsistent, or outside schema bounds; or
- the result does not exactly match the request.

Timeout handling attempts a bounded forced container removal. The private committed source snapshot, isolated Git control directory, Git metadata mask, staged patch, and single result file are deleted when validation exits. Infrastructure diagnostics are truncated before being returned.

## Verification

Run the reviewer test and documentation gates:

```bash
cd reviewer
python -m pytest
interrogate --fail-under 100 noema_reviewer
```

Repository CI enforces 100 percent production statement and branch coverage and 100 percent public docstring coverage. Source-integrity tests prove that committed and local export attributes cannot hide tests or rewrite raw blob bytes, mutate the worktree after preflight, and verify that Docker still receives the exact committed tree. Git-control tests cover linked worktrees, malformed control files, descriptor races, missing object directories, failed isolated status, and credential-bearing metadata masking. Archive-boundary regressions cover malformed and empty archives, unsafe and duplicate names, links and special entries, gitlink-like directories, member and byte ceilings, post-extraction type or size substitution, and the valid bounded regular-tree path. Result-channel tests require one pre-created file, no writable host output directory, a 64 MiB process file-size ceiling, and a separate 16 KiB evidence parser ceiling.

A separate trusted workflow must additionally verify, scan, and smoke-test the actual patch-validator image before production integration.

For the design rationale and APA 7th references, see `docs/doctoring/quarantined-patch-validation.md`.
