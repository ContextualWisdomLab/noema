# Doctoring record: patch-validator image

## Record status

- **Decision date:** 2026-08-06
- **Scope:** pull-request build and verification of Noema's repository-owned patch-validator image
- **Related implementation:** `Dockerfile.patch-validator`, `.github/workflows/patch-validator-image.yml`, `patch-validator/`, `reviewer/noema_reviewer/patch_image_validation.py`, and receipt-verification scripts
- **Related issues and PRs:** #9, #27, #29, #65, #66, #67
- **Release claim:** none
- **Production activation claim:** none

This record distinguishes source-supported requirements, measured repository evidence, project decisions, assumptions, and future work. It must not be read as a claim that a registry image has been published, signed, attested, activated, released, or deployed.

## Problem statement

PR #65 establishes a host-side boundary that authenticates an exact Git source, rejects unsafe patch syntax and objects, materializes a bounded committed snapshot, and accepts only bounded structured output from an isolated validator. That boundary still needs an image implementation whose contents and execution contract can be reviewed independently.

The immediate problem is narrower than production publication: demonstrate that one exact pull-request head can build and execute a credential-free validator image under a reproducible, least-privileged, fail-closed verification process without conflating local verification with signature, provenance, independent approval, protected merge, release, or deployment authority.

## Evidence classification

### Measured repository evidence

The pull-request workflow and tests measure or enforce:

- exact pull-request head checkout;
- live-head equality before and after verification;
- clean-worktree equality;
- immutable Dockerfile frontend, builder, and runtime references;
- Distroless runtime signature verification;
- numeric non-root runtime identity;
- fixed exec-form entrypoint;
- denied shell and package-manager paths in the exported final image;
- no-network, read-only, capability-dropped, seccomp-constrained smoke execution;
- bounded CPU, memory, swap, PID, descriptor, process, core, file-size, tmpfs, and wall-time resources;
- read-only source and patch mounts plus one writable result file;
- exact source, patch, profile, command-profile, and image-digest result binding;
- CycloneDX SBOM generation;
- final-image Trivy failure for detected unfixed MEDIUM, HIGH, or CRITICAL vulnerabilities; and
- production statement, branch, and public-docstring coverage gates.

A successful workflow run proves only the exact workflow run, source head, local image content identity, selected receipts, and tested runtime boundary. It does not prove registry publication or future operational controls.

### Source-supported requirements

The external sources support these general requirements:

- OCI image configuration, content-addressed manifests, and platform metadata should be represented according to the OCI Image Specification.
- Container execution should use a defined runtime configuration and explicit isolation controls consistent with the OCI Runtime Specification and NIST container-security guidance.
- Secure development should protect build integrity, review changes, verify third-party components, and retain evidence consistent with NIST SSDF practices.
- Build provenance should be generated and verified separately from source review and artifact execution; SLSA provides the vocabulary for that future publication stage.
- Artifact signatures and attestations require subject, issuer, identity, and workflow verification; a successful command or status alone is insufficient.
- SBOM and vulnerability evidence must be bound to the artifact actually consumed.

### Project decisions

Noema makes the following stricter decisions for this slice:

1. **PR verification is read-only.** The workflow has `contents: read` and no package, OIDC, attestation, model, reviewer, release, or deployment credential.
2. **No mutable image identity is accepted as evidence.** Dockerfile frontend and base images are digest-pinned. The PR receipt records a local image ID, not a mutable tag.
3. **Live-head equality is checked twice.** Concurrency cancellation alone is not trusted to prevent stale evidence.
4. **The runtime is Distroless and numeric non-root.** A shell or package manager is unnecessary for the fixed Node profile.
5. **Commands are image-owned.** Callers select an enum profile and cannot supply shell text.
6. **Control-plane files are outside the patch language.** Dependency, lockfile, configuration, reviewer, validator, Dockerfile, and GitHub workflow changes require ordinary review and image rebuild rather than self-validation inside the same image.
7. **Canonical create and delete remain supported.** Matching `new file mode` and `deleted file mode` metadata for regular `100644` and `100755` files are accepted; symlink, gitlink, rename, copy, and standalone mode changes remain rejected.
8. **Evidence planes remain separate.** Check runs, commit statuses, review evidence, model judgement, independent approval, provenance, release acceptance, and deployment evidence are not interchangeable.
9. **No publication claim is made.** Local image verification is intentionally separated from a future main-only registry publication and digest-lock activation flow.

## Standards mapping

| Noema control | Source rationale | Current evidence |
|---|---|---|
| Digest-pinned build inputs | OCI content-addressed artifact identity; SSDF supply-chain integrity | Dockerfile contract tests and exact source labels |
| Numeric non-root, read-only runtime | NIST container least privilege and attack-surface reduction | Image metadata verifier and real Docker smoke |
| No network and no Docker socket | NIST container isolation and credential separation | Docker flags and workflow contract tests |
| Capability drop, seccomp, no-new-privileges | Container runtime hardening | Real smoke command and static workflow tests |
| Exact source revision label | OCI annotations and build traceability | Metadata receipt cross-check |
| CycloneDX SBOM | Machine-readable component inventory | Trivy-generated `image-sbom.cdx.json` and verifier |
| Vulnerability failure gate | SSDF component-risk response | Trivy final-image gate |
| Future signature verification | Sigstore identity and subject verification | Not implemented for repository-owned image in this slice |
| Future provenance | SLSA provenance model | Not implemented in this slice |
| Double live-head refusal | Project fail-closed exact-head policy | GitHub API equality before and after verification |

## OCI image decision

The Dockerfile uses an immutable frontend directive and digest-pinned base images. The final image records source, revision, license, title, description, and documentation labels.

The OCI Image Specification defines image manifests, configurations, layers, platform identity, and annotations. Noema uses those concepts for static image metadata and future registry-subject binding. The local Docker image ID used in PR verification is explicitly not described as a registry digest or provenance record.

## OCI runtime and NIST container-security decision

The fixed profile does not require a shell, package manager, Git client, network, privileged capabilities, or a writable root filesystem. Removing those capabilities is a project implementation of least privilege and attack-surface reduction.

The runtime controls include:

- non-root numeric identity;
- read-only root filesystem;
- no network;
- all capabilities dropped;
- no-new-privileges;
- built-in seccomp;
- isolated IPC;
- bounded process and resource limits;
- read-only input mounts; and
- one pre-created writable result file.

These controls reduce impact but do not prove complete kernel isolation. Docker daemon, host kernel, runner image, and hosted-runner policy remain part of the trusted computing base for this slice.

## NIST SSDF decision

NIST SP 800-218 supports protecting software, producing well-secured software, responding to vulnerabilities, and maintaining traceable development practices. Noema maps that guidance to:

- test-first security regressions;
- immutable external action and build-input references;
- dependency installation without lifecycle scripts in image construction;
- final-image vulnerability scanning;
- explicit current-head refusal;
- bounded evidence retention;
- independent approval and protected-merge requirements outside the validator; and
- documented residual risk and rollback.

The use of 100 percent production statement and branch coverage is a project quality gate, not a claim that coverage proves correctness or security.

## CycloneDX decision

CycloneDX JSON is selected for the PR image SBOM because Trivy can generate it directly from the final image and the receipt verifier can validate a bounded, machine-readable component array and specification version.

The verifier currently accepts CycloneDX versions 1.5, 1.6, and 1.7 to tolerate scanner output while the publication baseline is stabilized. CycloneDX 1.7 is the preferred documentation baseline for new publication work.

This slice verifies format and bounded component inventory. A future publication stage must additionally bind the SBOM attestation to the exact registry digest and verify the attestation issuer and workflow identity.

## Trivy decision

The PR workflow uses Trivy 0.73.0 and scans the final local image. It fails when Trivy detects an unfixed MEDIUM, HIGH, or CRITICAL vulnerability under the configured scanner policy.

This is a defined gate, not a claim that the image contains no vulnerabilities. Results depend on the vulnerability database, package detection, vendor severity data, scan time, and configured handling of unfixed findings. The retained JSON receipt enables later review of what was scanned and under which policy.

## Sigstore and GitHub attestation decision

The current workflow verifies the signature of the pinned upstream Distroless runtime. It does not sign the repository-owned local image.

A future main-only publication stage must:

1. push an exact registry digest;
2. sign that digest;
3. verify the exact subject, issuer, repository, workflow identity, and expected GitHub-hosted builder policy;
4. attach SBOM and provenance attestations to the same digest; and
5. retain bounded verification receipts.

Neither a `CodeRabbit` commit status, a model comment, a successful smoke, nor a signature can substitute for an eligible independent GitHub approval or enforceable branch rules.

## SLSA decision

SLSA 1.2 is used as the provenance vocabulary for future publication. This slice does not claim a SLSA build level because it does not publish a registry subject or produce and independently verify repository-owned provenance.

Future provenance must bind at least:

- repository and exact source commit;
- workflow path and immutable workflow source;
- GitHub Actions issuer and builder identity;
- build platform and parameters;
- base-image and final-image digests;
- SBOM digest;
- vulnerability and smoke receipts; and
- publication run identity.

The activation PR must consume an immutable digest verified against those records. A mutable tag is insufficient.

## Stale-head threat model

### Threat

A workflow begins on head A, another run pushes head B, and the old workflow later reports success. Without a live comparison, observers may misread A's evidence as evidence for B.

### Controls

- exact event head captured as `SOURCE_SHA`;
- checkout by exact SHA without persisted credentials;
- checkout and clean-worktree verification;
- live pull-request head lookup before verification;
- live pull-request head lookup after verification;
- equality required in both places; and
- concurrency cancellation to reduce wasted work.

### Residual risk

The GitHub API and event payload are trusted sources. API unavailability, malformed output, permission failure, or mismatched head causes failure rather than fallback. Manual dispatch has no PR number and therefore proves the selected ref only; it must not be represented as live-PR-head evidence.

## Credential boundary

The untrusted image receives only bounded, non-secret request identity and paths required for validation. It does not receive:

- repository write credentials;
- GitHub App private keys or installation tokens;
- `GITHUB_TOKEN`;
- reviewer/model credentials;
- `NVIDIA_NIM_API_KEY`;
- Cloudflare credentials;
- package credentials;
- OIDC request tokens;
- release or deployment credentials; or
- the Docker socket.

The workflow's read-only GitHub token is used by the trusted host step only to compare the live PR head. It is not passed into the container environment, arguments, files, or mounts.

## Interoperability and modularity

The image contract is repository-independent at the request schema level while Noema currently restricts the trusted image repository and first profile. It preserves:

- standalone Noema operation;
- an explicit structured request/result boundary;
- replaceable build and registry stages;
- integration with `ContextualWisdomLab/.github`, `naruon`, contextual-orchestrator, and other CWL services through evidence rather than shared mutable state; and
- separation between validator evidence and model/reviewer authority.

No database object is introduced by this slice.

## Alternatives considered

### Run validation directly on the credential-bearing host

Rejected. Repository, model, publication, or deployment credentials would share a process and filesystem boundary with untrusted patch execution.

### Allow caller-provided shell commands

Rejected. Command injection and unconstrained tools would make the image contract non-reviewable and undermine evidence comparability.

### Use a mutable image tag

Rejected. A tag can move after review and cannot bind evidence to one consumed artifact.

### Publish from the pull-request workflow

Rejected. Untrusted PR code and PR-selected workflow changes must not receive package or OIDC publication authority.

### Treat concurrency cancellation as sufficient stale-head protection

Rejected. Cancellation is asynchronous and operational; explicit live-head equality is the fail-closed security decision.

### Claim provenance from local build metadata

Rejected. Local labels and image IDs provide traceability evidence but are not signed registry-subject provenance.

## Residual risks and open gates

- PR #65 must merge before this stacked slice can be retargeted and revalidated.
- Issue #27 must establish enforceable `main` rules and independently reviewed break-glass controls.
- Issue #29 must provision the separate Reviewer and Maintainer App identities.
- Issue #66 remains open for main-only publication, signature, SBOM/provenance attestations, digest-lock activation, and end-to-end reviewer integration.
- Production KPI, revenue, transfer, release, and deployment evidence remain separate acquisition-readiness gates.
- Linux/amd64 is the only verified platform in this slice; multi-architecture parity is not claimed.
- Hosted-runner, Docker daemon, base image, vulnerability database, and GitHub API trust remain external dependencies.

## Verification record requirements

Before describing an exact head as verified, retain or link:

- exact PR head and base;
- terminal successful `ci` and `reviewer-ci` runs;
- terminal successful `patch-validator-image` run;
- exact workflow source;
- local image metadata and content ID;
- Distroless signature-verification output;
- final-image vulnerability receipt;
- CycloneDX SBOM;
- exact-bound smoke result;
- cross-receipt verification result;
- zero unresolved current review threads; and
- explicit statement that CodeRabbit status or model output is not independent approval.

Do not treat queued, pending, skipped, cancelled, rate-limited, status-only, or stale-head evidence as success.

## References

CycloneDX. (2026). *CycloneDX JSON reference: Version 1.7*. https://cyclonedx.org/docs/1.7/json/

GitHub, Inc. (2026). *Using artifact attestations to establish provenance for builds*. GitHub Docs. https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds

National Institute of Standards and Technology. (2017). *Application container security guide* (NIST Special Publication 800-190). U.S. Department of Commerce. https://doi.org/10.6028/NIST.SP.800-190

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). U.S. Department of Commerce. https://doi.org/10.6028/NIST.SP.800-218

Open Container Initiative. (2024). *OCI image format specification* (Version 1.1.1). https://specs.opencontainers.org/image-spec/?v=v1.1.1

Open Container Initiative. (2025). *OCI runtime specification* (Version 1.3.0). https://specs.opencontainers.org/runtime-spec/?v=v1.3.0

Sigstore. (2026). *Verifying signatures with Cosign*. https://docs.sigstore.dev/cosign/verifying/verify/

Supply-chain Levels for Software Artifacts. (2025). *SLSA specification* (Version 1.2). https://slsa.dev/spec/v1.2/

Trivy. (2026). *Container image scanning*. Aqua Security. https://trivy.dev/latest/docs/target/container_image/
