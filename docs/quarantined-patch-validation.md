# Quarantined patch validation

Noema validates an untrusted text patch against one authenticated Git commit without exposing repository write credentials, reviewer-model credentials, NVIDIA NIM credentials, Cloudflare credentials, OIDC tokens, publication credentials, or the Docker socket to the code being tested.

This boundary produces validation evidence only. It does not approve a pull request, judge a model response, authorize a release, or bypass repository protection.

## Request contract

The trusted caller supplies:

- the repository full name;
- the exact base commit SHA;
- the exact head commit SHA;
- the SHA-256 digest of the patch bytes; and
- one approved validation profile.

The current approved profile is:

| Profile | Command inside the validator image |
|---|---|
| `node_release_verify` | `npm run release:verify` |

Callers cannot provide an arbitrary command.

The current runner requires a Git checkout with verifiable `.git` metadata. A directory without authenticated Git metadata is rejected; it is not treated as revision-bound source evidence.

## Exact source identity

Noema does not trust checkout-local Git configuration, hooks, indexes, remotes, attributes, or worktree-control files as policy inputs. It reads repository or linked-worktree control records through bounded, no-follow descriptor operations and resolves the content-addressed object store. Symlinks, special files, malformed UTF-8, multiline records, unstable descriptors, unsafe paths, and unavailable object directories fail closed.

The runner creates private bare Git control metadata that:

- points only to the resolved object store through `objects/info/alternates`;
- binds `HEAD` to the requested `head_sha`;
- disables system and global Git configuration, hooks, fsmonitor, optional locks, and the untracked cache; and
- installs highest-precedence `* -export-ignore -export-subst` attributes.

Using that private control directory, Noema runs `read-tree` for the exact head and a porcelain-v2 status comparison against the caller worktree. Status output is not accumulated: the trusted host reads at most one byte from a binary pipe. Any byte proves tracked, staged, untracked, or ignored drift, causes immediate bounded child termination, and blocks validation. An empty stream is accepted only when the Git child exits zero within the shared deadline. A failed, timed-out, or malformed Git process is never interpreted as a clean result.

### Prearchive exact-tree bounds

Before allocating archive storage, Noema runs a configuration-isolated command equivalent to:

```text
git ls-tree -r -l -z --full-tree <exact head SHA>
```

The binary stdout stream is parsed incrementally under one 30-second wall deadline. The host retains at most one bounded partial record instead of collecting the full command output. Every NUL-terminated record must describe a `100644` or `100755` blob with a valid SHA-1 or SHA-256 object identity, an ASCII-only decimal byte size, and one canonical repository-relative POSIX path. Its four metadata fields must be nonempty and separated by exactly one ASCII space; repeated spaces, Unicode whitespace separators, and non-ASCII decimal digits fail closed instead of being normalized by Python's Unicode-aware string helpers. The preflight rejects:

- trees above 20,000 records;
- paths above 4 KiB and records above the path ceiling plus fixed metadata allowance;
- aggregate exact-tree metadata above 16 MiB;
- blobs above 64 MiB;
- aggregate blob bytes above 512 MiB;
- tree, gitlink, symlink, or other non-regular object modes;
- malformed, non-UTF-8, empty, or truncated records;
- absolute, traversing, aliased, control-character, backslash, duplicate, or `.git` paths; and
- any Git launch, read, exit, termination, or timeout failure.

The child is terminated as soon as the first record, path, member-count, metadata-byte, per-file, or aggregate-file bound is violated. This gate runs before `git archive`, so an excessive or structurally unsupported tree cannot first consume archive storage or unbounded host memory.

### Archive and extraction bounds

After exact-tree preflight, the isolated control directory creates an exact-commit tar archive. The private attribute layer prevents committed or local `export-ignore` and `export-subst` rules from omitting files or rewriting blob bytes.

The archive is independently treated as hostile. Before extraction, Noema allows only normalized regular files and populated directories. It rejects links, devices, FIFOs, special entries, `.git` content, aliases, duplicate names, file-directory collisions, children below files, empty gitlink-like leaf directories, excessive members, oversized files, and excessive aggregate bytes.

Only the validated member list is extracted through Python's `data` filter into an owner-only temporary directory. Noema then walks the snapshot with `lstat` and requires exact path, type, and regular-file-size equality with the validated archive manifest. Docker receives this verified committed snapshot, not the mutable worktree.

The snapshot contains only a type-compatible empty `.git` placeholder. Directory-style repositories receive an empty directory boundary; linked worktrees receive an empty regular-file boundary. Checkout credentials, remotes, local configuration, object storage, reflogs, and worktree pointers therefore do not enter the container.

## Patch preflight

The original patch is read as a stable, bounded, regular non-symlink file and matched to the request's SHA-256 digest. Its caller-controlled pathname is never passed to Docker; verified bytes are copied to an owner-only staging file and mounted read-only.

A patch is rejected before Docker starts when it is:

- empty, above 4 MiB, non-UTF-8, binary, unstable, symlinked, or not regular;
- missing or malformed `diff --git` headers;
- changing more than 100 files or repeating a target path;
- using noncanonical aliases such as repeated slashes, `.` components, a trailing slash, traversal, absolute paths, raw backslashes, malformed quoting, or control characters;
- creating, deleting, or retaining symlink or gitlink modes;
- declaring malformed, misplaced, conflicting, duplicated, or incomplete file, rename, copy, mode, index, similarity, or hunk metadata;
- redirecting `---`, `+++`, rename, or copy metadata away from the active primary source or target identity;
- using `/dev/null` outside canonical creation or deletion headers; or
- touching `.git/`, `.github/workflows/`, `.github/actions/`, `.gitmodules`, Dependabot configuration, or protected `CODEOWNERS` paths.

File-mode metadata is parsed as a complete line containing one recognized directive and exactly one six-digit mode token. Only `100644` and `100755` are accepted. Exact `120000` and `160000` modes retain the dedicated symlink/gitlink rejection, while trailing or additional tokens such as `new file mode 120000 100644` are rejected as malformed instead of being accepted through suffix matching.

Unified hunk line counts must be consumed exactly. Newline markers are accepted only once after valid hunk content. Truncated hunks, extra content after declared counts, and path metadata after a hunk fail closed.

## Container boundary

`NOEMA_PATCH_SANDBOX_IMAGE` must be an immutable reference in this repository namespace:

```text
ghcr.io/contextualwisdomlab/noema-patch-validator@sha256:<64 lowercase hexadecimal characters>
```

The runner uses `--pull=never`. The trusted release workflow remains responsible for separately building, signing, scanning, attesting, and approving the image.

The container runs with:

- no network and no Docker socket;
- a read-only root filesystem;
- read-only source and patch mounts;
- a non-root host UID/GID;
- all capabilities dropped;
- `no-new-privileges`, seccomp, and isolated IPC;
- bounded PID, CPU, memory, swap, descriptor, process, core, file-size, tmpfs, and wall-time resources; and
- no GitHub, reviewer, NVIDIA NIM, Cloudflare, OIDC, publication, or deployment credential.

## Result boundary

The container receives one pre-created writable host file at `/output/result.json`; it does not receive a writable host directory. Normal stdout and stderr are discarded and are never accepted as evidence.

The host reads the result through the same no-follow, inode/device-stable regular-file boundary with a separate 16 KiB ceiling. The schema:

- rejects unknown fields;
- bounds status, exit code, duration, excerpts, and reason codes;
- requires `passed` to report exit code `0`;
- repeats repository, base SHA, head SHA, patch digest, and profile; and
- must report the exact command baked into the selected profile.

A missing, empty, malformed, oversized, inconsistent, or identity-mismatched result fails closed.

The process-wide file-size ceiling is 64 MiB so an allowlisted validation command can create bounded workspace artifacts without making the 16 KiB evidence file an alternate resource limit.

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
    source_root=Path("/trusted/git-checkout"),
    patch_path=Path("/trusted/change.patch"),
)
```

The values above are placeholders. Production callers must calculate the real patch digest and bind authenticated exact commits.

## Operational interpretation

A passed result is evidence only for the bound repository, base, head, patch bytes, profile, source object database, and validator image. Merge still requires the live exact head, every required CI and security gate, resolved current review findings, an eligible independent approval, branch protection, provenance, and release acceptance. Queued or pending checks are not success.

The feature fails closed when source identity, streamed Git evidence, tree bounds, archive materialization, extraction equality, patch syntax, Docker execution, result parsing, or request/result identity cannot be established.

## Verification

```bash
cd reviewer
python -m pytest
python -m interrogate -c pyproject.toml noema_reviewer
```

Repository CI requires 100 percent production statement and branch coverage and 100 percent public docstring coverage. Regression tests prove bounded streamed status and exact-tree reads, immediate child termination, shared deadlines, record and path ceilings, canonical ASCII exact-tree metadata, exact-tree parsing, canonical path identity, rename/copy families, Git control isolation, linked worktrees, worktree drift, archive and extraction boundaries, descriptor races, result-channel bounds, Docker isolation, and exact request/result binding.

This PR does not yet build or publish the patch-validator image and does not activate patch validation in the reviewer decision flow. Those are separate follow-on gates.

For design rationale and APA 7th references, see `docs/doctoring/quarantined-patch-validation.md`.
