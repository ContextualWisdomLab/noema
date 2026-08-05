# Quarantined patch-validation boundary

## Decision

Noema validates generated or externally supplied source patches only inside a credential-free, no-network container boundary. The validator is deliberately not a general-purpose CI runner: it accepts one exact repository/base/head/patch-digest tuple and one allowlisted test profile, then returns a bounded structured result that is revalidated by the trusted reviewer process.

This design keeps untrusted source, patch content, and test execution away from GitHub App, reviewer-model, Cloudflare, OIDC, Docker-socket, and publication credentials. A successful sandbox result is evidence about the supplied revision and validation profile only; it is not merge approval, release provenance, production-readiness evidence, or a substitute for independent review.

## Threat model

The boundary assumes that patch content and checked-out repository content may be malicious. It therefore treats the following as hostile inputs:

- diff headers and repository paths;
- file modes, including symlinks and gitlinks;
- binary patch payloads;
- test output and structured result output;
- repository scripts executed by an approved profile; and
- attempts to consume host resources or reach external services.

The current slice does not claim protection against a compromised host kernel, container runtime, immutable validator image, image registry, or trusted workflow source. Those remain separate supply-chain and infrastructure trust decisions.

## Fail-closed controls

### Exact identity binding

A request must bind all of the following:

1. repository full name;
2. exact base commit SHA;
3. exact head commit SHA;
4. SHA-256 digest of the patch bytes; and
5. an enumerated validation profile.

The returned result must repeat the same identity tuple and the baked-in command associated with the profile. Any mismatch is rejected before the result can influence reviewer judgement.

### Patch preflight

Before Docker is invoked, Noema reads the patch through descriptor-safe, no-follow filesystem operations and rejects:

- missing, empty, non-regular, symlinked, unstable, or oversized patch files;
- non-UTF-8 content;
- binary patch payloads;
- symlink or gitlink modes;
- malformed diff headers;
- path traversal, absolute paths, control characters, raw backslashes, repeated targets, and excessive changed-file counts; and
- governance-sensitive paths such as GitHub Actions workflows, local actions, Git metadata, CODEOWNERS, Dependabot configuration, and submodule configuration.

Raw backslashes are rejected before shell-style tokenization. This prevents a parser from consuming a backslash as an escape and accidentally converting an unsafe path into a superficially safe token.

### Container isolation

The validator command uses an immutable digest-pinned image and applies the following runtime controls:

- `--pull=never` after independent image verification;
- no network namespace access;
- read-only root filesystem;
- read-only source and patch bind mounts;
- non-root host UID/GID execution;
- all Linux capabilities dropped;
- `no-new-privileges` and a seccomp profile;
- no Docker socket;
- bounded PID, CPU, memory, swap, file-descriptor, process, core-dump, wall-time, and tmpfs resources;
- isolated IPC; and
- a child environment containing only the minimum path and exact validation identity.

The trusted caller performs forced container cleanup after timeout and bounds infrastructure diagnostics before returning them.

## Standards rationale

NIST SP 800-190 describes container-specific risks and recommends protecting images, registries, orchestrators, hosts, and container workloads through isolation, least privilege, vulnerability management, and trusted image practices. Noema applies those principles through an immutable verified image, non-root execution, dropped capabilities, no network, read-only mounts, and explicit resource constraints. This is an implementation alignment statement, not a claim of formal NIST conformance.

NIST SP 800-218 recommends integrating security requirements, verification, and recorded evidence throughout the software-development life cycle. The exact-request/result binding, deterministic preflight, structured bounded evidence, and test-first failure cases operationalize those practices for generated-patch validation.

OCI Runtime Specification 1.3.0 is the current approved runtime specification as of this decision. It defines the low-level container configuration model for namespaces, mounts, Linux resources, capabilities, and process execution. Docker flags are treated as one runtime-specific mechanism for expressing those controls; Noema does not assume that the CLI itself is a security standard.

SLSA 1.2 is the current approved supply-chain specification. Its Build and Source tracks distinguish source-review controls, build isolation, and provenance. This sandbox improves one validation boundary but does not by itself establish a SLSA level. Noema keeps source approval, exact-head checks, independent review, build provenance, and release evidence as separate gates.

## Verification contract

Deterministic tests must prove at least:

- valid text patches produce an ordered unique changed-path tuple;
- malformed UTF-8, binary patches, symlink/gitlink modes, traversal, absolute paths, control characters, raw backslashes, governance paths, repeated paths, and file-count overflow fail closed;
- descriptor swaps, symlink substitutions, short reads, size overflow, and filesystem errors fail closed;
- only digest-pinned trusted images are accepted;
- Docker receives no repository, reviewer, model, Cloudflare, OIDC, or publication credential;
- the command is a fixed enum profile rather than caller-provided shell text;
- timeout cleanup is attempted and bounded;
- malformed, oversized, or identity-mismatched result artifacts fail closed; and
- production statement and branch coverage and public docstring coverage remain 100 percent.

## Residual risks and next slices

Before treating this boundary as release-grade, the repository must also retain:

- independent exact-head review and required GitHub checks;
- image signature, vulnerability, and provenance verification in the trusted workflow;
- a real no-network smoke test of the digest-pinned image;
- operator documentation for image rotation and incident response;
- evidence retention with exact workflow/run/source bindings; and
- rollback behavior when image verification or sandbox execution becomes unavailable.

## References

Open Container Initiative. (2025, November 4). *OCI runtime-spec v1.3.0 release notice*. https://opencontainers.org/release-notices/v1-3-0-runtime-spec/

SLSA Community. (2025). *SLSA specification (Version 1.2)*. The Linux Foundation. https://slsa.dev/spec/v1.2/

Souppaya, M., Morello, J., & Scarfone, K. (2017). *Application container security guide* (NIST Special Publication 800-190). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-190

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
