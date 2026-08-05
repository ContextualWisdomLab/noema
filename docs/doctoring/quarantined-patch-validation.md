# Quarantined patch-validation boundary

## Decision

Noema validates generated or externally supplied text patches only inside a credential-free, no-network container boundary. The validator accepts one exact repository/base/head/patch-digest tuple and one allowlisted profile, executes only the profile baked into a digest-pinned image, and returns a bounded structured result that the trusted reviewer revalidates.

A passed sandbox result is evidence about one authenticated source revision, one patch, one image, and one validation profile. It is not merge approval, model judgement, release provenance, deployment evidence, or a substitute for independent review.

## Threat model

Patch content, repository source, Git control metadata, repository scripts, archive metadata, extracted filesystem objects, and container output are hostile. The design specifically addresses:

- malformed, binary, oversized, symlink, gitlink, traversal, absolute, control-character, backslash, duplicate, or governance-path patch input;
- patch-path replacement and descriptor races;
- tracked, staged, untracked, or ignored worktree drift;
- mutation of the caller worktree after exact-head preflight but before Docker starts;
- committed or repository-local Git attributes that omit tracked files with `export-ignore` or rewrite blob bytes with `export-subst`;
- checkout-local Git configuration, index, hooks, worktree records, common-directory records, remotes, and object-store path substitution;
- tar links, special entries, unsafe names, duplicate aliases, file-directory collisions, gitlink-like leaf directories, member-count expansion, and extraction-size exhaustion;
- extraction-time or post-extraction substitution of a validated regular file or directory;
- checkout tokens, credential-bearing remotes, object storage, reflogs, and linked-worktree pointers;
- container network, privilege, process, memory, CPU, file-descriptor, file-size, tmpfs, IPC, and wall-time abuse;
- writable host-directory abuse, unbounded output, or identity-confused result evidence; and
- accidental equivalence between validation evidence, review approval, and release authority.

The slice does not claim protection against a compromised host kernel, container runtime, trusted Git executable, validator image, image registry, workflow source, content-addressed Git object database, or privileged caller that supplies falsely authenticated non-Git source. Those remain separate trust decisions.

## Fail-closed controls

### Exact request and result binding

The request binds repository full name, exact base SHA, exact head SHA, patch SHA-256, and an enumerated validation profile. The returned result must repeat those values and the command baked into the profile. Unknown fields, malformed values, excessive values, a `PASSED` status with nonzero exit code, or any identity mismatch are rejected before evidence reaches reviewer judgement.

The base SHA is an evidence binding only. The runner does not fetch or reconstruct the base commit and does not independently prove the base-to-head relationship.

### Isolated exact committed source snapshot

A direct `git status` or `git archive` against the caller's `.git` directory is not a sufficient trust boundary. Git documents that `git archive` honors `export-ignore` and `export-subst`, reads attributes from the archived tree, and can also use `$GIT_DIR/info/attributes`. Git separately documents that `$GIT_DIR/info/attributes` has the highest attribute precedence. Therefore, untrusted checkout-local metadata could otherwise omit a committed failing test or rewrite committed blob bytes while the caller still describes the output as an exact-head snapshot.

Noema resolves only the standard repository or linked-worktree control path and its common object directory. Git documents directory-style repositories, `.git` gitfiles, common object directories, and `objects/info/alternates`; the implementation uses those documented mechanisms to construct a private bare control directory backed by the original content-addressed object store.

Git control files are read with no-follow descriptors, byte ceilings, strict UTF-8, one-line syntax, and device/inode stability. Symlinks, special objects, unsafe path characters, malformed gitfile records, inaccessible common directories, and missing required object stores fail closed.

The private owner-only control directory contains:

- a minimal bare-repository configuration;
- `HEAD` set to the exact requested commit;
- an `objects/info/alternates` file pointing to the resolved object store; and
- highest-precedence `info/attributes` containing `* -export-ignore -export-subst`.

The child Git environment disables system and global configuration, system attributes, optional locks, hooks, fsmonitor, and the untracked cache. It does not use source-local configuration, remotes, indexes, hooks, or attributes as policy inputs.

Using the isolated control directory, the trusted host runs `read-tree <exact head SHA>` and a bounded non-shell porcelain-v2 status comparison against the worktree. The status command must return zero and no tracked, staged, untracked, or ignored entry. A failed command is never interpreted as a clean result.

A clean preflight alone is not sufficient because the worktree could change before Docker opens the bind mount. The isolated control directory therefore performs a second bounded non-shell operation:

```text
git archive --format=tar --output=<private temporary path> <exact head SHA>
```

The private highest-precedence attributes neutralize both committed and local archive transforms. Tests prove that committed `export-ignore`, committed `export-subst`, and untracked `$GIT_DIR/info/attributes` cannot hide or rewrite exact-tree bytes.

The archive is not trusted merely because Git produced it. Noema enumerates it before extraction and permits at most 20,000 entries, at most 64 MiB for one regular file, and at most 512 MiB of aggregate declared regular-file bytes. Each name must be an exact normalized repository-relative POSIX path. Absolute names, traversal, raw backslashes, control characters, `.git` content, normalization aliases, duplicates, file-directory collisions, content below a file, links, devices, FIFOs, and other special entries are rejected. Explicit directories must contain another declared member; a leaf directory is rejected as a gitlink-like shape that `git archive` cannot materialize as ordinary source bytes.

Only the validated member list is extracted into a fresh owner-only directory using Python's explicit `data` filter. The runner then performs an `lstat` walk and requires exact equality between the validated manifest and the observed path, type, and regular-file-size map. Symlinks, special objects, omitted entries, added entries, and changed sizes therefore fail closed before Docker sees the snapshot. The transient archive, isolated control directory, and snapshot are removed with the private staging directory.

Python documents extraction filters as mitigations rather than complete security boundaries and explicitly warns about denial-of-service and live-filesystem risks. Noema adds allowlisting, deterministic member and byte limits, fresh private extraction, pre/post manifest equality, a trusted Git operation timeout, and downstream container resource limits. This is defense in depth rather than a claim that `tarfile` authenticates source.

A source tree without `.git` metadata may still be mounted read-only, but the runner cannot prove its revision or cleanliness. A trusted caller must provide separate exact-source authentication.

### Git metadata and credential isolation

The `.git` control object must be absent, a regular directory, or a regular linked-worktree file. Symlinks and special objects are rejected before Git or Docker runs.

The committed snapshot contains no original `.git` control data. The runner creates a type-compatible empty `.git` placeholder and overlays it with a private empty nested bind mount: directory-style repositories use a directory; linked worktrees use a regular file. Untrusted code therefore cannot read checkout credentials, remotes, local configuration, object storage, reflogs, or host worktree paths.

### Descriptor-safe patch intake

The original patch is read through no-follow descriptor operations with pre-open and post-open device/inode checks, regular-file enforcement, bounded reads, and exact SHA-256 comparison. The parser rejects unsafe content before Docker execution, including path-bearing `diff --git`, `---`, `+++`, rename, and copy metadata that targets a governance boundary.

After verification, the exact patch bytes are copied to an owner-only temporary path. The caller-controlled original pathname never enters Docker's comma-delimited mount grammar, and the staged copy is mounted read-only. This closes mount-option injection and original-file change-after-check windows.

### Container isolation

The validator requires an immutable image digest and uses `--pull=never`. The container has no network, no Docker socket, a read-only root filesystem, read-only source and patch mounts, one pre-created writable result file, non-root UID/GID, all capabilities dropped, `no-new-privileges`, seccomp, isolated IPC, and bounded PID, CPU, memory, swap, file-descriptor, process, core-dump, file-size, tmpfs, and wall-time resources.

The child environment contains only the minimum executable path, output path, and exact validation identity. Repository, reviewer-model, NVIDIA NIM, Cloudflare, OIDC, and publication credentials are intentionally absent. Timeout handling attempts bounded forced cleanup.

### Bounded result artifact

The container receives exactly one host file at `/output/result.json`, not a writable host output directory. The host pre-creates the file with owner-only permissions and applies a 16 KiB `RLIMIT_FSIZE` ceiling. Normal subprocess stdout and stderr are discarded, preventing alternate or unbounded evidence channels.

The host reads the result through regular-file, no-follow, stable-descriptor, and byte-limit checks. The 16 KiB, extra-fields-forbidden schema bounds status, exit code, duration, excerpts, reason-code count, and reason-code syntax. A stdout fallback exists only for deterministic injected-runner tests that leave the pre-created file empty; production Docker execution cannot use it because stdout and stderr are directed to `DEVNULL`.

## Standards rationale

NIST SP 800-190 identifies container image, registry, orchestrator, host, and workload risks and recommends isolation, least privilege, vulnerability management, and trusted-image practices. The immutable image reference, non-root execution, capability drop, no-network policy, read-only mounts, single-file result channel, and resource constraints align with those recommendations without claiming formal conformance.

NIST SP 800-218 remains the final SSDF Version 1.1 baseline. NIST SP 800-218 Rev. 1, describing SSDF Version 1.2, remains an Initial Public Draft as of this decision. Noema therefore treats Version 1.1 as normative while tracking the draft. Exact-head binding, deterministic failure evidence, test-first security regressions, and separation of development, review, and release authority operationalize SSDF verification practices.

OCI lists Runtime Specification 1.3.0, released November 4, 2025, as the latest runtime-spec release. It defines the low-level namespace, mount, resource, capability, and process model. Docker flags are an implementation mechanism for those controls, not a security standard by themselves.

SLSA Version 1.2 is the current Approved specification and adds a Source Track alongside the Build Track. The snapshot boundary improves exact-source validation, but this PR does not claim a SLSA level. Protected source history, two-party review, build isolation, provenance, artifact verification, and release evidence remain separate controls.

## Verification contract

Deterministic tests must prove at least:

- malformed patch encodings, payloads, modes, headers, paths, and file counts fail closed;
- descriptor swaps, symlink substitutions, short reads, and byte-limit violations fail closed;
- malformed, oversized, multiline, symlinked, unstable, or unavailable Git control records fail closed;
- exact Git HEAD mismatch, failed isolated status, and every category of worktree drift block Docker;
- committed and local `export-ignore` cannot omit tracked source;
- committed `export-subst` cannot rewrite raw blob bytes;
- mutation immediately after preflight cannot change the source bytes mounted in Docker;
- Git archive command failure, malformed or empty archives, unsafe names, duplicates, links, special entries, gitlink-like directories, and member or byte-limit violations fail closed;
- post-extraction path, type, or size substitution fails closed before Docker;
- a bounded regular-file and populated-directory tree is accepted;
- directory and linked-worktree Git metadata are replaced by type-compatible empty boundaries;
- only an immutable trusted image and allowlisted profile are accepted;
- the container receives no privileged credentials and has bounded isolation controls;
- only one bounded result file is host-writable and no host output directory is mounted;
- malformed, oversized, inconsistent, or identity-mismatched result evidence fails closed; and
- production statement and branch coverage and public docstring coverage remain 100 percent.

## Residual risks and next slices

Before production activation, the repository still requires:

- independent exact-head approval and all required checks;
- exact authentication for non-Git snapshots;
- a reproducible patch-validator image build;
- signature, vulnerability, SBOM, and provenance verification;
- a real no-network smoke test of the digest-pinned image;
- integration into reviewer decision flow without conflating evidence and model judgement;
- retained evidence bound to workflow, run, source, image, request, and result;
- image-rotation, incident-response, failure-recovery, and rollback procedures.

Until those gates pass, this remains a tested library and evidence contract rather than an end-to-end release capability.

## References

Git Project. (2026, April 20). *git-archive documentation* (Version 2.54.0). https://git-scm.com/docs/git-archive

Git Project. (2026, June 29). *gitattributes documentation* (Version 2.55.0). https://git-scm.com/docs/gitattributes

Git Project. (2025, March 14). *gitrepository-layout documentation* (Version 2.49.0). https://git-scm.com/docs/gitrepository-layout

Open Container Initiative. (2025, November 4). *OCI runtime-spec v1.3.0 release notice*. https://opencontainers.org/release-notices/v1-3-0-runtime-spec/

Python Software Foundation. (2026). *tarfile—Read and write tar archive files (Python 3.11.15 documentation)*. https://docs.python.org/3.11/library/tarfile.html

SLSA Community. (2025, November 24). *Announcing SLSA v1.2*. The Linux Foundation. https://slsa.dev/blog/2025/11/announce-slsa-v1.2

SLSA Community. (2025). *SLSA specification (Version 1.2)*. The Linux Foundation. https://slsa.dev/spec/v1.2/

Souppaya, M., Morello, J., & Scarfone, K. (2017). *Application container security guide* (NIST Special Publication 800-190). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-190

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure software development framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (Initial Public Draft, NIST Special Publication 800-218 Revision 1). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218r1.ipd
