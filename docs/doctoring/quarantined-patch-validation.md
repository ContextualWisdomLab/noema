# Quarantined patch-validation boundary

## Decision

Noema validates generated or externally supplied text patches only inside a credential-free, no-network container boundary. The validator is deliberately narrower than a general-purpose CI runner: it accepts one repository/base/head/patch-digest tuple and one allowlisted validation profile, then returns a bounded structured result that the trusted reviewer process revalidates.

This design keeps patch content, repository scripts, and test execution away from GitHub App, reviewer-model, NVIDIA NIM, Cloudflare, OIDC, Docker-socket, and publication credentials. A successful sandbox result is evidence about one supplied source snapshot, patch, image, and validation profile only. It is not merge approval, release provenance, production-readiness evidence, or a substitute for independent review.

## Threat model

The boundary assumes that patch content, checked-out repository content, repository scripts, and container output may be malicious. It therefore treats the following as hostile inputs:

- primary and auxiliary Git diff paths;
- file modes, including symlinks and gitlinks;
- binary patch payloads;
- the caller-controlled original patch pathname;
- tracked, staged, untracked, and ignored worktree drift;
- test output and structured result output;
- repository scripts executed by an approved profile; and
- attempts to consume host resources, reach external services, or inherit credentials.

The current slice does not claim protection against a compromised host kernel, container runtime, immutable validator image, image registry, trusted workflow source, or intentionally false non-Git source snapshot supplied by a privileged caller. Those remain separate infrastructure and supply-chain trust decisions.

## Fail-closed controls

### Exact identity binding

A request binds all of the following:

1. repository full name;
2. exact base commit SHA;
3. exact head commit SHA;
4. SHA-256 digest of the patch bytes; and
5. an enumerated validation profile.

When the source root is a Git working tree, the trusted host runs non-shell `git status --porcelain=v2 --branch --untracked-files=all --ignored=matching` before Docker starts. It disables hooks, filesystem monitoring, untracked-cache acceleration, system configuration, global configuration, and optional locks for the check. The reported `branch.oid` must equal the requested head SHA, and every non-header status line is rejected. This detects tracked, staged, untracked, and ignored source drift before untrusted execution.

A source snapshot without `.git` metadata can still enter the sandbox, but this module cannot independently prove its revision or cleanliness; the trusted caller must supply separate exact-source evidence. The base SHA is an evidence binding repeated in the result. This runner neither fetches nor reconstructs the base commit and performs no network access. Consumers must not infer that the runner independently established the base-to-head relationship.

The returned result repeats the same identity tuple and the command baked into the selected profile. Unknown fields, malformed fields, out-of-bound values, a `PASSED` status with a nonzero exit code, or any identity mismatch are rejected before the result can influence reviewer judgement.

### Descriptor-safe patch intake and private staging

Before Docker is invoked, Noema reads the original patch through descriptor-safe, no-follow filesystem operations and rejects:

- missing, empty, non-regular, symlinked, unstable, or oversized patch files;
- non-UTF-8 content;
- binary patch payloads;
- symlink or gitlink modes;
- malformed diff headers;
- traversal, absolute paths, control characters, raw backslashes, malformed quoted paths, repeated targets, and excessive changed-file counts; and
- governance-sensitive paths such as GitHub Actions workflows, local actions, Git metadata, root or documented CODEOWNERS files, Dependabot configuration, and submodule configuration.

Path validation covers `diff --git`, `---`, `+++`, `rename from`, `rename to`, `copy from`, and `copy to` metadata outside hunks. This prevents a superficially safe primary header from redirecting the applied patch into governance files through an auxiliary header.

Raw backslashes are rejected before shell-style tokenization. This prevents a parser from consuming a backslash as an escape and accidentally converting an unsafe path into a superficially safe token.

After byte validation and digest comparison, Noema copies the exact verified bytes to an owner-only private temporary path. The original caller-controlled pathname is never included in Docker's comma-delimited `--mount` grammar. The staged copy is mounted read-only and deleted when validation exits. This closes both mount-option injection through characters such as commas and a change-after-check window on the original path.

### Container isolation

The validator command requires an immutable digest-pinned image and applies the following runtime controls:

- `--pull=never` after independent image verification;
- no network namespace access;
- read-only root filesystem;
- read-only source and staged-patch bind mounts;
- one private writable output bind mount for the result artifact only;
- non-root host UID/GID execution;
- all Linux capabilities dropped;
- `no-new-privileges` and a seccomp profile;
- no Docker socket;
- bounded PID, CPU, memory, swap, file-descriptor, process, core-dump, wall-time, and tmpfs resources;
- isolated IPC; and
- a child environment containing only the minimum executable path, output path, and exact validation identity.

The trusted caller performs forced container cleanup after timeout. Normal subprocess stdout and stderr are discarded rather than accepted as an unbounded evidence channel.

### Bounded result artifact

The container writes `/output/result.json` inside a private host temporary directory. The host reads the file with regular-file, no-follow, stable-descriptor, and byte-limit checks. The artifact is limited to 16 KiB and parsed with an extra-fields-forbidden schema.

The schema bounds status, exit code, duration, excerpts, reason-code count, and reason-code syntax. A successful status requires exit code zero. Repository, base SHA, head SHA, patch SHA-256, profile, and baked-in command must exactly match the request. The private output directory is deleted when validation exits.

A bounded stdout fallback exists only to preserve deterministic injected-runner unit tests. The real subprocess configuration discards stdout and stderr and requires the result file contract.

## Standards rationale

NIST SP 800-190 describes container-specific risks and recommends protecting images, registries, orchestrators, hosts, and container workloads through isolation, least privilege, vulnerability management, and trusted image practices. Noema applies those principles through an immutable image reference, non-root execution, dropped capabilities, no network, read-only mounts, a narrowly writable result directory, and explicit resource constraints. This is an implementation-alignment statement, not a claim of formal NIST conformance.

NIST SP 800-218 defines the final SSDF Version 1.1. NIST published Draft SP 800-218 Rev. 1, describing SSDF Version 1.2, in December 2025; because it remains draft, this decision treats the final Version 1.1 as the normative NIST baseline while tracking the draft for future changes. Exact request/result binding, deterministic preflight, structured bounded evidence, and test-first failure cases operationalize SSDF verification and evidence practices for generated-patch validation.

OCI Runtime Specification 1.3.0, released November 4, 2025, is the latest approved OCI runtime specification at the time of this decision. It defines the low-level container configuration model for namespaces, mounts, Linux resources, capabilities, and process execution. Docker flags are one runtime-specific mechanism for expressing those controls; Noema does not treat the Docker CLI itself as a security standard.

SLSA Version 1.2, released November 24, 2025, is the current approved SLSA specification. Its Build and Source tracks distinguish source-review controls, build isolation, provenance, and source verification. This sandbox improves one validation boundary but does not by itself establish a SLSA level. Noema keeps source authentication, protected-branch approval, exact-head checks, independent review, build provenance, and release evidence as separate gates.

## Verification contract

Deterministic tests must prove at least:

- valid text patches produce an ordered unique changed-path tuple;
- malformed UTF-8, binary patches, symlink/gitlink modes, traversal, absolute paths, control characters, raw backslashes, malformed quoted metadata, governance paths, repeated paths, and file-count overflow fail closed;
- auxiliary Git path headers cannot redirect a safe primary header into governance files;
- descriptor swaps, symlink substitutions, short reads, size overflow, and filesystem errors fail closed;
- a Git source HEAD mismatch blocks Docker before untrusted execution;
- malformed Git metadata and tracked, staged, untracked, or ignored worktree drift block Docker;
- caller-controlled comma-bearing patch names are replaced by a private safe staged path;
- only digest-pinned trusted image references are accepted;
- Docker receives no repository, reviewer, model, NVIDIA NIM, Cloudflare, OIDC, or publication credential;
- the command is a fixed enum profile rather than caller-provided shell text;
- timeout cleanup is attempted and bounded;
- malformed, oversized, unknown-field, inconsistent, or identity-mismatched result artifacts fail closed;
- staged patch and result directories are removed after validation; and
- production statement and branch coverage and public docstring coverage remain 100 percent.

## Residual risks and next slices

Before treating this boundary as release-grade, the repository must also retain or add:

- independent exact-head review and required GitHub checks;
- exact-source authentication for non-Git source snapshots;
- a build definition for the patch-validator image;
- image signature, vulnerability, SBOM, and provenance verification in a trusted workflow;
- a real no-network smoke test of the digest-pinned patch-validator image, rather than inference from another sandbox image;
- integration into the reviewer decision flow with explicit separation between validation evidence and model judgement;
- evidence retention with exact workflow, run, source, image, and request bindings;
- operator documentation for image rotation, failure recovery, and incident response; and
- rollback behavior when image verification or sandbox execution becomes unavailable.

Until those items are satisfied, this PR is a tested library boundary and evidence contract, not a complete end-to-end production activation.

## References

Open Container Initiative. (2025, November 4). *OCI runtime-spec v1.3.0 release notice*. https://opencontainers.org/release-notices/v1-3-0-runtime-spec/

SLSA Community. (2025, November 24). *Announcing SLSA v1.2*. The Linux Foundation. https://slsa.dev/blog/2025/11/announce-slsa-v1.2

SLSA Community. (2025). *SLSA specification (Version 1.2)*. The Linux Foundation. https://slsa.dev/spec/v1.2/

Souppaya, M., Morello, J., & Scarfone, K. (2017). *Application container security guide* (NIST Special Publication 800-190). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-190

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
