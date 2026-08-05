# Quarantined patch-validation boundary

## Decision

Noema validates generated or externally supplied text patches only inside a credential-free, no-network container boundary. The runner accepts one exact repository/base/head/patch-digest tuple and one allowlisted profile, executes only the profile baked into an immutable image, and accepts one bounded structured result that repeats the request identity.

A passed sandbox result is evidence for one authenticated Git revision, patch, image, and validation profile. It is not merge approval, model judgement, release provenance, deployment evidence, or a substitute for independent review.

The current implementation requires verifiable Git metadata and a reachable content-addressed object database. A plain directory is not accepted as exact-revision evidence.

## Threat model

Patch content, repository source, Git control metadata, repository scripts, exact-tree output, archive metadata, extracted filesystem objects, and container output are hostile. The boundary addresses:

- malformed, binary, oversized, symlink, gitlink, traversal, absolute, control-character, backslash, aliasing, duplicate, or governance-path patch input;
- conflicting or incomplete `---`/`+++`, rename, copy, mode, index, similarity, and hunk metadata;
- patch-path replacement and descriptor races;
- tracked, staged, untracked, or ignored worktree drift;
- caller-worktree mutation after exact-head preflight;
- committed or local `export-ignore` and `export-subst` archive transforms;
- checkout-local configuration, hooks, indexes, remotes, linked-worktree records, common-directory records, and object-store substitution;
- special Git tree modes, malformed `ls-tree` records, excessive tree members, oversized blobs, and aggregate source expansion before archive allocation;
- tar links, devices, FIFOs, unsafe names, duplicate aliases, file-directory collisions, leaf gitlink-like directories, and extraction-size exhaustion;
- extraction-time or post-extraction substitution;
- checkout tokens, credential-bearing remotes, object storage, reflogs, and worktree pointers entering the container;
- container network, privilege, process, memory, CPU, descriptor, file-size, tmpfs, IPC, and wall-time abuse;
- writable host-directory abuse, stdout/stderr evidence smuggling, oversized result output, and identity-confused evidence; and
- accidental equivalence among validation evidence, review approval, and release authority.

The boundary does not claim protection against a compromised host kernel, container runtime, trusted Git executable, validator image, image registry, workflow source, content-addressed object database, or privileged trusted caller. Those remain separate controls.

## Fail-closed controls

### Exact request and result binding

The request binds repository full name, exact base SHA, exact head SHA, patch SHA-256, and an enumerated validation profile. The result must repeat those fields and the command baked into the profile. Unknown fields, malformed values, excessive values, a `passed` status with nonzero exit code, or any identity mismatch are rejected.

The base SHA is an evidence binding. The current runner does not fetch or reconstruct the base commit and does not independently prove the base-to-head relationship.

### Descriptor-safe Git control resolution

A direct `git status` or `git archive` against caller-controlled `.git` state is not a sufficient trust boundary. Noema reads only the standard repository or linked-worktree control records through bounded, no-follow descriptors with strict UTF-8, single-line syntax, and device/inode stability. Symlinks, special objects, unsafe paths, malformed gitfiles, inaccessible common directories, and unavailable object stores fail closed.

The runner creates private owner-only bare Git control metadata containing:

- minimal bare-repository configuration;
- `HEAD` bound to the requested exact commit;
- `objects/info/alternates` bound to the resolved content-addressed object store; and
- highest-precedence `info/attributes` containing `* -export-ignore -export-subst`.

System and global Git configuration, system attributes, hooks, fsmonitor, optional locks, and the untracked cache are disabled. Source-local configuration, remotes, indexes, hooks, and attributes do not become policy inputs.

Using this isolated control directory, the trusted host runs `read-tree <exact head>` and a bounded non-shell porcelain-v2 status comparison. The status command must return zero and no tracked, staged, untracked, or ignored entry. A failed command is never treated as clean.

### Exact-tree preflight before archive allocation

A clean worktree is insufficient because the source tree itself may be structurally unsupported or too large to serialize safely. Before `git archive`, the isolated control directory runs the equivalent of:

```text
git ls-tree -r -l -z --full-tree <exact head SHA>
```

The NUL-delimited output is parsed under a 30-second process deadline and strict UTF-8. Every record must contain exactly one canonical repository-relative path and metadata for a `100644` or `100755` blob with a valid SHA-1 or SHA-256 object identifier and decimal size.

The preflight rejects more than 20,000 records, a blob above 64 MiB, aggregate blob bytes above 512 MiB, special or unsupported modes, tree or gitlink records, malformed or truncated output, duplicate paths, `.git` content, aliases, traversal, absolute paths, backslashes, and control characters. Git launch failure, timeout, decoding failure, or nonzero exit fails closed.

This order matters: archive member validation alone occurs after storage has already been allocated and written. Exact-tree preflight bounds source cardinality and bytes before serialization, reducing archive-storage denial-of-service exposure and proving that the committed tree contains only materializable regular blobs.

### Isolated archive and extraction equality

After exact-tree preflight, the isolated control directory performs:

```text
git archive --format=tar --output=<private temporary path> <exact head SHA>
```

Git documents that `git archive` honors `export-ignore` and `export-subst` and that `$GIT_DIR/info/attributes` has the highest precedence. The private attributes explicitly unset both transforms, preventing a committed or local attribute from omitting a failing test or rewriting committed blob bytes.

The archive is independently hostile. Noema enumerates it before extraction and permits only canonical regular files and populated directories under the same member and byte ceilings. Absolute names, traversal, raw backslashes, control characters, `.git` content, aliases, duplicates, file-directory collisions, children below files, links, devices, FIFOs, other special entries, and empty leaf directories are rejected.

Only the validated members are extracted into a fresh owner-only directory through Python's `data` filter. An `lstat` walk must exactly match the validated path, type, and regular-file-size manifest. Added, omitted, substituted, linked, special, or resized entries fail closed before Docker starts.

Python documents extraction filters as mitigations, not complete authentication. Noema adds deterministic tree and archive limits, allowlisting, private extraction, pre/post manifest equality, trusted Git timeouts, and downstream container quotas as defense in depth.

### Git metadata and credential isolation

The caller's `.git` object must be a regular directory or regular linked-worktree file. A missing, symlinked, or special object is rejected.

The committed snapshot contains no original Git control data. A type-compatible empty `.git` placeholder and nested read-only bind boundary prevent untrusted code from reading checkout credentials, remotes, local configuration, object storage, reflogs, or host worktree pointers.

### Descriptor-safe patch intake

The patch is read through no-follow descriptor operations with pre-open and post-open device/inode checks, regular-file enforcement, a 4 MiB ceiling, and exact SHA-256 comparison. The caller-controlled original pathname never enters Docker mount grammar; verified bytes are copied to a private owner-only file.

The parser validates canonical primary paths and independent file, rename, and copy metadata families. Each family must be complete, exact source and target roles must match the active primary diff identity, duplicates are rejected within a family, rename and copy cannot conflict, and `/dev/null` is permitted only for canonical creation or deletion file headers.

Hunk counts are consumed exactly. Newline markers require immediately preceding valid content and cannot repeat. Extra content after declared counts, path metadata after a hunk, malformed quoting, noncanonical path aliases, and governance targets fail closed before Docker.

### Container isolation

The validator requires an immutable repository-scoped image digest and uses `--pull=never`. The container has no network, no Docker socket, a read-only root, read-only source and patch mounts, one pre-created writable result file, a non-root UID/GID, all capabilities dropped, `no-new-privileges`, seccomp, isolated IPC, and bounded PID, CPU, memory, swap, descriptor, process, core, file-size, tmpfs, and wall-time resources.

The child environment contains only the minimum executable path, result path, and exact validation identity. Repository, reviewer-model, NVIDIA NIM, Cloudflare, OIDC, publication, and deployment credentials are absent. Timeout handling attempts bounded forced cleanup.

### Single bounded result channel

The container receives exactly one host file at `/output/result.json`, never a writable host output directory. Normal subprocess stdout and stderr are directed to `DEVNULL`; there is no stdout compatibility fallback in the evidence contract.

The host independently reads the result through regular-file, no-follow, stable-descriptor, and 16 KiB byte-limit checks. The extra-fields-forbidden schema bounds status, exit code, duration, excerpts, reason-code count, and reason-code syntax. Missing, empty, malformed, oversized, inconsistent, or identity-mismatched evidence fails closed.

The process-wide 64 MiB `RLIMIT_FSIZE` and the 16 KiB result ceiling protect different resources. The first bounds individual workspace artifacts created by an allowlisted validation tool; the second bounds the only host-writable trusted evidence input.

## Standards rationale

NIST SP 800-190 identifies image, registry, orchestrator, host, and workload risks and recommends trusted images, isolation, least privilege, vulnerability management, and resource controls. The immutable image reference, non-root execution, capability drop, no-network policy, read-only mounts, single-file result channel, and quotas align with those recommendations without claiming formal conformance.

NIST SP 800-218 remains the final SSDF Version 1.1 baseline. NIST SP 800-218 Revision 1, describing SSDF Version 1.2, remains an Initial Public Draft in this decision record. Exact-head binding, deterministic failure evidence, test-first security regressions, and separation of development, review, and release authority operationalize SSDF verification practices.

OCI Runtime Specification 1.3.0 defines the low-level namespace, mount, resource, capability, and process model used by container runtimes. Docker flags are implementation mechanisms for those controls, not security guarantees by themselves.

SLSA Version 1.2 adds a Source Track alongside the Build Track. The exact-tree snapshot boundary improves source evidence, but this PR does not claim a SLSA level. Protected history, two-party review, build isolation, provenance, artifact verification, and release acceptance remain separate.

## Verification contract

Deterministic tests prove at least:

- malformed patch encodings, payloads, paths, modes, headers, metadata families, and hunk counts fail closed;
- descriptor swaps, symlink substitutions, short reads, and byte-limit violations fail closed;
- malformed, multiline, unstable, or unavailable Git control records fail closed;
- exact-head mismatch, failed isolated status, and all worktree drift categories block Docker;
- exact-tree record count, modes, object types, object identities, sizes, aggregate bytes, canonical paths, duplicates, process failures, and timeouts fail closed before archive allocation;
- committed and local archive attributes cannot omit or rewrite exact-tree bytes;
- post-preflight worktree mutation cannot change the snapshot mounted in Docker;
- archive failure, malformed or empty archives, unsafe names, duplicates, links, special entries, leaf directories, member limits, and byte limits fail closed;
- post-extraction path, type, or size substitution fails closed;
- directory and linked-worktree Git metadata are replaced by type-compatible empty boundaries;
- only an immutable trusted image and allowlisted profile are accepted;
- only one bounded result file is host-writable and stdout/stderr are not evidence channels;
- malformed, oversized, inconsistent, or identity-mismatched result evidence fails closed; and
- production statement and branch coverage and public docstring coverage remain 100 percent.

## Residual risks and next slices

Before production activation, the repository still requires:

- independent exact-head approval and every protected required check;
- a reproducible patch-validator image build;
- signature, vulnerability, SBOM, and provenance verification;
- a real no-network smoke test of the digest-pinned patch-validator image;
- integration into reviewer decision flow without conflating evidence and model judgement;
- retained evidence bound to workflow, run, source, image, request, and result; and
- image rotation, incident response, failure recovery, and rollback procedures.

Until those gates pass, this remains a tested library and evidence contract, not an end-to-end release capability.

## References

Git Project. (2026, April 20). *git-archive documentation* (Version 2.54.0). https://git-scm.com/docs/git-archive

Git Project. (2026, June 29). *gitattributes documentation* (Version 2.55.0). https://git-scm.com/docs/gitattributes

Git Project. (2025, March 14). *gitrepository-layout documentation* (Version 2.49.0). https://git-scm.com/docs/gitrepository-layout

Git Project. (2026, April 20). *git-ls-tree documentation* (Version 2.54.0). https://git-scm.com/docs/git-ls-tree

Open Container Initiative. (2025, November 4). *OCI runtime-spec v1.3.0 release notice*. https://opencontainers.org/release-notices/v1-3-0-runtime-spec/

Python Software Foundation. (2026). *tarfile—Read and write tar archive files (Python 3.11.15 documentation)*. https://docs.python.org/3.11/library/tarfile.html

SLSA Community. (2025, November 24). *Announcing SLSA v1.2*. The Linux Foundation. https://slsa.dev/blog/2025/11/announce-slsa-v1.2

SLSA Community. (2025). *SLSA specification (Version 1.2)*. The Linux Foundation. https://slsa.dev/spec/v1.2/

Souppaya, M., Morello, J., & Scarfone, K. (2017). *Application container security guide* (NIST Special Publication 800-190). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-190

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure software development framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (Initial Public Draft, NIST Special Publication 800-218 Revision 1). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218r1.ipd
