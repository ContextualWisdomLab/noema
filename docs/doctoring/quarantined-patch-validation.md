# Quarantined patch-validation boundary

## Decision

Noema validates generated or externally supplied text patches only inside a credential-free, no-network container boundary. The validator accepts one exact repository/base/head/patch-digest tuple and one allowlisted profile, executes only the profile baked into a digest-pinned image, and returns a bounded structured result that the trusted reviewer revalidates.

A passed sandbox result is evidence about one authenticated source revision, one patch, one image, and one validation profile. It is not merge approval, model judgement, release provenance, deployment evidence, or a substitute for independent review.

## Threat model

Patch content, repository source, Git control metadata, repository scripts, and container output are hostile. The design specifically addresses:

- malformed, binary, oversized, symlink, gitlink, traversal, absolute, control-character, backslash, duplicate, or governance-path patch input;
- patch-path replacement and descriptor races;
- tracked, staged, untracked, or ignored worktree drift;
- mutation of the caller worktree after exact-head preflight but before Docker starts;
- checkout tokens, credential-bearing remotes, local Git configuration, object storage, reflogs, and linked-worktree pointers;
- container network, privilege, process, memory, CPU, file-descriptor, tmpfs, IPC, and wall-time abuse;
- unbounded or identity-confused result evidence; and
- accidental equivalence between validation evidence, review approval, and release authority.

The slice does not claim protection against a compromised host kernel, container runtime, trusted Git executable, validator image, image registry, workflow source, or privileged caller that supplies falsely authenticated non-Git source. Those remain separate trust decisions.

## Fail-closed controls

### Exact request and result binding

The request binds repository full name, exact base SHA, exact head SHA, patch SHA-256, and an enumerated validation profile. The returned result must repeat those values and the command baked into the profile. Unknown fields, malformed values, excessive values, a `PASSED` status with nonzero exit code, or any identity mismatch are rejected before evidence reaches reviewer judgement.

The base SHA is an evidence binding only. The runner does not fetch or reconstruct the base commit and does not independently prove the base-to-head relationship.

### Exact committed source snapshot

For a Git source root, the trusted host first runs a bounded, non-shell `git status --porcelain=v2 --branch --untracked-files=all --ignored=matching` with hooks, filesystem monitoring, untracked cache, system configuration, global configuration, and optional locks disabled. `branch.oid` must equal the requested head SHA, and every non-header status line is rejected.

A clean preflight alone is not sufficient because the worktree could change before Docker opens the bind mount. After preflight, the runner therefore performs a second bounded, non-shell, configuration-isolated operation:

```text
git archive --format=tar --output=<private temporary path> <exact head SHA>
```

The archive is extracted into a new owner-only temporary directory with Python's explicit `data` extraction filter. Docker receives that private exact-commit snapshot, not the mutable caller worktree. Archive creation failure, malformed archive data, rejected extraction members, or filesystem failure aborts before Docker starts. The transient archive and snapshot are removed with the private staging directory.

Python documents the `data` filter as a mitigation for dangerous archive features, while also warning that extraction filters do not eliminate denial-of-service and live-filesystem risks. Noema narrows that residual risk by accepting an archive generated locally by the trusted Git executable for an already authenticated exact commit, extracting into a fresh private directory, imposing the trusted Git operation timeout, and retaining container resource limits. This is defense in depth rather than a claim that `tarfile` alone authenticates source.

A source tree without `.git` metadata may still be mounted read-only, but the runner cannot prove its revision or cleanliness. A trusted caller must provide separate exact-source authentication.

### Git metadata and credential isolation

The `.git` control object must be absent, a regular directory, or a regular linked-worktree file. Symlinks and special objects are rejected before Git or Docker runs.

The committed snapshot contains no original `.git` control data. The runner creates a type-compatible empty `.git` placeholder and overlays it with a private empty nested bind mount: directory-style repositories use a directory; linked worktrees use a regular file. Untrusted code therefore cannot read checkout credentials, remotes, local configuration, object storage, reflogs, or host worktree paths.

### Descriptor-safe patch intake

The original patch is read through no-follow descriptor operations with pre-open and post-open device/inode checks, regular-file enforcement, bounded reads, and exact SHA-256 comparison. The parser rejects unsafe content before Docker execution, including path-bearing `diff --git`, `---`, `+++`, rename, and copy metadata that targets a governance boundary.

After verification, the exact patch bytes are copied to an owner-only temporary path. The caller-controlled original pathname never enters Docker's comma-delimited mount grammar, and the staged copy is mounted read-only. This closes mount-option injection and original-file change-after-check windows.

### Container isolation

The validator requires an immutable image digest and uses `--pull=never`. The container has no network, no Docker socket, a read-only root filesystem, read-only source and patch mounts, one narrowly writable result mount, non-root UID/GID, all capabilities dropped, `no-new-privileges`, seccomp, isolated IPC, and bounded PID, CPU, memory, swap, file-descriptor, process, core-dump, tmpfs, and wall-time resources.

The child environment contains only the minimum executable path, output path, and exact validation identity. Repository, reviewer-model, NVIDIA NIM, Cloudflare, OIDC, and publication credentials are intentionally absent. Timeout handling attempts bounded forced cleanup.

### Bounded result artifact

The container writes `/output/result.json` in a private temporary directory. The host reads it through regular-file, no-follow, stable-descriptor, and byte-limit checks. The 16 KiB, extra-fields-forbidden schema bounds status, exit code, duration, excerpts, reason-code count, and reason-code syntax. Normal subprocess stdout and stderr are discarded; a stdout fallback exists only for deterministic injected-runner tests.

## Standards rationale

NIST SP 800-190 identifies container image, registry, orchestrator, host, and workload risks and recommends isolation, least privilege, vulnerability management, and trusted-image practices. The immutable image reference, non-root execution, capability drop, no-network policy, read-only mounts, narrow result channel, and resource constraints align with those recommendations without claiming formal conformance.

NIST SP 800-218 remains the final SSDF Version 1.1 baseline. NIST SP 800-218 Rev. 1, describing SSDF Version 1.2, remains an Initial Public Draft as of this decision. Noema therefore treats Version 1.1 as normative while tracking the draft. Exact-head binding, deterministic failure evidence, test-first security regressions, and separation of development, review, and release authority operationalize SSDF verification practices.

OCI lists Runtime Specification 1.3.0, released November 4, 2025, as the latest runtime-spec release. It defines the low-level namespace, mount, resource, capability, and process model. Docker flags are an implementation mechanism for those controls, not a security standard by themselves.

SLSA Version 1.2 is the current Approved specification and adds a Source Track alongside the Build Track. The snapshot boundary improves exact-source validation, but this PR does not claim a SLSA level. Protected source history, two-party review, build isolation, provenance, artifact verification, and release evidence remain separate controls.

## Verification contract

Deterministic tests must prove at least:

- malformed patch encodings, payloads, modes, headers, paths, and file counts fail closed;
- descriptor swaps, symlink substitutions, short reads, and byte-limit violations fail closed;
- exact Git HEAD mismatch and every category of worktree drift block Docker;
- mutation immediately after preflight cannot change the source bytes mounted in Docker;
- Git archive command failure and malformed archive extraction fail closed without falling back to the worktree;
- directory and linked-worktree Git metadata are replaced by type-compatible empty boundaries;
- only an immutable trusted image and allowlisted profile are accepted;
- the container receives no privileged credentials and has bounded isolation controls;
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

Open Container Initiative. (2025, November 4). *OCI runtime-spec v1.3.0 release notice*. https://opencontainers.org/release-notices/v1-3-0-runtime-spec/

Python Software Foundation. (2026). *tarfile—Read and write tar archive files (Python 3.11.15 documentation)*. https://docs.python.org/3.11/library/tarfile.html

SLSA Community. (2025, November 24). *Announcing SLSA v1.2*. The Linux Foundation. https://slsa.dev/blog/2025/11/announce-slsa-v1.2

SLSA Community. (2025). *SLSA specification (Version 1.2)*. The Linux Foundation. https://slsa.dev/spec/v1.2/

Souppaya, M., Morello, J., & Scarfone, K. (2017). *Application container security guide* (NIST Special Publication 800-190). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-190

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure software development framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (Initial Public Draft, NIST Special Publication 800-218 Revision 1). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218r1.ipd
